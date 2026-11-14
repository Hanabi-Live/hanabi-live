// The chat box of the game that we are in. The classic screen shows it in its chat window, and the
// redesigned screen borrows it for its chat panel.

import { useRef } from "react";
import {
  ChatInput,
  ChatTextBox,
  TypingMessage,
} from "../lobby/chat/ChatBox.tsx";
import { useAppSelector } from "../store.ts";

export const GAME_CHAT_TEXT_ID = "game-chat-text";
export const GAME_CHAT_INPUT_ID = "game-chat-input";

export function GameChatBox(): React.JSX.Element {
  const lines = useAppSelector((state) => state.gameChat.lines);
  const typing = useAppSelector((state) => state.pregame.typing);
  const poppedOut = useAppSelector((state) => state.newUi.chatPoppedOut);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <ChatTextBox id={GAME_CHAT_TEXT_ID} lines={lines} />
      <ChatInput
        emojiPicker={!poppedOut}
        id={GAME_CHAT_INPUT_ID}
        ref={inputRef}
        room="table"
      />
      {/* It goes in the space below the chat, so that it does not resize the chat. */}
      <div
        className="tw:relative tw:bottom-[0.3em] tw:h-0 tw:text-[0.75em]"
        id="game-chat-istyping"
      >
        <TypingMessage typing={typing} />
      </div>
    </>
  );
}
