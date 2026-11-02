// Opt in: HANABI_TEST_DATABASE_URL='...' npx tsx packages/server/src/experimental/evaluate.ts
// Creates/drops its own database and loopback host; stdout is one JSON measurement report. Each
// lane is sequential; independent lanes run concurrently.
/* eslint-disable no-await-in-loop */
import { assertDefined } from "complete-common";
import { createHash } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { compatibilityCorpus } from "./compatibility";
import { connectClient, evaluationDatabase } from "./evaluationSupport";
import { startHost } from "./host";
import { createGame, finishWinningGame, winningDeck } from "./scenarios";
import { openStore } from "./store";

function summarize(samples: readonly number[]) {
  const sorted = samples.toSorted((a, b) => a - b);
  return {
    count: sorted.length,
    p50Milliseconds: sorted[Math.floor(sorted.length * 0.5)],
    p95Milliseconds: sorted[Math.floor(sorted.length * 0.95)],
    maxMilliseconds: sorted.at(-1),
  };
}

async function evaluate() {
  const database = await evaluationDatabase();
  let host: Awaited<ReturnType<typeof startHost>> | undefined;
  const clients = new Set<Awaited<ReturnType<typeof connectClient>>>();
  const loop = monitorEventLoopDelay({ resolution: 10 });
  const memoryStart = process.memoryUsage();
  let peakRSS = memoryStart.rss;
  const sampler = setInterval(() => {
    peakRSS = Math.max(peakRSS, process.memoryUsage().rss);
  }, 10);
  loop.enable();
  const actionLatency: number[] = [];
  const replayLatency: number[] = [];
  const reconnectLatency: number[] = [];
  const completed: Array<{ id: string; user: string }> = [];
  try {
    host = await startHost(await openStore(database.connect()), winningDeck);
    const running = host;
    const start = performance.now();
    await Promise.all(
      Array.from({ length: 4 }, async (_, lane) => {
        for (let game = 0; game < 2; game++) {
          const user = `Alice-${lane}-${game}`;
          const alice = await connectClient(running.url, running.session(user));
          const bob = await connectClient(
            running.url,
            running.session(`Bob-${lane}-${game}`),
          );
          clients.add(alice);
          clients.add(bob);
          const { tableID } = await createGame([alice, bob]);
          await finishWinningGame([alice, bob], tableID, (elapsed) => {
            actionLatency.push(elapsed);
          });
          completed.push({ id: tableID, user });
          await Promise.all([alice.close(), bob.close()]);
          clients.delete(alice);
          clients.delete(bob);
        }
      }),
    );
    const gameplayMilliseconds = performance.now() - start;
    await host.close();
    host = undefined;
    host = await startHost(await openStore(database.connect()));
    const recovered = host;
    const readStart = performance.now();
    await Promise.all(
      completed.map(async ({ id, user }) => {
        const token = recovered.session(user);
        const replayClient = await connectClient(recovered.url, token);
        clients.add(replayClient);
        await Promise.all([
          (async () => {
            for (let i = 0; i < 20; i++) {
              const started = performance.now();
              const response = await replayClient.request({
                type: "replay",
                tableID: id,
              });
              if (response.replay?.state.score !== 25) {
                throw new Error("Persisted replay diverged.");
              }
              replayLatency.push(performance.now() - started);
            }
          })(),
          (async () => {
            for (let i = 0; i < 10; i++) {
              const started = performance.now();
              const connection = await connectClient(recovered.url, token);
              clients.add(connection);
              const response = await connection.request({
                type: "reconnect",
                tableID: id,
              });
              assertDefined(
                response.state,
                "Reconnect omitted authoritative state.",
              );
              if (
                response.state.hands[0]?.some((card) => card.rank !== -1)
                === true
              ) {
                throw new Error("Reconnect leaked a private hand.");
              }
              await connection.close();
              clients.delete(connection);
              reconnectLatency.push(performance.now() - started);
            }
          })(),
        ]);
        await replayClient.close();
        clients.delete(replayClient);
      }),
    );
    const readMilliseconds = performance.now() - readStart;
    return {
      schema: "ts-slice-evaluation-v1",
      node: process.version,
      initialDeckSHA256: createHash("sha256")
        .update(JSON.stringify(winningDeck()))
        .digest("hex"),
      scope:
        "Local PostgreSQL + loopback WebSockets, server AND scripted clients in one process; not a language-only or production-capacity benchmark.",
      comparison:
        "TestStandardSliceEvaluation uses the same deck digest and operation counts but the fuller Go command/replay lifecycle; consult its differences before comparing.",
      resources: { workConnections: 2, reservedOwnershipConnections: 1 },
      workload: {
        concurrentGameLanes: 4,
        completedGames: completed.length,
        acceptedActions: actionLatency.length,
        replays: replayLatency.length,
        reconnects: reconnectLatency.length,
      },
      gameplayMilliseconds,
      gameplayActionsPerSecond:
        (actionLatency.length * 1000) / gameplayMilliseconds,
      readMilliseconds,
      mixedReadsPerSecond:
        ((replayLatency.length + reconnectLatency.length) * 1000)
        / readMilliseconds,
      latency: {
        durableAction: summarize(actionLatency),
        persistedReplay: summarize(replayLatency),
        websocketReconnectIncludingHandshakeAndClose:
          summarize(reconnectLatency),
      },
      memoryBytes: {
        start: memoryStart,
        end: process.memoryUsage(),
        sampledPeakRSS: peakRSS,
      },
      eventLoopDelayMilliseconds: {
        p50: loop.percentile(50) / 1e6,
        p95: loop.percentile(95) / 1e6,
        max: loop.max / 1e6,
      },
      compatibility: compatibilityCorpus().map(({ fixture, reasons }) => ({
        fixture: fixture.input.name,
        status:
          reasons.length === 0 ? "covered-by-slice.test.ts" : "unsupported",
        reasons,
      })),
      exclusions: [
        "Go legacy RNG generation",
        "spectator/shadow views",
        "notes/chat/tags/statistics",
        "clocks/timeouts",
        "variants/options beyond two-player No Variant",
        "production authentication/routing/UX",
        "language-only performance and maintenance-cost conclusions",
      ],
    };
  } finally {
    clearInterval(sampler);
    loop.disable();
    await Promise.all(
      [...clients].map(async (client) => {
        await client.close();
      }),
    );
    await host?.close();
    await database.close();
  }
}

evaluate()
  .then((result) => {
    console.log(JSON.stringify(result, undefined, 2));
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
