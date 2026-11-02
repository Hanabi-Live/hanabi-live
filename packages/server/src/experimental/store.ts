import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { SliceRecord } from "./protocol";
import { validateRecord } from "./protocol";

export interface SliceStore {
  load: (id: string) => Promise<SliceRecord | undefined>;
  save: (record: SliceRecord, previousRevision: number) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Explicit experimental namespace; nothing here writes Go games, actions, participants or history.
 * The session lock excludes another owner for this namespace across processes. Tables still have
 * independent queues and use the other two connections for bounded leaf storage operations.
 */
export async function openStore(sql: postgres.Sql): Promise<SliceStore> {
  try {
    return await initializeStore(sql);
  } catch (error) {
    await sql.end({ timeout: 3 });
    throw error;
  }
}

async function initializeStore(sql: postgres.Sql): Promise<SliceStore> {
  // Warm the connection before reserving it (also works with fetch_types disabled).
  await sql`SELECT 1`;
  const owner = await sql.reserve();
  const locks = await owner<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_lock(1937006963, 1) AS acquired
  `;
  if (locks[0]?.acquired !== true) {
    owner.release();
    throw new Error("The experimental namespace already has an owner.");
  }
  const epoch = randomUUID();
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS ts_slice_v1`;
    await sql`
      CREATE TABLE IF NOT EXISTS ts_slice_v1.active (
        id text PRIMARY KEY, revision integer NOT NULL, data jsonb NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS ts_slice_v1.completed (
        id text PRIMARY KEY, revision integer NOT NULL, data jsonb NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS ts_slice_v1.owner (
        singleton boolean PRIMARY KEY CHECK (singleton), epoch text NOT NULL
      )
    `;
    await sql`
      INSERT INTO ts_slice_v1.owner (singleton, epoch) VALUES (true, ${epoch})
      ON CONFLICT (singleton) DO UPDATE SET epoch = EXCLUDED.epoch
    `;
  } catch (error) {
    owner.release();
    throw error;
  }
  return {
    async load(id) {
      const current = await sql`
        SELECT epoch FROM ts_slice_v1.owner WHERE singleton AND epoch = ${epoch}
      `;
      if (current.length !== 1) {
        throw new Error(
          "Experimental owner was fenced by a reconstructed host.",
        );
      }
      const rows = await sql<Array<{ data: unknown }>>`
        SELECT data FROM ts_slice_v1.active WHERE id = ${id}
        UNION ALL
        SELECT data FROM ts_slice_v1.completed WHERE id = ${id}
      `;
      if (rows.length > 1) {
        throw new Error("Experimental active/completed ownership conflict.");
      }
      const row = rows[0];
      return row === undefined ? undefined : validateRecord(row.data);
    },
    async save(record, previousRevision) {
      validateRecord(record);
      if (record.revision !== previousRevision + 1) {
        throw new Error("Invalid experimental revision.");
      }
      await sql.begin(async (transaction) => {
        await transaction`SET LOCAL statement_timeout = '2s'`;
        await transaction`SET LOCAL lock_timeout = '2s'`;
        // Shared row locks allow unrelated table transactions to proceed concurrently, but fence an
        // old process if its advisory-lock connection was lost and another host took ownership.
        const current = await transaction`
          SELECT epoch FROM ts_slice_v1.owner
          WHERE singleton AND epoch = ${epoch} FOR SHARE
        `;
        if (current.length !== 1) {
          throw new Error(
            "Experimental owner was fenced by a reconstructed host.",
          );
        }
        if (previousRevision > 0) {
          const removed = await transaction`
            DELETE FROM ts_slice_v1.active
            WHERE id = ${record.id} AND revision = ${previousRevision}
            RETURNING id
          `;
          if (removed.length !== 1) {
            throw new Error("Experimental checkpoint revision conflict.");
          }
        } else {
          const existing = await transaction`
            SELECT id FROM ts_slice_v1.completed WHERE id = ${record.id}
          `;
          if (existing.length > 0) {
            throw new Error("Experimental game already completed.");
          }
        }
        if (record.state !== undefined && record.state.end !== 0) {
          await transaction`
            INSERT INTO ts_slice_v1.completed (id, revision, data)
            VALUES (${record.id}, ${record.revision}, ${transaction.json(record)})
          `;
        } else {
          await transaction`
            INSERT INTO ts_slice_v1.active (id, revision, data)
            VALUES (${record.id}, ${record.revision}, ${transaction.json(record)})
          `;
        }
      });
    },
    async close() {
      // Closing the dedicated pool releases the session lock, even if its socket was lost. Do not
      // issue SQL on a reserved connection after a transport failure.
      owner.release();
      await sql.end({ timeout: 3 });
    },
  };
}
