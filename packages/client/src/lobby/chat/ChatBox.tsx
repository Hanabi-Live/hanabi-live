// The parts that the lobby chat, the pre-game chat, and the game chat share.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { openEmojiPicker } from "../../EmojiPicker.tsx";
import { LengthCounter } from "../../LengthCounter.tsx";
import { CHAT_LENGTH_LIMIT, onChatInput, onChatKeyDown } from "../../chat.ts";
import type { SuggestedSettings } from "../../chatKind.ts";
import type { ChatSegment, ChatTextOptions } from "../../chatText.ts";
import { chatSegments } from "../../chatText.ts";
import { FADE_TIME_MS } from "../../constants.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { acceptOptionsFromGuest } from "../createGame.ts";

/** How far from the bottom the chat can be scrolled and still count as at the bottom. */
const AT_BOTTOM_EPSILON_PIXELS = 2;

/** The options that a player proposes go on their own lines, under the first line. */
const CONTINUATION_LINE_CLASSES = "cp tw:block tw:pl-13";

/** A part of a chat line that the client writes itself, in place of a message's text. */
export type LocalPart =
  | string
  | { readonly code: string }
  | { readonly strong: string }
  /** A button that copies text to the clipboard. */
  | { readonly copy: string; readonly label: string };

export interface ChatLine {
  /** Identifies the line on this page only. */
  readonly key: number;

  /** The database ID of a lobby message, which a moderator can delete. */
  readonly chatId?: number;

  /** Whether the line arrived live, so it fades in. Lines from the history do not. */
  readonly fadeIn: boolean;

  /** When the message was sent, as "HH:MM". */
  readonly time: string;

  /** The other person of a private message. */
  readonly privateMessage?: {
    readonly direction: "from" | "to";
    readonly name: string;
  };

  /** The person who wrote a public message. */
  readonly author?: string;

  /** Whether the server wrote the message. */
  readonly fromServer: boolean;

  /** The text, where a newline starts a new line. */
  readonly text: string;

  /** What the client wrote itself, in place of the text. */
  readonly localParts?: readonly LocalPart[];

  /** The color of a line that the client wrote itself. */
  readonly tone?: "info" | "error";

  /** Whether "@/command@" in the text is a command that a click puts in the chat input. */
  readonly commands?: boolean;

  /** What a button in the line applies to the table, in a suggestion to its owner. */
  readonly suggestion?: SuggestedSettings;
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

