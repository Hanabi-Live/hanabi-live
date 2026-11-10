// The parts that the lobby chat and the pre-game chat share.

import { useEffect, useLayoutEffect, useRef } from "react";
import { attachChatInput, openEmojiPicker } from "../../chat";
import { FADE_TIME_MS } from "../../constants";

/** How far from the bottom the chat can be scrolled and still count as at the bottom. */
const AT_BOTTOM_EPSILON_PIXELS = 2;

export interface ChatLine {
  /** Identifies the line on this page only. */
  readonly key: number;

  /** The database ID of a lobby message, which a moderator can delete. */
  readonly chatID?: number;

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
      className="lobby-chat-text-box"
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
      data-chat-id={line.chatID}
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
    <div className="chat-input-container">
      <input
        autoComplete="off"
        id={id}
        placeholder="Chat"
        ref={ref}
        type="text"
      />
      <button
        className="emoji-button"
        onClick={() => {
          openEmojiPicker(ref.current!);
        }}
        type="button"
      >
        <i className="fas fa-smile" />
      </button>
    </div>
  );
}

export function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}
