// The number of characters left in a chat message. It appears inside the chat input when the
// message nears the limit, as in Discord.

import { MAX_CHAT_LENGTH } from "@hanabi-live/data";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip.ts";
import { CHAT_TOO_LONG_EVENT, chatLengthLeft } from "./chat.ts";
import { renderRoot } from "./renderRoot.tsx";

/** The counter appears for the last tenth of the limit. */
const COUNTER_SHOWN_AT_CHARACTERS_LEFT = MAX_CHAT_LENGTH / 10;

/** The input's right padding while the counter shows, so that the text does not run under it. */
const COUNTER_INPUT_PADDING = "6rem";

/** How long the tooltip stays open after the player tries to send a message that is too long. */
const TOO_LONG_TOOLTIP_MILLISECONDS = 2 * SECOND_IN_MILLISECONDS;

const TOO_LONG_CONTENT =
  '<span class="small-tooltip-text">Message is too long</span>';

/** The events after which the input's text can have changed, including by our own code. */
const TEXT_CHANGE_EVENTS = ["input", "keyup", "focus"] as const;

/** Shows the counter of a chat input that is not rendered by React. */
export function mountChatLengthCounter(
  container: HTMLElement,
  input: HTMLInputElement,
): void {
  renderRoot(container, <ChatLengthCounter input={{ current: input }} />);
}

/**
 * The number of characters left in a chat input. Render it in the input's positioned container,
 * beside the emoji button.
 */
export function ChatLengthCounter({
  input,
}: {
  readonly input: React.RefObject<HTMLInputElement | null>;
}): React.JSX.Element | null {
  const [left, setLeft] = useState(MAX_CHAT_LENGTH);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = left <= COUNTER_SHOWN_AT_CHARACTERS_LEFT;
  const tooLong = left < 0;

  useEffect(() => {
    const element = input.current!;
    const controller = new AbortController();
    function update() {
      setLeft(chatLengthLeft(element.value));
    }
    for (const type of TEXT_CHANGE_EVENTS) {
      element.addEventListener(type, update, { signal: controller.signal });
    }
    update();
    return () => {
      controller.abort();
    };
  }, [input]);

  useEffect(() => {
    if (!shown) {
      return undefined;
    }
    const element = input.current!;
    element.style.paddingRight = COUNTER_INPUT_PADDING;
    return () => {
      element.style.paddingRight = "";
    };
  }, [input, shown]);

  // Over the limit, the counter explains itself on hover, and when the player tries to send.
  useEffect(() => {
    if (!tooLong) {
      return undefined;
    }
    const tooltip = new Tooltip(ref.current!, { content: TOO_LONG_CONTENT });
    tooltip.openOnHover();
    const controller = new AbortController();
    let closeTimeout: ReturnType<typeof setTimeout> | undefined;
    input.current!.addEventListener(
      CHAT_TOO_LONG_EVENT,
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
  }, [input, tooLong]);

  if (!shown) {
    return null;
  }

  return (
    <span
      className={`tw:absolute tw:top-1/2 tw:right-13 tw:-translate-y-1/2 tw:text-[0.875em] tw:tabular-nums ${tooLong ? "tw:text-(--error)" : "tw:text-text"}`}
      ref={ref}
    >
      {left}
    </span>
  );
}
