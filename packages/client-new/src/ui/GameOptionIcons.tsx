import type { Options } from "@hanabi-live/game";
import { optionFlags } from "./GameDialog";

const icons = [
  "sync-alt",
  "blind",
  "expand",
  "plus-circle",
  "minus-circle",
  "layer-group",
  "chess-knight",
] as const;

export function GameOptionIcons({
  options,
}: {
  options: Pick<
    Options,
    | (typeof optionFlags)[number][0]
    | "timed"
    | "speedrun"
    | "timeBase"
    | "timePerTurn"
  >;
}) {
  if (
    !options.timed
    && !options.speedrun
    && optionFlags.every(([key]) => !options[key])
  ) {
    return null;
  }
  return (
    <>
      {options.timed && (
        <i
          aria-label="Timed"
          className="fas fa-clock"
          title={`Timed: ${options.timeBase / 60} minute${options.timeBase === 60 ? "" : "s"} + ${options.timePerTurn} second${options.timePerTurn === 1 ? "" : "s"} per turn`}
        />
      )}
      {options.speedrun && (
        <i aria-label="Speedrun" className="fas fa-running" title="Speedrun" />
      )}
      {optionFlags.map(
        ([key, title], index) =>
          options[key] && (
            <i
              aria-label={title}
              className={`fas fa-${icons[index]}`}
              key={key}
              title={title}
            />
          ),
      )}
    </>
  );
}
