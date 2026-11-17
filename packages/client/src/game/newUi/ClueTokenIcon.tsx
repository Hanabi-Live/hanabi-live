/** The number of rays on a clue token. Long and short rays take turns. */
const RAY_COUNT = 12;

/** The radius of the token's disc, in the units of its 24 by 24 view box. */
const DISC_RADIUS = 11.5;

/** How far the rays reach out from the center. */
const RAY_OUTER_RADIUS = 9.6;

/** The long rays come almost to the center, and the short rays stop farther out. */
const LONG_RAY = {
  innerRadius: 1.2,
  halfAngle: 8,
} as const;
const SHORT_RAY = {
  innerRadius: 5,
  halfAngle: 6,
} as const;

/** Gives a point of the token's view box, from its distance from the center and its angle. */
function polar(radius: number, degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  const x = 12 + radius * Math.sin(radians);
  const y = 12 - radius * Math.cos(radians);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** The rays, as one path: each ray is a thin triangle that points at the center. */
const RAYS_PATH = Array.from({ length: RAY_COUNT }, (_, index) => {
  const angle = (index * 360) / RAY_COUNT;
  const ray = index % 2 === 0 ? LONG_RAY : SHORT_RAY;
  return `M${polar(ray.innerRadius, angle)}L${polar(RAY_OUTER_RADIUS, angle - ray.halfAngle)}L${polar(RAY_OUTER_RADIUS, angle + ray.halfAngle)}Z`;
}).join("");

/**
 * A clue token, as in the physical game: a dark disc with a burst of rays in the color of clues. A
 * thin rim in the color of clues shows the disc's edge on the dark table. An empty token has no
 * rays and a gray rim, so that the shape shows that the team has no clues, not only the color.
 */
export function ClueTokenIcon({
  className,
  empty = false,
}: {
  readonly className: string;
  readonly empty?: boolean;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={`tw:shrink-0 ${empty ? "tw:text-game-muted" : "tw:text-clue"} ${className}`}
      viewBox="0 0 24 24"
    >
      <circle
        cx={12}
        cy={12}
        fill="var(--card-ink)"
        r={DISC_RADIUS}
        stroke="currentColor"
        strokeWidth={0.8}
      />
      {!empty && <path d={RAYS_PATH} fill="currentColor" />}
    </svg>
  );
}
