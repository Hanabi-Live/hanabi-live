import { timerFormatter } from "@hanabi-live/data";
import type { Options } from "@hanabi-live/game";
import { Fragment } from "react";
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

type IconOptions = Pick<
  Options,
  | (typeof optionFlags)[number][0]
  | "timed"
  | "speedrun"
  | "timeBase"
  | "timePerTurn"
>;

export function hasOptions(options: IconOptions): boolean {
  return (
    options.timed
    || options.speedrun
    || optionFlags.some(([key]) => options[key])
  );
}

export function GameOptionIcons({ options }: { options: IconOptions }) {
  if (!hasOptions(options)) {
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
      )}{" "}
      {options.speedrun && (
        <li>
          <i
            aria-label="Speedrun"
            className="fas fa-running"
            title="Speedrun"
          />
        </li>
      )}{" "}
      {optionFlags.map(
        ([key, title], index) =>
          options[key] && (
            <Fragment key={key}>
              <li>
                <i
                  aria-label={title}
                  className={`fas fa-${icons[index]}`}
                  title={title}
                />
              </li>{" "}
            </Fragment>
          ),
      )}
    </>
  );
}
