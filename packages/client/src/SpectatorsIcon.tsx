/**
 * The symbol for spectators across the site: two eyes side by side. It is as tall as the text, like
 * a Font Awesome icon. The lobby's spectate cursors ("public/img/cursors/spectate.svg" and
 * "un-shadow.svg") draw the same shape.
 *
 * Beside a player's name, it means that a spectator views the game as that player.
 *
 * Do not use `fa-eye` or `fa-glasses` for spectators. The site uses `fa-eye` to mean "show".
 */
export function SpectatorsIcon({
  className = "",
}: {
  readonly className?: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={`${ICON_CLASS} ${className}`}
      viewBox={VIEW_BOX}
    >
      {EYE_XS.map((x) => (
        <g key={x}>
          <rect
            fill={WHITE}
            height={EYE.h}
            rx={EYE.w / 2}
            stroke={BLACK}
            strokeWidth={EYE.outline}
            width={EYE.w}
            x={x}
          />
          <circle cx={x + PUPIL.x} cy={PUPIL.y} fill={BLACK} r={PUPIL.r} />
          <circle
            cx={x + HIGHLIGHT.x}
            cy={HIGHLIGHT.y}
            fill={WHITE}
            r={HIGHLIGHT.r}
          />
        </g>
      ))}
    </svg>
  );
}

/** The same icon as `SpectatorsIcon`, as a string for HTML such as a tooltip. */
export function spectatorsIconHtml(): string {
  const eyes = EYE_XS.map((x) =>
    [
      `<rect x="${x}" width="${EYE.w}" height="${EYE.h}" rx="${EYE.w / 2}" fill="${WHITE}" stroke="${BLACK}" stroke-width="${EYE.outline}"/>`,
      `<circle cx="${x + PUPIL.x}" cy="${PUPIL.y}" r="${PUPIL.r}" fill="${BLACK}"/>`,
      `<circle cx="${x + HIGHLIGHT.x}" cy="${HIGHLIGHT.y}" r="${HIGHLIGHT.r}" fill="${WHITE}"/>`,
    ].join(""),
  );
  return `<svg aria-hidden="true" class="${ICON_CLASS}" viewBox="${VIEW_BOX}">${eyes.join("")}</svg>`;
}

/**
 * The eyes have fixed colors, like an emoji, so that the whites stay white on light and dark
 * backgrounds. Each eye is a pill with an outline. The pupil sits low in it, looking down and a
 * little to the right, with a highlight.
 */
const WHITE = "#fff";
const BLACK = "#000";
const EYE = {
  w: 8.4,
  h: 16,
  outline: 1.4,
} as const;
const PUPIL = {
  x: 4.4,
  y: 10.8,
  r: 2.6,
} as const;
const HIGHLIGHT = {
  x: 5.3,
  y: 9.9,
  r: 0.8,
} as const;

/** The left edge of each eye. */
const EYE_XS = [0, 9.6] as const;

/** The eyes, with room for half of the outline around them. */
const VIEW_BOX = "-0.7 -0.7 19.4 17.4";

/** As tall as the text, and as wide as the view box at that height. */
const ICON_CLASS =
  "tw:inline-block tw:h-[1em] tw:w-[1.115em] tw:align-[-0.125em]";
