import { useId } from "react";
import { store } from "../../store.ts";

/**
 * How far each link of the chain moves out from the middle when the links come apart, in units of
 * the icon's view box (24 wide). It leaves a clear gap between the links, so that they do not look
 * like the broken link that marks a player who left.
 */
const APART_OFFSET = 6;

const STROKE_WIDTH = 2.75;

/** The space that a link leaves on each side of the other link where the other passes over it. */
const CROSSING_GAP = 1;

const LINK_RADIUS = 3.5;

/** The length of the straight sides of a link. */
const LINK_SIDE = 4;

/**
 * The links are drawn along a level line, and they overlap by 4 units in the middle. These are the
 * centers of their inner ends.
 */
const LEFT_INNER_X = -1.5;
const RIGHT_INNER_X = 1.5;

const LEFT_LINK = linkPath(LEFT_INNER_X - LINK_SIDE);
const RIGHT_LINK = linkPath(RIGHT_INNER_X);

/** A piece of the left link's right end, where it passes over the right link at the top. */
const LEFT_OVER = crossingPiece(LEFT_INNER_X);

/** A piece of the right link's left end, where it passes over the left link at the bottom. */
const RIGHT_OVER = crossingPiece(RIGHT_INNER_X, true);

/**
 * Two links of a chain. They hook into each other when `linked` is true, and they are apart, but
 * whole, when it is false. When it changes, the links slide together with a small overshoot that
 * snaps them in place, or slide apart. The slide only decorates, so "Reduced motion" turns it off.
 *
 * Each link has a gap where the other link passes over it, so that they look hooked. The gap is a
 * mask that moves with the other link. The icon is turned 45 degrees, as Font Awesome's link is.
 */
export function ChainIcon({
  linked,
}: {
  readonly linked: boolean;
}): React.JSX.Element {
  const id = useId();
  const offset = linked ? 0 : APART_OFFSET;
  let motionClass = "";
  if (!store.getState().session.settings.reducedMotion) {
    motionClass = linked
      ? "tw:transition-transform tw:duration-250 tw:ease-[cubic-bezier(0.34,1.8,0.64,1)]"
      : "tw:transition-transform tw:duration-200 tw:ease-out";
  }

  return (
    <svg
      aria-hidden="true"
      className="tw:size-[22px] tw:overflow-visible"
      data-chain={linked ? "linked" : "apart"}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      viewBox="-12 -12 24 24"
    >
      <defs>
        <CrossingMask
          className={motionClass}
          id={`${id}-left`}
          over={RIGHT_OVER}
          style={moved(2 * offset)}
        />
        <CrossingMask
          className={motionClass}
          id={`${id}-right`}
          over={LEFT_OVER}
          style={moved(-2 * offset)}
        />
      </defs>
      <g transform="rotate(-45)">
        <g className={motionClass} style={moved(-offset)}>
          <path d={LEFT_LINK} mask={`url(#${id}-left)`} />
        </g>
        <g className={motionClass} style={moved(offset)}>
          <path d={RIGHT_LINK} mask={`url(#${id}-right)`} />
        </g>
      </g>
    </svg>
  );
}

/** The style that moves a link, or a piece of it, along the level line. */
function moved(x: number): React.CSSProperties {
  return { transform: `translateX(${x}px)` };
}

/** Hides a link where the piece `over` of the other link passes over it, moved by `style`. */
function CrossingMask({
  id,
  over,
  className,
  style,
}: {
  readonly id: string;
  readonly over: string;
  readonly className: string;
  readonly style: React.CSSProperties;
}): React.JSX.Element {
  return (
    <mask
      height="40"
      id={id}
      maskUnits="userSpaceOnUse"
      width="40"
      x="-20"
      y="-20"
    >
      <rect fill="white" height="40" stroke="none" width="40" x="-20" y="-20" />
      <path
        className={className}
        d={over}
        stroke="black"
        strokeWidth={STROKE_WIDTH + 2 * CROSSING_GAP}
        style={style}
      />
    </mask>
  );
}

/**
 * The piece of a link's end, centered at `centerX`, that crosses the other link. The links cross
 * near the top of the left link's end and the bottom of the right link's end.
 */
function crossingPiece(centerX: number, bottom = false): string {
  function point(degrees: number): string {
    const radians = (degrees * Math.PI) / 180;
    const x = centerX + LINK_RADIUS * Math.cos(radians);
    const y = LINK_RADIUS * Math.sin(radians);
    return `${x} ${bottom ? y : -y}`;
  }
  return bottom
    ? `M${point(85)}A${LINK_RADIUS} ${LINK_RADIUS} 0 0 1 ${point(140)}`
    : `M${point(95)}A${LINK_RADIUS} ${LINK_RADIUS} 0 0 1 ${point(40)}`;
}

/** A link: a loop with round ends, whose left end is centered at `leftX`. */
function linkPath(leftX: number): string {
  const rightX = leftX + LINK_SIDE;
  const r = `${LINK_RADIUS} ${LINK_RADIUS} 0 0 1`;
  return `M${leftX} ${-LINK_RADIUS}H${rightX}A${r} ${rightX} ${LINK_RADIUS}H${leftX}A${r} ${leftX} ${-LINK_RADIUS}Z`;
}
