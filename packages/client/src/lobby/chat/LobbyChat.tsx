// The lobby area where everyone can chat.

import { useEffect, useLayoutEffect, useRef } from "react";
import { attachChatInput, openEmojiPicker } from "../../chat";
import { FADE_TIME_MS } from "../../constants";
import { useAppSelector } from "../../store";
import { getHTMLElement } from "../../utils";
import { OnlineUserCount } from "../users/UsersList";
import type { LobbyChatLine } from "./lobbyChatSlice";

/** How far from the bottom the chat can be scrolled and still count as at the bottom. */
const AT_BOTTOM_EPSILON_PIXELS = 2;

const TEXT_BOX_ID = "lobby-chat-text";

export function LobbyChat(): React.JSX.Element {
  const lines = useAppSelector((state) => state.lobbyChat.lines);
  const textBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // New lines scroll the chat down only if it is already at the bottom. Then the lines do not move
  // while someone reads older ones.
  const atBottomRef = useRef(true);
  useLayoutEffect(() => {
    if (atBottomRef.current) {
      scrollToBottom(textBoxRef.current!);
    }
  }, [lines]);

  useEffect(() => attachChatInput(inputRef.current!, "lobby"), []);

  return (
    <>
      <h3 className="lobby-title">
        Lobby Chat
        <span className="only-on-narrow-screen">
          {" "}
          (<OnlineUserCount /> online)
        </span>
      </h3>
      <div
        className="lobby-chat-text-box"
        id={TEXT_BOX_ID}
        onScroll={(event) => {
          const { clientHeight, scrollTop, scrollHeight } = event.currentTarget;
          atBottomRef.current =
            Math.abs(clientHeight + scrollTop - scrollHeight)
            < AT_BOTTOM_EPSILON_PIXELS;
        }}
        ref={textBoxRef}
      >
        {lines.map((line) => (
          <ChatLine key={line.key} line={line} />
        ))}
      </div>
      <div className="chat-input-container">
        <input
          autoComplete="off"
          id="lobby-chat-input"
          placeholder="Chat"
          ref={inputRef}
          type="text"
        />
        <button
          className="emoji-button"
          onClick={() => {
            openEmojiPicker(inputRef.current!);
          }}
          type="button"
        >
          <i className="fas fa-smile" />
        </button>
      </div>
    </>
  );
}

function ChatLine({ line }: { readonly line: LobbyChatLine }) {
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
      ref={ref}
    />
  );
}

/** Shows the newest lines, such as after the chat box changes size or appears again. */
export function scrollLobbyChatToBottom(): void {
  scrollToBottom(getHTMLElement(`#${TEXT_BOX_ID}`));
}

function scrollToBottom(element: HTMLElement) {
  element.scrollTop = element.scrollHeight;
}
