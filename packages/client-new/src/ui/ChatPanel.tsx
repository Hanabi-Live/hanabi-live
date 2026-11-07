import { CHAT_EMOJIS as emojis } from "@hanabi-live/data";
import { Send } from "lucide-react";
import type { KeyboardEvent, SubmitEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import { sendChat } from "../chatCommands";
import type { LobbyConnection } from "../connection";
import type { LobbyState } from "../store";
import { emoteImages } from "../symbols";
import { Modal } from "./Modal";
import { RichText } from "./RichText";

const SERVER_NOTICE = "[Server Notice]";

function timestamp(datetime: string): string {
  const date = new Date(datetime);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function ChatPanel({
  channel,
  connection,
  onOptions,
  visible,
}: {
  channel: "lobby" | "table";
  connection: LobbyConnection;
  onOptions: (json: string) => void;
  visible: boolean;
}) {
  const {
    chat,
    welcome,
    tableID,
    connection: status,
    typing,
    users,
  } = useSelector(
    (state: LobbyState) => ({
      chat: state.chat,
      welcome: state.welcome,
      tableID: state.tableID,
      connection: state.connection,
      typing: state.typing,
      users: state.users,
    }),
    shallowEqual,
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [emojiOpen, setEmojiOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stuckToBottom = useRef(true);
  const lastTyped = useRef(0);
  const sent = useRef<Record<string, string[]>>({});
  const historyIndex = useRef(-1);
  useEffect(() => {
    if (
      (channel === "table" || tableID === null)
      && visible
      && document.activeElement === document.body
    ) {
      inputRef.current?.focus();
    }
  }, [channel, tableID, visible, welcome?.userID]);
  const room =
    channel === "table" && tableID !== null ? `table${tableID}` : "lobby";
  const draftKey = room;
  const text = drafts[draftKey] ?? "";
  function setText(value: string | ((current: string) => string)) {
    setDrafts((current: Readonly<Record<string, string>>) => ({
      ...current,
      [draftKey]:
        typeof value === "function" ? value(current[draftKey] ?? "") : value,
    }));
  }
  const messages = chat.filter((message) => {
    // Private messages have no room, so they appear in whichever chat is in use.
    if (message.recipient && !message.room) {
      return tableID === null ? channel === "lobby" : channel === "table";
    }
    return (message.room === "" ? "lobby" : (message.room ?? "lobby")) === room;
  });
  useEffect(() => {
    if (stuckToBottom.current) {
      messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
    }
    if (
      channel === "table"
      && visible
      && tableID !== null
      && status === "online"
      && document.visibilityState === "visible"
    ) {
      connection.send("chatRead", { tableID });
    }
  }, [chat, channel, tableID, status, connection, visible]);
  useEffect(() => {
    stuckToBottom.current = true;
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
    historyIndex.current = -1;
  }, [draftKey]);
  if (!welcome) {
    return null;
  }
  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (welcome === null || !text.trim()) {
      return;
    }
    if (new TextEncoder().encode(text).length > 300) {
      connection.notice(
        "Keep messages under 300 bytes. Emoji can use more than one byte.",
      );
      return;
    }
    const lastPM = chat.findLast(
      (message) =>
        message.source === "user"
        && message.recipient === welcome.username
        && message.who !== undefined,
    );
    const replyTo = lastPM?.who;
    const delivered = sendChat(
      connection,
      text,
      room,
      welcome,
      tableID,
      replyTo,
    );
    if (delivered) {
      sent.current[draftKey] = [
        ...(sent.current[draftKey] ?? []).slice(-49),
        text,
      ];
      historyIndex.current = -1;
      setText("");
      setEmojiOpen(false);
      stuckToBottom.current = true;
    }
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const history = sent.current[draftKey] ?? [];
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
    if (event.key === "ArrowUp" && !text.includes("\n") && history.length > 0) {
      event.preventDefault();
      historyIndex.current = Math.min(
        historyIndex.current + 1,
        history.length - 1,
      );
      setText(history[history.length - 1 - historyIndex.current] ?? "");
    }
    if (event.key === "ArrowDown" && historyIndex.current >= 0) {
      event.preventDefault();
      historyIndex.current--;
      setText(
        historyIndex.current < 0
          ? ""
          : (history[history.length - 1 - historyIndex.current] ?? ""),
      );
    }
    if (event.key === "Tab" && text) {
      const tail = text.split(/\s+/u).at(-1) ?? "";
      const match = Object.values(chat)
        .map((message) => message.who)
        .find(
          (name) =>
            name !== undefined
            && name.toLowerCase().startsWith(tail.toLowerCase()),
        );
      if (match) {
        event.preventDefault();
        setText(`${text.slice(0, text.length - tail.length) + match} `);
      }
    }
  }
  const names = typing[room] ?? [];
  return (
    <section
      aria-label={channel === "table" ? "Pre-game Chat" : "Chat"}
      className="chat-panel box"
      id={channel === "table" ? "lobby-chat-pregame" : "lobby-chat"}
    >
      <header className="chat-header">
        <h3 className="lobby-title">
          {channel === "table" ? (
            "Pre-game Chat"
          ) : (
            <>
              Lobby Chat
              <span className="only-on-narrow-screen">
                {" "}
                ({Object.keys(users).length} online)
              </span>
            </>
          )}
        </h3>
      </header>
      <div
        aria-label={`${channel} messages`}
        aria-live="polite"
        className="chat-messages lobby-chat-text-box"
        onScroll={() => {
          const box = messagesRef.current;
          if (box) {
            stuckToBottom.current =
              box.scrollHeight - box.scrollTop - box.clientHeight < 60;
          }
        }}
        ref={messagesRef}
        role="log"
        tabIndex={0}
      >
        {messages.map((message, index) => (
          <article
            className="chat-message"
            key={
              message.chatID
                ? `chat-${message.chatID}`
                : message.pmID
                  ? `pm-${message.pmID}`
                  : `${message.datetime}-${index}`
            }
          >
            <time dateTime={message.datetime}>
              [{timestamp(message.datetime)}]
            </time>
            {"\u{A0} "}
            {message.recipient ? (
              <>
                <span className="red">
                  [PM {message.recipient === welcome.username ? "from" : "to"}{" "}
                  <strong>
                    {message.recipient === welcome.username
                      ? message.who
                      : message.recipient}
                  </strong>
                  ]
                </span>
                {"\u{A0} "}
              </>
            ) : (
              message.who
              && message.source !== "server" && (
                <>
                  &lt;<strong>{message.who}</strong>&gt;{"\u{A0} "}
                </>
              )
            )}
            <span className="message-content">
              {message.source === "server"
                && message.msg.startsWith(SERVER_NOTICE) && (
                  <>
                    <span className="red">{SERVER_NOTICE}</span>{" "}
                  </>
                )}
              <RichText
                html={
                  message.source === "server"
                  && message.msg.startsWith(SERVER_NOTICE)
                    ? message.msg.slice(SERVER_NOTICE.length).trimStart()
                    : message.msg
                }
                {...(message.source === "server" ? { onOptions } : {})}
              />
            </span>
          </article>
        ))}
      </div>
      <div aria-live="polite" className="typing">
        {names.length > 0
          ? `${names.join(", ")} ${names.length === 1 ? "is" : "are"} typing...`
          : ""}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <textarea
          aria-label={
            channel === "table" ? "Pre-game chat message" : "Chat message"
          }
          disabled={status !== "online" || welcome.muted}
          maxLength={300}
          onChange={(event) => {
            setText(event.target.value);
            if (
              channel === "table"
              && tableID !== null
              && Date.now() - lastTyped.current > 1000
            ) {
              lastTyped.current = Date.now();
              connection.send("chatTyping", { tableID });
            }
          }}
          onKeyDown={keyDown}
          placeholder={
            welcome.muted ? "Chat is muted for this account." : "Chat"
          }
          ref={inputRef}
          rows={1}
          value={text}
        />
        <div className="composer-actions">
          <button
            aria-expanded={emojiOpen}
            aria-label={
              channel === "table" ? "Choose pre-game emoji" : "Choose emoji"
            }
            className="icon-button emoji-button"
            onClick={() => {
              // The picker returns focus here when it closes.
              inputRef.current?.focus();
              setEmojiOpen(true);
            }}
            type="button"
          >
            <i aria-hidden="true" className="fas fa-smile" />
          </button>
          <button
            aria-label={
              channel === "table" ? "Send pre-game message" : "Send message"
            }
            className="sr-only focusable-send"
            disabled={status !== "online" || !text.trim() || welcome.muted}
            type="submit"
          >
            <Send size={17} />
          </button>
        </div>
      </form>
      {emojiOpen && (
        <Modal
          close={() => setEmojiOpen(false)}
          description="Choose an emote or emoji to add to your message."
          title="Select Emote / Emoji"
        >
          <div id="emoji-picker">
            {[...emoteImages].map(([name, image]) => (
              <button
                aria-label={name}
                className="emoji-choice"
                key={name}
                onClick={() => {
                  setText((current) => `${current}${name} `);
                  setEmojiOpen(false);
                }}
                title={name}
                type="button"
              >
                <img
                  alt={name}
                  className="chat-emote"
                  loading="lazy"
                  src={image}
                />
              </button>
            ))}
            {Object.entries(emojis).map(([name, emoji]) => (
              <button
                aria-label={name}
                className="emoji-choice emoji-item"
                key={name}
                onClick={() => {
                  setText((current) => `${current}${emoji}`);
                  setEmojiOpen(false);
                }}
                title={`:${name}:`}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
