import { timerFormatter } from "@hanabi-live/data";
import type { Options } from "@hanabi-live/game";
import { optionFlags } from "./GameDialog";

const icons = [
  "sync-alt",
  "blind",
  "expand",
  "plus-circle",
  "minus-circle",
  "layer-group",
  "flushed",
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
        <li>
          <i
            aria-label="Timed"
            className="fas fa-clock"
            title={`Timed: ${options.timeBase / 60} minute${options.timeBase === 60 ? "" : "s"} + ${options.timePerTurn} second${options.timePerTurn === 1 ? "" : "s"} per turn`}
          />
          {"\u{A0}"} ({timerFormatter(options.timeBase)} +{" "}
          {timerFormatter(options.timePerTurn)})
        </li>
      )}
      {options.speedrun && (
        <li>
          <i
            aria-label="Speedrun"
            className="fas fa-running"
            title="Speedrun"
          />
        </li>
      )}
      {optionFlags.map(
        ([key, title], index) =>
          options[key] && (
            <li key={key}>
              <i
                aria-label={title}
                className={`fas fa-${icons[index]}`}
                title={title}
              />
            </li>
          ),
      )}
    </>
  );
}
