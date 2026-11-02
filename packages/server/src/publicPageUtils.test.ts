import { describe, expect, test } from "@jest/globals";
import {
  formatDateJoined,
  formatDecimal,
  formatDuration,
  formatPercentage,
  getScoreSummary,
} from "./publicPageUtils";

describe("Go public-page formatting", () => {
  test.each([
    [20.25, "20.2"],
    [20.75, "20.8"],
    [0.15, "0.1"],
    [0.35, "0.3"],
  ])("rounds %s like Go's decimal formatter", (value, expected) => {
    expect(formatDecimal(value)).toBe(expected);
  });
  test.each([
    [0, "0 seconds"],
    [1, "1 second"],
    [59, "59 seconds"],
    [60, "1 minute"],
    [90, "2 minutes"],
    [3599, "60 minutes"],
    [3600, "1 hour and 0 minutes"],
    [86_400, "24 hours and 0 minutes"],
    [90_060, "1 day, 1 hour, and 1 minute"],
    [172_800, "1 day, 24 hours, and 0 minutes"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
  test.each([
    [1, 3, "33.3"],
    [0, 0, "0"],
    [1, 1, "100"],
    [1, 8, "12.5"],
  ])("formats percentage %s/%s", (numerator, denominator, expected) => {
    expect(formatPercentage(numerator, denominator)).toBe(expected);
  });
  test.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [31, "31st"],
  ])("formats date suffix %s", (day, expected) => {
    const date = new Date(Date.UTC(2020, 0, day));
    expect(formatDateJoined(date)).toBe(`January ${expected}, 2020`);
  });
  test("fills missing derived stats and counts perfect modified scores like Go", () => {
    const stats = getScoreSummary(
      new Map([
        [
          0,
          {
            numGames: 3,
            numStrikeouts: 1,
            averageScore: 20,
            bestScores: [2, 3, 4, 5, 6].map((numPlayers) => ({
              numPlayers,
              score: 25,
              modifier: 4,
            })),
          },
        ],
      ]),
    );
    expect(stats.total).toBe(5);
    expect(stats.rows.find((row) => row.id === 0)).toMatchObject({
      averageScore: "20.0",
      strikeoutRate: "33.3",
    });
    expect(stats.rows.find((row) => row.id === 1)).toMatchObject({
      numGames: 0,
      averageScore: "-",
      strikeoutRate: "-",
    });
    expect(getScoreSummary(new Map()).total).toBe(0);
  });
});
