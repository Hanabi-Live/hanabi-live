// Each scripted player must wait for the preceding authoritative turn.
/* eslint-disable no-await-in-loop */
import { assertDefined } from "complete-common";
import type { Card } from "./engine";
import { standardDeck } from "./engine";
import type { connectClient, SliceResponse } from "./evaluationSupport";

type Client = Awaited<ReturnType<typeof connectClient>>;
export const supportedOptions = {
  numPlayers: 2,
  variantName: "No Variant",
} as const;

/** A legal 50-card test deck; each alternating actor receives its next needed card in time. */
export function winningDeck(): readonly Card[] {
  const sequence = Array.from({ length: 25 }, (_, index) => ({
    suitIndex: Math.floor(index / 5),
    rank: (index % 5) + 1,
  }));
  const remaining = [...standardDeck()];
  for (const card of sequence) {
    const index = remaining.findIndex(
      (other) => other.suitIndex === card.suitIndex && other.rank === card.rank,
    );
    remaining.splice(index, 1);
  }
  return [
    ...sequence.slice(0, 10).filter((_, index) => index % 2 === 0),
    ...sequence.slice(0, 10).filter((_, index) => index % 2 === 1),
    ...sequence.slice(10),
    ...remaining,
  ];
}

export async function createGame(
  clients: readonly [Client, Client],
): Promise<{ tableID: string; joined: SliceResponse }> {
  const created = await clients[0].request({
    type: "create",
    options: supportedOptions,
  });
  assertDefined(created.tableID, "Creation did not return a table ID.");
  const joined = await clients[1].request({
    type: "join",
    tableID: created.tableID,
  });
  if (joined.type !== "ok") {
    throw new Error(`Join failed: ${joined.error}`);
  }
  return { tableID: created.tableID, joined };
}

export async function finishWinningGame(
  clients: readonly [Client, Client],
  tableID: string,
  observe: (milliseconds: number) => void = () => undefined,
): Promise<SliceResponse> {
  const deck = winningDeck();
  let last: SliceResponse | undefined;
  for (let turn = 0; turn < 25; turn++) {
    const client = clients[turn % 2];
    assertDefined(client, "Missing scripted player.");
    const order = deck.findIndex(
      (card) =>
        card.suitIndex === Math.floor(turn / 5) && card.rank === (turn % 5) + 1,
    );
    const start = performance.now();
    last = await client.request(
      { type: "act", tableID, move: { type: "play", order } },
      `play-${turn}`,
    );
    observe(performance.now() - start);
    if (last.type !== "ok") {
      throw new Error(`Scripted action failed: ${last.error}`);
    }
  }
  assertDefined(last, "No scripted actions.");
  if (last.state?.score !== 25 || last.state.end !== 1) {
    throw new Error("Scripted game did not complete successfully.");
  }
  return last;
}
