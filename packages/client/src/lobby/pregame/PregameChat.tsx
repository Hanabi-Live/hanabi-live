// The chat for the people at the table that we are at, before its game starts.

import { useRef } from "react";
import { getTypingMessage } from "../../chat";
import { useAppSelector } from "../../store";
import { ChatInput, ChatTextBox } from "../chat/ChatBox";
import { acceptOptionsFromGuest } from "../createGame";

export const PREGAME_CHAT_INPUT_ID = "lobby-chat-pregame-input";

export function PregameChat(): React.JSX.Element {
  const lines = useAppSelector((state) => state.pregame.chatLines);
  const typing = useAppSelector((state) => state.pregame.typing);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <h3 className="lobby-title">Pre-game Chat</h3>
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
            return;
          }

          // A suggestion to the owner to change the table.
          const button = event.target.closest("button.new-options");
          if (button instanceof HTMLButtonElement) {
            const lineElement = button.closest<HTMLElement>("[data-key]");
            const key = Number(lineElement?.dataset["key"]);
            const line = lines.find((chatLine) => chatLine.key === key);
            if (line?.suggestion !== undefined) {
              acceptOptionsFromGuest(line.suggestion);
              button.textContent = "sent";
              button.disabled = true;
            }
          }
        }}
      />
      <ChatInput id={PREGAME_CHAT_INPUT_ID} ref={inputRef} room="table" />
      <div
        className="istyping"
        // The message escapes the names.
        dangerouslySetInnerHTML={{ __html: getTypingMessage(typing) }}
      />
    </>
  );
}
