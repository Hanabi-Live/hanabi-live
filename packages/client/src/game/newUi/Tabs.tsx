import { getVisibilityTransition, SLIDE } from "./motion.ts";

/**
 * Two tabs that switch between two views in one box. A highlight slides to the chosen tab. Each tab
 * controls the element with its ID, which should have the `role` "tabpanel" and the style from
 * `getTabPanelStyle`.
 */
export function Tabs<Tab extends string>({
  label,
  tabs,
  tab,
  onTab,
  reducedMotion,
}: {
  /** What the two tabs switch between, for screen readers. */
  readonly label: string;
  /** The ID of each tab's view and the tab's name, from left to right. */
  readonly tabs: readonly [readonly [Tab, string], readonly [Tab, string]];
  readonly tab: Tab;
  readonly onTab: (tab: Tab) => void;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const right = tab === tabs[1][0];
  return (
    <div
      aria-label={label}
      className="tw:relative tw:grid tw:grid-cols-2 tw:rounded-game-control tw:bg-black/25 tw:p-1"
      role="tablist"
    >
      <span
        aria-hidden="true"
        className={`tw:absolute tw:inset-y-1 tw:left-1 tw:w-[calc(50%-4px)] tw:rounded-game-control tw:bg-white/15 ${right ? "tw:translate-x-full" : ""}`}
        style={{
          transition: reducedMotion
            ? undefined
            : `translate ${SLIDE.duration}ms ${SLIDE.easing}`,
        }}
      />
      {tabs.map(([id, name]) => (
        <button
          aria-controls={id}
          aria-selected={tab === id}
          className={`tw:relative tw:cursor-pointer tw:border-0 tw:bg-transparent tw:px-4 tw:py-1.5 tw:text-[15px] tw:leading-[20px] tw:font-semibold tw:whitespace-nowrap ${tab === id ? "tw:text-game-text" : "tw:text-game-muted tw:hover:text-game-text"}`}
          key={id}
          onClick={() => {
            onTab(id);
          }}
          role="tab"
          // The text's color changes as the highlight slides to the tab. A text color is not a
          // background color, so it may animate.
          style={{
            transition: reducedMotion
              ? undefined
              : `color ${SLIDE.duration}ms ${SLIDE.easing}`,
          }}
          type="button"
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/**
 * The height of `Tabs`, in CSS pixels: the line of a tab's name, the tab's `tw:py-1.5`, and the
 * `tw:p-1` around the tabs.
 */
export const TABS_HEIGHT = 20 + 12 + 8;

/**
 * The style of a tab's view. Both views stay drawn in the same place, and the hidden one is
 * invisible, so that switching tabs keeps open menus and scrolling. One fades into the other as the
 * highlight slides to the new tab. Give the hidden view the class `tw:invisible`.
 */
export function getTabPanelStyle(
  shown: boolean,
  reducedMotion: boolean,
): React.CSSProperties {
  return {
    opacity: shown ? 1 : 0,
    transition: reducedMotion ? undefined : getVisibilityTransition(shown),
  };
}