  // A narrower box wraps the lines onto more lines, so it stays at the bottom if it was there.
  useEffect(() => {
    const element = ref.current!;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) {
        scrollToBottom(element);
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

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

  const { privateMessage, author } = line;
  return (
    <span
      className="tw:block"
      data-chat-id={line.chatId}
      data-key={line.key}
      ref={ref}
    >
      [{line.time}]{"\u{A0} "}
      {privateMessage !== undefined && (
        <>
          <span className="red">
            [PM {privateMessage.direction}{" "}
            <strong>{privateMessage.name}</strong>]
          </span>
          {"\u{A0} "}
        </>
      )}
      {author !== undefined && (
        <>
          &lt;<strong>{author}</strong>&gt;{"\u{A0} "}
        </>
      )}
      <ChatLineBody line={line} />
    </span>
  );
}

function ChatLineBody({
  line,
}: {
  readonly line: ChatLine;
}): React.JSX.Element {
  if (line.suggestion !== undefined) {
    return (
      <span className={CONTINUATION_LINE_CLASSES}>
        <SuggestionButton suggestion={line.suggestion} />
      </span>
    );
  }

  const options = { commands: line.commands, notice: line.fromServer };
  const body =
    line.localParts === undefined ? (
      <>
        {line.text.split("\n").map((text, i) =>
          i === 0 ? (
            <Segments key={i} segments={chatSegments(text, options)} />
          ) : (
            <span className={CONTINUATION_LINE_CLASSES} key={i}>
              <Segments segments={chatSegments(text, options)} />
            </span>
          ),
        )}
      </>
    ) : (
      <LocalParts options={options} parts={line.localParts} />
    );

  switch (line.tone) {
    case undefined: {
      return body;
    }

    case "info": {
      return <span className="green">{body}</span>;
    }

    case "error": {
      return <span className="red">{body}</span>;
    }
  }
}

function LocalParts({
  parts,
  options,
}: {
  readonly parts: readonly LocalPart[];
  readonly options: ChatTextOptions;
}): React.JSX.Element {
  return <>{parts.map((part, i) => localPartElement(part, i, options))}</>;
}

function localPartElement(
  part: LocalPart,
  key: number,
  options: ChatTextOptions,
): React.JSX.Element {
  if (typeof part === "string") {
    return <Segments key={key} segments={chatSegments(part, options)} />;
  }
  if ("code" in part) {
    return <code key={key}>{part.code}</code>;
  }
  if ("strong" in part) {
    return <strong key={key}>{part.strong}</strong>;
  }
  return (
    <button
      key={key}
      onClick={() => {
        navigator.clipboard.writeText(part.copy).catch((error: unknown) => {
          console.error("Failed to copy to the clipboard:", error);
        });
      }}
      type="button"
    >
      <strong>{part.label}</strong>
    </button>
  );
}

function Segments({
  segments,
}: {
  readonly segments: readonly ChatSegment[];
}): React.JSX.Element {
  return <>{segments.map(segmentElement)}</>;
}

function segmentElement(segment: ChatSegment, key: number): React.ReactNode {
  switch (segment.type) {
    case "text": {
      return segment.text;
    }

    case "link": {
      return (
        <a
          href={segment.href}
          key={key}
          rel="noopener noreferrer"
          target="_blank"
        >
          {segment.text}
        </a>
      );
    }

    case "command": {
      // The pre-game chat puts the command in its input when it is clicked.
      return (
        <a className="suggestion" href="#" key={key}>
          {segment.command}
        </a>
      );
    }

    case "emote": {
      return (
        <img
          alt={segment.name}
          className="chat-emote"
          key={key}
          ref={tooltipRef(segment.name)}
          src={segment.src}
        />
      );
    }

    case "notice": {
      return (
        <span className="red" key={key}>
          {segment.text}
        </span>
      );
    }
  }
}

/** A button that applies the settings that the server suggests to the owner of a table. */
function SuggestionButton({
  suggestion,
}: {
  readonly suggestion: SuggestedSettings;
}) {
  const [sent, setSent] = useState(false);

  return (
    <button
      className="new-options"
      disabled={sent}
      onClick={() => {
        acceptOptionsFromGuest(suggestion);
        setSent(true);
      }}
      type="button"
    >
      {sent ? "sent" : "click to apply the suggestion"}
    </button>
  );
}

/** Says who is typing. */
export function TypingMessage({
  typing,
}: {
  readonly typing: readonly string[];
}): React.JSX.Element | null {
  switch (typing.length) {
    case 0: {
      return null;
    }

    case 1: {
      return (
        <>
          <strong>{typing[0]}</strong> is typing...
        </>
      );
    }

    case 2: {
      return (
        <>
          <strong>{typing[0]}</strong> and <strong>{typing[1]}</strong> are
          typing...
        </>
      );
    }

    case 3: {
      return (
        <>
          <strong>{typing[0]}</strong>, <strong>{typing[1]}</strong>, and{" "}
          <strong>{typing[2]}</strong> are typing...
        </>
      );
    }

    default: {
      return <>Several people are typing...</>;
    }
  }
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
  return (
    <div className="tw:relative">
      <input
        autoComplete="off"
        className="tw:pr-10"
        id={id}
        onInput={(event) => {
          onChatInput(event.currentTarget, room);
        }}
        onKeyDown={(event) => {
          onChatKeyDown(event.currentTarget, room, event.nativeEvent);
        }}
        placeholder="Chat"
        ref={ref}
        type="text"
      />
      <button
        className="tw:absolute tw:top-1/2 tw:right-4 tw:-translate-y-1/2 tw:cursor-pointer tw:border-none tw:bg-transparent tw:p-0 tw:text-text tw:hover:text-text-strong"
        onClick={() => {
          openEmojiPicker(id);
        }}
        type="button"
      >
        <i className="fas fa-smile tw:text-[1.6em]" />
      </button>
      <LengthCounter besideButton input={ref} limit={CHAT_LENGTH_LIMIT} />
    </div>
  );
}

export function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}
