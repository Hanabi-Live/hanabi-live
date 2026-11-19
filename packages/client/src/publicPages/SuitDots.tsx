// A dot in the color of each suit of a variant, so that a list of games can be scanned for variants
// without reading their names.

import type { Suit } from "@hanabi-live/game";

export function SuitDots({
  suits,
  size = "0.6em",
}: {
  readonly suits: readonly Suit[];
  /** The width of each dot. */
  readonly size?: string;
}): React.JSX.Element {
  return (
    <span aria-hidden className="tw:flex tw:shrink-0 tw:gap-0.5">
      {suits.map((suit) => (
        <span
          className="tw:rounded-full tw:ring-1 tw:ring-white/25"
          key={suit.name}
          style={{
            width: size,
            height: size,
            background:
              suit.fill
              ?? `linear-gradient(135deg, ${suit.fillColors.join(", ")})`,
          }}
        />
      ))}
    </span>
  );
}
