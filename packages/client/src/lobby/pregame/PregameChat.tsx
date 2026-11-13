// The chat for the people at the table that we are at, before its game starts.

import { useRef } from "react";
import { useAppSelector } from "../../store.ts";
import { ChatInput, ChatTextBox, TypingMessage } from "../chat/ChatBox.tsx";

export const PREGAME_CHAT_INPUT_ID = "lobby-chat-pregame-input";

export function PregameChat(): React.JSX.Element {
  const lines = useAppSelector((state) => state.pregame.chatLines);
  const typing = useAppSelector((state) => state.pregame.typing);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <h3 className="tw:text-[1.3em]">Pre-game Chat</h3>
      <ChatTextBox
        id="lobby-chat-pregame-text"
        lines={lines}
        onClick={(event) => {
          if (!(event.target instanceof Element)) {
            return;
          }

          // A suggested chat command, which we can edit before we send it.
          const suggestion = event.target.closest("a.suggestion");
          if (suggestion !== null) {
            event.preventDefault();
            const input = inputRef.current!;
            input.value = suggestion.textContent;
            input.focus();
          }
        }}
      />
      <ChatInput id={PREGAME_CHAT_INPUT_ID} ref={inputRef} room="table" />
      <div
        className="tw:relative tw:bottom-[0.3em] tw:h-0 tw:text-[0.75em]"
        id="lobby-chat-pregame-istyping"
      >
        <TypingMessage typing={typing} />
      </div>
    </>
  );
}
