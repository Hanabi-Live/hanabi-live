/**
 * The symbol for spectators across the site: two eyes side by side. It is drawn in the text color
 * and is as tall as the text, like a Font Awesome icon. The lobby's spectate cursors
 * ("public/img/cursors/spectate.svg" and "un-shadow.svg") draw the same shape.
 *
 * Do not use `fa-eye` for spectators. The site uses it to mean "show".
 */
export function SpectatorsIcon({
  className = "",
}: {
  readonly className?: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={`tw:inline-block tw:h-[1em] tw:w-[1.125em] tw:align-[-0.125em] ${className}`}
      fill="currentColor"
      viewBox="0 0 18 16"
    >
      <path d={SPECTATORS_PATH} fillRule="evenodd" />
    </svg>
  );
}

/**
 * One eye whose left edge is at `x`: a solid pill, 8.4 wide and 16 tall. The pupil is a hole low in
 * it, so that it shows what is behind the icon. The highlight is a dot in the hole. (An outline
 * with a solid pupil is too thin to read at the size of text.)
 */
function eyePath(x: number) {
  return [
    `M${x + 4.2} 0a4.2 4.2 0 0 1 4.2 4.2v7.6a4.2 4.2 0 0 1 -8.4 0v-7.6a4.2 4.2 0 0 1 4.2 -4.2z`,
    `M${x + 1.8} 10.8a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0z`,
    `M${x + 4.5} 9.9a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0z`,
  ].join(" ");
}

const SPECTATORS_PATH = `${eyePath(0)} ${eyePath(9.6)}`;
