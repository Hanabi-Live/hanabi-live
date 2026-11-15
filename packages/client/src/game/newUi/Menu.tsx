/**
 * A menu that opens above its button. The button and the menu sit in a container with the class
 * `tw:relative`, which is as wide as the button.
 */

/**
 * The button that opens a menu. It stays pressed down while its menu is open, so that it shows
 * which button the menu belongs to.
 */
export const MENU_BUTTON_CLASS =
  "tw:aria-expanded:translate-y-[2px] tw:aria-expanded:shadow-[0_1px_0_rgb(0_0_0/35%)]";

/**
 * The menu. Its bottom has more room, so that the lip of the last key in it does not touch the
 * edge. The gap under it leaves room for its pointer.
 */
const MENU_CLASS =
  "tw:absolute tw:bottom-full tw:z-30 tw:mb-3 tw:flex tw:flex-col tw:gap-2 tw:rounded-game-panel tw:bg-game-panel tw:p-2 tw:pb-3 tw:shadow-lg tw:ring-1 tw:ring-game-line";

/**
 * The pointer under the menu, which points down at the middle of the button. It is a triangle in
 * the color of the menu's outline, and its top touches the menu.
 */
const POINTER_CLASS =
  "tw:pointer-events-none tw:absolute tw:bottom-full tw:left-1/2 tw:z-30 tw:mb-0.5 tw:h-2.5 tw:w-5 tw:-translate-x-1/2 tw:bg-game-line tw:[clip-path:polygon(0_0,100%_0,50%_100%)]";

/**
 * The inside of the pointer, in the color of the menu. It is smaller by the width of the outline,
 * so that the outline goes along the pointer's sides. Its top covers the menu's outline where they
 * meet, so that one outline goes around both shapes.
 */
const POINTER_INSIDE_CLASS =
  "tw:size-full tw:bg-game-panel tw:[clip-path:polygon(1.4px_0,calc(100%_-_1.4px)_0,50%_calc(100%_-_1.4px))]";

export function Menu({
  align,
  className,
  children,
}: {
  /** The side of the button that the menu lines up with. */
  readonly align: "left" | "right";
  /** The width of the menu. */
  readonly className: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <div
        className={`${MENU_CLASS} ${align === "left" ? "tw:left-0" : "tw:right-0"} ${className}`}
        role="menu"
      >
        {children}
      </div>
      <div aria-hidden="true" className={POINTER_CLASS}>
        <div className={POINTER_INSIDE_CLASS} />
      </div>
    </>
  );
}

/** The caret on a menu's button. It points up to open the menu and down to close it. */
export function MenuCaret({
  open,
}: {
  readonly open: boolean;
}): React.JSX.Element {
  return (
    <i
      aria-hidden="true"
      className={`fas ${open ? "fa-caret-down" : "fa-caret-up"} tw:text-[12px]`}
    />
  );
}
