import { CHAT_EMOJIS as emojis } from "@hanabi-live/data";
import { ArrowDown, Send, X } from "lucide-react";
import type { KeyboardEvent, SubmitEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import { sendChat } from "../chatCommands";
import type { LobbyConnection } from "../connection";
import type { LobbyState } from "../store";
import { emoteImages } from "../symbols";
import { RichText } from "./RichText";

export type ChatChannel = "lobby" | "table" | "private";

export function ChatPanel({
  channel,
  connection,
  onChannel: setChannel,
  recipient,
  onRecipient,
  onOptions,
  visible,
}: {
  channel: ChatChannel;
  connection: LobbyConnection;
  onChannel: (channel: ChatChannel) => void;
  recipient: string;
  onRecipient: (name: string) => void;
  onOptions: (json: string) => void;
  visible: boolean;
}) {
  const {
    chat,
    welcome,
    tableID,
    connection: status,
    typing,
    pmHasMore,
    unreadPMs,
  } = useSelector(
    (state: LobbyState) => ({
      chat: state.chat,
      welcome: state.welcome,
      tableID: state.tableID,
      connection: state.connection,
      typing: state.typing,
      pmHasMore: state.pmHasMore,
      unreadPMs: state.unreadPMs,
    }),
    shallowEqual,
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [showEmotes, setShowEmotes] = useState(false);
  const [unread, setUnread] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recipientRef = useRef<HTMLInputElement>(null);
  const stuckToBottom = useRef(true);
  const lastTyped = useRef(0);
  const sent = useRef<Record<string, string[]>>({});
  const historyIndex = useRef(-1);
  useEffect(() => {
    if (
      (channel === "table" || (channel === "lobby" && tableID === null))
      && visible
      && document.activeElement === document.body
    ) {
      inputRef.current?.focus();
    }
  }, [channel, tableID, visible, welcome?.userID]);
  useEffect(() => {
    if (
      channel === "private"
      && document.activeElement !== recipientRef.current
    ) {
      inputRef.current?.focus();
    }
  }, [channel, recipient]);
  const room =
    channel === "table" && tableID !== null ? `table${tableID}` : "lobby";
  const draftKey =
    channel === "private" ? `private:${recipient.toLowerCase()}` : room;
  const text = drafts[draftKey] ?? "";
  function setText(value: string | ((current: string) => string)) {
    setDrafts((current: Readonly<Record<string, string>>) => ({
      ...current,
      [draftKey]:
        typeof value === "function" ? value(current[draftKey] ?? "") : value,
    }));
  }
  const messages = chat.filter((message) => {
    const privateMessage = Boolean(message.recipient);
    if (channel === "private") {
      return (
        privateMessage
        && (!recipient
          || message.who?.toLowerCase() === recipient.toLowerCase()
          || message.recipient?.toLowerCase() === recipient.toLowerCase())
      );
    }
    if (privateMessage) {
      return false;
    }
    return (message.room === "" ? "lobby" : (message.room ?? "lobby")) === room;
  });
  useEffect(() => {
    if (stuckToBottom.current) {
      messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
    } else {
      setUnread(true);
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
    setUnread(false);
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
    historyIndex.current = -1;
  }, [draftKey]);
  useEffect(() => {
    if (
      channel === "private"
      && visible
      && document.visibilityState === "visible"
    ) {
      connection.markPrivateRead(recipient);
    }
  }, [channel, visible, recipient, chat, connection]);
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
      (message) => message.recipient !== undefined && message.recipient !== "",
    );
    const replyTo =
      lastPM?.who === welcome.username ? lastPM.recipient : lastPM?.who;
    const delivered =
      channel === "private"
      && !/^\/(?:pm|pmhistory|r|w|whisper)(?:\s|$)/u.test(text)
        ? recipient.trim()
          ? connection.send("chatPM", {
              recipient: recipient.trim(),
              msg: text,
            })
          : (connection.notice("Choose a recipient for your private message."),
            false)
        : sendChat(connection, text, room, welcome, tableID, replyTo);
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
  const privateIDs = messages.flatMap((message) =>
    message.pmID ? [message.pmID] : [],
  );
  return (
    <section
      aria-label={channel === "table" ? "Pre-game Chat" : "Chat"}
      className="chat-panel box"
      id={channel === "table" ? "lobby-chat-pregame" : "lobby-chat"}
    >
      <header className="chat-header">
        <h3 className="lobby-title">
          {channel === "table"
            ? "Pre-game Chat"
            : channel === "private"
              ? "Private Messages"
              : "Lobby Chat"}
        </h3>
        {channel !== "table" && (
          <div className="filter-tabs">
            {channel === "private" && (
              <button onClick={() => setChannel("lobby")}>Lobby</button>
            )}
            <button
              aria-pressed={channel === "private"}
              onClick={() => setChannel("private")}
            >
              Messages{" "}
              {Object.values(unreadPMs).reduce((sum, count) => sum + count, 0)
                > 0 && (
                <span className="unread-badge">
                  {Object.values(unreadPMs).reduce(
                    (sum, count) => sum + count,
                    0,
                  )}
                </span>
              )}
            </button>
          </div>
        )}
      </header>
      {channel === "private" && (
        <div className="pm-controls">
          <label>
            To
            <input
              aria-label="Message recipient"
              onChange={(event) => onRecipient(event.target.value)}
              placeholder="Username"
              ref={recipientRef}
              value={recipient}
            />
          </label>
          <button
            onClick={() =>
              connection.send("chatPMHistoryGet", {
                amount: 20,
                ...(recipient && { username: recipient }),
                room: "lobby",
              })
            }
          >
            History
          </button>
          {pmHasMore && (
            <button
              onClick={() =>
                connection.send("chatPMHistoryGet", {
                  amount: 20,
                  ...(recipient && { username: recipient }),
                  ...(privateIDs.length > 0 && {
                    beforeID: Math.min(...privateIDs),
                  }),
                  room: "lobby",
                })
              }
            >
              Older
            </button>
          )}
        </div>
      )}
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
          if (stuckToBottom.current) {
            setUnread(false);
          }
        }}
        ref={messagesRef}
        role="log"
        tabIndex={0}
      >
        {messages.length === 0 && channel === "private" && (
          <p className="chat-empty">
            Private messages are only visible to you and the recipient.
          </p>
        )}
        {messages.map((message, index) => (
          <article
            className={`chat-message ${message.recipient ? "private-message" : ""}`}
            key={
              message.chatID
                ? `chat-${message.chatID}`
                : message.pmID
                  ? `pm-${message.pmID}`
                  : `${message.datetime}-${index}`
            }
          >
            <time dateTime={message.datetime}>
              [
              {new Date(message.datetime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
              ]
            </time>{" "}
            {message.who && (
              <>
                {message.recipient ? "[PM " : "<"}
                <button
                  className="name-button"
                  disabled={message.source === "server"}
                  onClick={() => {
                    if (message.who && message.source !== "server") {
                      onRecipient(
                        message.who === welcome.username
                          ? (message.recipient ?? "")
                          : message.who,
                      );
                    }
                  }}
                >
                  {message.who}
                </button>
                {message.recipient ? ` to ${message.recipient}] ` : "> "}
              </>
            )}
            <span className="message-content">
              <RichText
                html={message.msg}
                {...(message.source === "server" ? { onOptions } : {})}
              />
            </span>
          </article>
        ))}
      </div>
      {unread && (
        <button
          className="new-messages"
          onClick={() => {
            stuckToBottom.current = true;
            setUnread(false);
            messagesRef.current?.scrollTo({
              top: messagesRef.current.scrollHeight,
            });
          }}
        >
          New messages <ArrowDown size={14} />
        </button>
      )}
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
            welcome.muted
              ? "Chat is muted for this account."
              : channel === "private"
                ? "Private message"
                : "Chat"
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
            onClick={() => setEmojiOpen(!emojiOpen)}
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
        <div className="emoji-picker">
          <div>
            <input
              aria-label="Find emoji"
              onChange={(event) => setEmojiSearch(event.target.value)}
              placeholder="Find an emoji..."
              value={emojiSearch}
            />
            <button
              aria-label="Close emoji picker"
              className="icon-button"
              onClick={() => setEmojiOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
          <div className="filter-tabs">
            <button
              aria-pressed={!showEmotes}
              onClick={() => setShowEmotes(false)}
            >
              Emoji
            </button>
            <button
              aria-pressed={showEmotes}
              onClick={() => setShowEmotes(true)}
            >
              Emotes
            </button>
          </div>
          <div className="emoji-grid">
            {showEmotes
              ? [...emoteImages]
                  .filter(([name]) =>
                    name.toLowerCase().includes(emojiSearch.toLowerCase()),
                  )
                  .slice(0, 100)
                  .map(([name, image]) => (
                    <button
                      aria-label={name}
                      key={name}
                      onClick={() => {
                        setText(
                          (current) =>
                            `${current}${current.endsWith(" ") || current === "" ? "" : " "}${name} `,
                        );
                        inputRef.current?.focus();
                      }}
                      title={name}
                    >
                      <img
                        alt={name}
                        className="chat-emote"
                        loading="lazy"
                        src={image}
                      />
                    </button>
                  ))
              : Object.entries(emojis)
                  .filter(([name]) => name.includes(emojiSearch.toLowerCase()))
                  .slice(0, 100)
                  .map(([name, emoji]) => (
                    <button
                      aria-label={name}
                      key={name}
                      onClick={() => {
                        setText((current) => `${current}${emoji}`);
                        inputRef.current?.focus();
                      }}
                      title={name}
                    >
                      {emoji}
                    </button>
                  ))}
          </div>
        </div>
      )}
    </section>
  );
}
