// The achievements on a player's profile: what each one asks for, and how far the player has come.

import type { publicPageTableSchema } from "@hanabi-live/data";
import type * as z from "zod";

type ScoresTable = Extract<
  z.infer<typeof publicPageTableSchema>,
  { type: "scores" }
>;
type Achievement = ScoresTable["achievements"][number];

function unlockedText(date: string): string {
  const unlocked = new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Unlocked on ${unlocked}.`;
}

function AchievementCard({
  achievement,
}: {
  readonly achievement: Achievement;
}): React.JSX.Element {
  const { dateUnlocked, description, goal, name, progress } = achievement;
  const unlocked = dateUnlocked !== undefined;
  return (
    <div className="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:bg-surface-panel tw:p-3">
      <div
        className={`tw:flex tw:size-12 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:text-[1.4em] ${unlocked ? "tw:bg-[var(--button-primary-bg)] tw:text-text-on-accent" : "tw:bg-border tw:text-text-label"}`}
      >
        <i aria-hidden="true" className="fas fa-trophy" />
      </div>
      <div className="tw:min-w-0 tw:flex-1">
        <div className="tw:font-semibold">{name}</div>
        <div className="tw:text-[0.85em] tw:leading-snug tw:text-text-label">
          {description}
        </div>
        {unlocked ? (
          <div className="tw:mt-1 tw:text-[0.85em] tw:text-green-text">
            {unlockedText(dateUnlocked)}
          </div>
        ) : (
          <div className="tw:mt-1.5 tw:flex tw:items-center tw:gap-2">
            <div
              aria-label={name}
              aria-valuemax={goal}
              aria-valuemin={0}
              aria-valuenow={progress}
              className="tw:h-1.5 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-border"
              role="progressbar"
            >
              <div
                className="tw:h-full tw:rounded-full tw:bg-green-text"
                style={{ width: `${(progress * 100) / goal}%` }}
              />
            </div>
            <span className="tw:text-[0.85em] tw:text-text-label tw:tabular-nums">
              {progress} / {goal}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Achievements({
  achievements,
}: {
  readonly achievements: readonly Achievement[];
}): React.JSX.Element {
  return (
    <section className="tw:mb-6">
      <h3>Achievements</h3>
      <div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(min(100%,20em),1fr))] tw:gap-3">
        {achievements.map((achievement) => (
          <AchievementCard achievement={achievement} key={achievement.id} />
        ))}
      </div>
    </section>
  );
}
