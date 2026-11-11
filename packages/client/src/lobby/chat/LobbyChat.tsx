// The lobby area where everyone can chat.

import { useRef } from "react";
import { useAppSelector } from "../../store.ts";
import { getHtmlElement } from "../../utils.ts";
import { OnlineUserCount } from "../users/UsersList.tsx";
import { ChatInput, ChatTextBox, scrollToBottom } from "./ChatBox.tsx";

const TEXT_BOX_ID = "lobby-chat-text";

export function LobbyChat(): React.JSX.Element {
  const lines = useAppSelector((state) => state.lobbyChat.lines);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <h3 className="tw:text-[1.3em]">
        Lobby Chat
        <span className="tw:hidden tw:narrow-640:inline">
          {" "}
          (<OnlineUserCount /> online)
        </span>
      </h3>
      <ChatTextBox id={TEXT_BOX_ID} lines={lines} />
      <ChatInput id="lobby-chat-input" ref={inputRef} room="lobby" />
    </>
  );
}

/** Shows the newest lines, such as after the chat box changes size or appears again. */
export function scrollLobbyChatToBottom(): void {
  scrollToBottom(getHtmlElement(`#${TEXT_BOX_ID}`));
}
