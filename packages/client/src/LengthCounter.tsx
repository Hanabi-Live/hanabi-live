// The number of characters left in a text input that the server limits, such as a chat message. It
// appears inside the input when the text nears the limit, as in Discord.

import { SECOND_IN_MILLISECONDS } from "complete-common";
import { useEffect, useRef, useState } from "react";
import type { Root } from "react-dom/client";
import { Tooltip } from "./Tooltip.ts";
import { renderRoot } from "./renderRoot.tsx";

/** A limit on the text of an input, and how to count the text as the server counts it. */
export interface LengthLimit {
  readonly max: number;

  /** The characters left: negative for a text that is too long. */
  readonly left: (text: string) => number;

  /** The tooltip of the counter when the text is too long, such as "Message is too long". */
  readonly tooLongText: string;
}

/** The counter appears for the last tenth of the limit. */
const SHOWN_FRACTION = 0.1;

/**
 * The input's right padding while the counter shows, so that the text does not run under it. Beside
 * a button, the counter is further from the edge.
 */
const INPUT_PADDING = "3rem";
const INPUT_PADDING_BESIDE_BUTTON = "6rem";

/** How long the tooltip stays open after the player tries to submit a text that is too long. */
const TOO_LONG_TOOLTIP_MILLISECONDS = 2 * SECOND_IN_MILLISECONDS;

/** The event that an input receives when the player tries to submit a text that is too long. */
const TOO_LONG_EVENT = "too-long";

/** The events after which the input's text can have changed, including by our own code. */
const TEXT_CHANGE_EVENTS = ["input", "keyup", "focus"] as const;

/**
 * The number of characters in a text as the server counts them: code points, so that most emoji
 * count as one character. (An emoji made of several code points counts as several, on the server
 * too.)
 */
export function countCharacters(text: string): number {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread
  return [...text].length;
}

/**
 * Whether an input's text is too long to submit. If it is, the counter opens its tooltip, so that
 * the player knows why nothing happened.
 */
export function rejectTooLong(
  input: HTMLInputElement,
  limit: LengthLimit,
): boolean {
  if (limit.left(input.value) >= 0) {
    return false;
  }
  input.dispatchEvent(new Event(TOO_LONG_EVENT));
  return true;
}

/** Shows the counter of an input that is not rendered by React. */
export function mountLengthCounter(
  container: HTMLElement,
  input: HTMLInputElement,
  limit: LengthLimit,
  besideButton = false,
): Root {
  return renderRoot(
    container,
    <LengthCounter
      besideButton={besideButton}
      input={{ current: input }}
      limit={limit}
    />,
  );
}

/**
 * The number of characters left in an input. Render it in the input's positioned container. With
 * `besideButton`, it leaves room for a button at the input's right edge, such as the emoji button
 * of a chat input.
 */
export function LengthCounter({
  besideButton = false,
  input,
  limit,
}: {
  readonly besideButton?: boolean;
  readonly input: React.RefObject<HTMLInputElement | null>;
  readonly limit: LengthLimit;
}): React.JSX.Element | null {
  const [left, setLeft] = useState(limit.max);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = left <= limit.max * SHOWN_FRACTION;
  const tooLong = left < 0;

  useEffect(() => {
    const element = input.current!;
    const controller = new AbortController();
    function update() {
      setLeft(limit.left(element.value));
    }
    for (const type of TEXT_CHANGE_EVENTS) {
      element.addEventListener(type, update, { signal: controller.signal });
    }
    update();
    return () => {
      controller.abort();
    };
  }, [input, limit]);

  useEffect(() => {
    if (!shown) {
      return undefined;
    }
    const element = input.current!;
    element.style.paddingRight = besideButton
      ? INPUT_PADDING_BESIDE_BUTTON
      : INPUT_PADDING;
    return () => {
      element.style.paddingRight = "";
    };
  }, [input, shown, besideButton]);

  // Over the limit, the counter explains itself on hover, and when the player tries to submit.
  useEffect(() => {
    if (!tooLong) {
      return undefined;
    }
    const tooltip = new Tooltip(ref.current!, {
      content: `<span class="small-tooltip-text">${limit.tooLongText}</span>`,
    });
    tooltip.openOnHover();
    const controller = new AbortController();
    let closeTimeout: ReturnType<typeof setTimeout> | undefined;
    input.current!.addEventListener(
      TOO_LONG_EVENT,
      () => {
        tooltip.open();
        clearTimeout(closeTimeout);
        closeTimeout = setTimeout(() => {
          tooltip.close();
        }, TOO_LONG_TOOLTIP_MILLISECONDS);
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
      clearTimeout(closeTimeout);
      tooltip.destroy();
    };
  }, [input, tooLong, limit]);

  if (!shown) {
    return null;
  }

  return (
    <span
      className={`tw:absolute tw:top-1/2 tw:-translate-y-1/2 tw:text-[0.875em] tw:tabular-nums ${besideButton ? "tw:right-13" : "tw:right-2"} ${tooLong ? "tw:text-(--error)" : "tw:text-text"}`}
      ref={ref}
    >
      {left}
    </span>
  );
}
