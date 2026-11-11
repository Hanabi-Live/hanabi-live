// The parts that the lobby chat and the pre-game chat share.

import { useEffect, useLayoutEffect, useRef } from "react";
import { attachChatInput, openEmojiPicker } from "../../chat.ts";
import { FADE_TIME_MS } from "../../constants.ts";

/** How far from the bottom the chat can be scrolled and still count as at the bottom. */
const AT_BOTTOM_EPSILON_PIXELS = 2;

export interface ChatLine {
  /** Identifies the line on this page only. */
  readonly key: number;

  /** The database ID of a lobby message, which a moderator can delete. */
  readonly chatId?: number;

  /** The whole line as HTML, which the client builds from text that the server escaped. */
  readonly html: string;

  /** Whether the line arrived live, so it fades in. Lines from the history do not. */
  readonly fadeIn: boolean;
}

/** The lines of a chat. New lines scroll it down only if it is already at the bottom. */
export function ChatTextBox({
  id,
  lines,
  onClick,
}: {
  readonly id: string;
  readonly lines: readonly ChatLine[];
  readonly onClick?: React.MouseEventHandler<HTMLDivElement>;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  // Then the lines do not move while someone reads older ones.
  const atBottomRef = useRef(true);
  useLayoutEffect(() => {
    if (atBottomRef.current) {
      scrollToBottom(ref.current!);
    }
  }, [lines]);

  return (
    <div
      className="tw:mb-4 tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:border tw:border-solid tw:border-border tw:bg-(--chat-bg) tw:px-2 tw:wrap-break-word"
      id={id}
      onClick={onClick}
      onScroll={(event) => {
        const { clientHeight, scrollTop, scrollHeight } = event.currentTarget;
        atBottomRef.current =
          Math.abs(clientHeight + scrollTop - scrollHeight)
          < AT_BOTTOM_EPSILON_PIXELS;
      }}
      ref={ref}
    >
      {lines.map((line) => (
        <ChatLineView key={line.key} line={line} />
      ))}
    </div>
  );
}

function ChatLineView({ line }: { readonly line: ChatLine }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (line.fadeIn) {
      ref.current!.animate([{ opacity: 0 }, { opacity: 1 }], FADE_TIME_MS);
    }
  }, [line.fadeIn]);

  return (
    <span
      className="tw:block"
      // The client builds the line from text that the server already escaped.
      dangerouslySetInnerHTML={{ __html: line.html }}
      data-chat-id={line.chatId}
      data-key={line.key}
      ref={ref}
    />
  );
}

/** The input of a chat, with a button that opens the emoji picker. */
export function ChatInput({
  id,
  room,
  ref,
}: {
  readonly id: string;
  readonly room: "lobby" | "table";
  readonly ref: React.RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  useEffect(() => attachChatInput(ref.current!, room), [ref, room]);

  return (
    <div className="tw:relative">
      <input
        autoComplete="off"
        className="tw:pr-10"
        id={id}
        placeholder="Chat"
        ref={ref}
        type="text"
      />
      <button
        className="tw:absolute tw:top-1/2 tw:right-4 tw:-translate-y-1/2 tw:cursor-pointer tw:border-none tw:bg-transparent tw:p-0 tw:text-text tw:hover:text-text-strong"
        onClick={() => {
          openEmojiPicker(ref.current!);
        }}
        type="button"
      >
        <i className="fas fa-smile tw:text-[1.6em]" />
      </button>
    </div>
  );
}

export function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}
