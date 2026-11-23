// @vitest-environment jsdom

import { gameIdSchema } from "@hanabi-live/data";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { BestScoresTable } from "./BestScoresTable.tsx";

afterEach(cleanup);

test("a max score stands out, and a score with an option does not count", () => {
  render(
    <BestScoresTable
      table={{
        type: "bestScores",
        rows: [
          {
            recipe: "r-y-g-b-p",
            variantName: "No Variant",
            maxScore: 25,
            scores: [
              {
                numPlayers: 3,
                score: 25,
                gameId: gameIdSchema.parse(123),
              },
              {
                numPlayers: 4,
                score: 21,
              },
            ],
          },
          {
            recipe: "r-y-g-b-p-bk",
            variantName: "Black (6 Suits)",
            maxScore: 30,
            scores: [
              {
                numPlayers: 3,
                score: 30,
                modifier: "oneExtraCard",
              },
            ],
          },
        ],
      }}
    />,
  );

  const noVariant = screen.getByRole("row", { name: /^No Variant/u });
  const cells = noVariant.querySelectorAll("td");
  expect([...cells].map((cell) => cell.textContent)).toEqual([
    "\u{2013}",
    "25",
    "21",
    "\u{2013}",
  ]);
  expect(cells[1]?.querySelector(".tw\\:bg-green")).not.toBe(null);
  // A score links to the game that set it, when the server knows it.
  expect(cells[1]?.querySelector("a")?.getAttribute("href")).toBe(
    "/replay/123",
  );
  expect(cells[2]?.querySelector("a")).toBe(null);
  expect(cells[2]?.querySelector(".tw\\:bg-green")).toBe(null);

  const black = screen.getByRole("row", { name: /^Black/u });
  expect(black.querySelector(".tw\\:bg-green")).toBe(null);

  // Only No Variant counts as a max score with 3 players.
  const header = screen.getByRole("columnheader", { name: /^3p/u });
  expect(header.textContent).toMatch(/^3p1\//u);
});
