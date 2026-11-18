/**
 * A menu that opens above or below its button. The button and the menu sit in a container with the
 * class `tw:relative`, which is as wide as the button.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { getScreenScale } from "./screenScale.ts";

/**
 * The button that opens a menu. It stays pressed down while its menu is open, so that it shows
 * which button the menu belongs to.
 */
export const MENU_BUTTON_CLASS =
  "tw:aria-expanded:translate-y-[2px] tw:aria-expanded:shadow-[0_1px_0_rgb(0_0_0/35%)]";

/**
 * The menu. Its bottom has more room, so that the lip of the last key in it does not touch the
 * edge. The gap between it and the button leaves room for its pointer.
 */
const MENU_CLASS =
  "tw:absolute tw:z-30 tw:flex tw:flex-col tw:gap-2 tw:rounded-game-panel tw:bg-game-panel tw:p-2 tw:pb-3 tw:shadow-lg tw:ring-1 tw:ring-game-line";

const MENU_SIDE_CLASS = {
  above: "tw:bottom-full tw:mb-3",
  below: "tw:top-full tw:mt-3",
} as const;

const MENU_ALIGN_CLASS = {
  left: "tw:left-0",
  right: "tw:right-0",
  center: "tw:left-1/2 tw:-translate-x-1/2",
} as const;

/**
 * The pointer between the menu and the button, which points at the middle of the button. The 2px of
 * it nearest the menu are inside the menu.
 */
const POINTER_CLASS =
  "tw:pointer-events-none tw:absolute tw:left-1/2 tw:z-30 tw:h-3 tw:w-5 tw:-translate-x-1/2";

const POINTER_SIDE_CLASS = {
  above: "tw:bottom-full tw:mb-0.5",
  below: "tw:top-full tw:mt-0.5",
} as const;

/**
 * The outline of the pointer: a triangle under the menu. It sets no color. Give it the color of the
 * menu's outline.
 */
const POINTER_OUTLINE_CLASS = {
  above:
    "tw:absolute tw:inset-x-0 tw:bottom-0 tw:h-2.5 tw:[clip-path:polygon(0_0,100%_0,50%_100%)]",
  below:
    "tw:absolute tw:inset-x-0 tw:top-0 tw:h-2.5 tw:[clip-path:polygon(50%_0,100%_100%,0_100%)]",
} as const;

/**
 * The inside of the pointer. It sets no color. Give it the color of the menu. It is smaller than
 * the outline by the width of the outline, so that the outline goes along the pointer's sides. It
 * covers the menu's outline where they meet, so that one outline goes around both shapes. It
 * reaches into the menu, because the screen's scale can round the menu's outline to a pixel past
 * the pointer's edge.
 */
const POINTER_INSIDE_CLASS = {
  above:
    "tw:absolute tw:inset-0 tw:[clip-path:polygon(1.4px_0,calc(100%_-_1.4px)_0,calc(100%_-_1.4px)_2px,50%_calc(100%_-_1.4px),1.4px_2px)]",
  below:
    "tw:absolute tw:inset-0 tw:[clip-path:polygon(1.4px_100%,calc(100%_-_1.4px)_100%,calc(100%_-_1.4px)_calc(100%_-_2px),50%_1.4px,1.4px_calc(100%_-_2px))]",
} as const;

/** The least space between a centered menu and the edges of the window, in CSS pixels. */
const MENU_WINDOW_MARGIN = 8;

/**
 * The least space between the middle of the pointer and the sides of the menu, in CSS pixels: the
 * radius of the menu's corners (`tw:rounded-game-panel`) and half the width of the pointer
 * (`tw:w-5`). The pointer then joins the straight part of the menu's edge, not a corner.
 */
const POINTER_SIDE_MARGIN = 8 + 20 / 2;

export function Menu({
  align,
  side = "above",
  scrollIntoView = false,
  className,
  children,
}: {
  /**
   * The side of the button that the menu lines up with. A centered menu moves sideways to stay
   * inside the window, such as under a card at the edge of a phone's screen. Its pointer stays on
   * the button, but moves toward the middle of the menu to stay off of the menu's corners.
   */
  readonly align: "left" | "right" | "center";
  readonly side?: "above" | "below";
  /**
   * Whether the menu scrolls into view when it opens. Use it for a menu in an area that scrolls,
   * such as that of a card in the hands on a phone, where the menu can open past the area's edge.
   */
  readonly scrollIntoView?: boolean;
  /** The width of the menu. */
  readonly className: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // How far the menu and its pointer move sideways from the middle of the button, in CSS pixels.
  const [shift, setShift] = useState({
    menu: 0,
    pointer: 0,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps -- It measures the layout after every render, and sets the state only when it changes.
  useLayoutEffect(() => {
    const element = ref.current;
    if (align !== "center" || element === null) {
      return;
    }

    // The window's pixels, without the shift that the menu has now.
    const scale = getScreenScale();
    const rect = element.getBoundingClientRect();
    const left = rect.left - shift.menu * scale;
    const right = rect.right - shift.menu * scale;
    const margin = MENU_WINDOW_MARGIN * scale;
    let menu = 0;
    if (left < margin) {
      menu = margin - left;
    } else if (right > globalThis.innerWidth - margin) {
      menu = globalThis.innerWidth - margin - right;
    }

    const middle = (left + right) / 2;
    const pointerMargin = POINTER_SIDE_MARGIN * scale;
    const pointerMiddle = Math.min(
      Math.max(middle, left + menu + pointerMargin),
      right + menu - pointerMargin,
    );
    const next = {
      menu: menu / scale,
      pointer: (pointerMiddle - middle) / scale,
    };
    if (
      Math.abs(next.menu - shift.menu) >= 1
      || Math.abs(next.pointer - shift.pointer) >= 1
    ) {
      setShift(next);
    }
  });

  useLayoutEffect(() => {
    if (scrollIntoView) {
      ref.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [scrollIntoView]);

  return (
    <>
      <div
        className={`${MENU_CLASS} ${MENU_SIDE_CLASS[side]} ${MENU_ALIGN_CLASS[align]} ${className}`}
        ref={ref}
        role="menu"
        style={shift.menu === 0 ? undefined : { marginLeft: shift.menu }}
      >
        {children}
      </div>
      <MenuPointer
        insideClassName="tw:bg-game-panel"
        outlineClassName="tw:bg-game-line"
        shift={shift.pointer}
        side={side}
      />
    </>
  );
}

/**
 * The pointer between a box and the element that it belongs to, such as a menu and its button. It
 * points at the middle of the element. The box must have an outline as wide as `tw:ring-1`, and a
 * gap of `tw:mt-3` (or `tw:mb-3`) between it and the element. The pointer and the box then have one
 * outline. The element must have the class `tw:relative`.
 */
export function MenuPointer({
  side,
  outlineClassName,
  insideClassName,
  shift = 0,
}: {
  /** The side of the element that the box is on. */
  readonly side: "above" | "below";
  /** The color of the box's outline, such as `tw:bg-game-line`. It must not be translucent. */
  readonly outlineClassName: string;
  /** The color of the box, such as `tw:bg-game-panel`. */
  readonly insideClassName: string;
  /** How far the pointer moves sideways from the middle of the element, in CSS pixels. */
  readonly shift?: number;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`${POINTER_CLASS} ${POINTER_SIDE_CLASS[side]}`}
      style={shift === 0 ? undefined : { marginLeft: shift }}
    >
      <div className={`${POINTER_OUTLINE_CLASS[side]} ${outlineClassName}`} />
      <div className={`${POINTER_INSIDE_CLASS[side]} ${insideClassName}`} />
    </div>
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
