import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  History,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Direction, SampleTable } from "./data";
import { directions, initialMessages, people, sampleTables } from "./data";

function Mark() {
  return (
    <svg aria-hidden="true" className="proto-mark" viewBox="0 0 36 36">
      <path
        d="M18 3v9M18 24v9M3 18h9M24 18h9M7.4 7.4l6.4 6.4M22.2 22.2l6.4 6.4M7.4 28.6l6.4-6.4M22.2 13.8l6.4-6.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3.2"
      />
      <circle cx="18" cy="18" fill="currentColor" r="3" />
    </svg>
  );
}

function Cards({ large = false }: { large?: boolean }) {
  return (
    <div
      aria-label="A hand of five Hanabi cards"
      className={`proto-cards-art ${large ? "large" : ""}`}
      role="img"
    >
      {["red", "yellow", "green", "blue", "white"].map((color, index) => (
        <div className={`proto-playing-card card-${color}`} key={color}>
          <b>{index + 1}</b>
          <Mark />
          <span>{index + 1}</span>
        </div>
      ))}
    </div>
  );
}

function Seats({ table }: { table: SampleTable }) {
  return (
    <div
      aria-label={`${table.players.length} of ${table.seats} seats filled`}
      className="proto-seats"
    >
      {Array.from({ length: table.seats }, (_, index) => (
        <span
          className={table.players[index] ? "occupied" : "vacant"}
          key={index}
        >
          {table.players[index]?.slice(0, 1) ?? <Plus size={12} />}
        </span>
      ))}
    </div>
  );
}

function Friends({ expanded = false }: { expanded?: boolean }) {
  return (
    <section aria-label="Sample online friends" className="proto-friends">
      <header>
        <h2>Your circle</h2>
        <span>{people.length} online</span>
      </header>
      <div className="proto-friends-list">
        {people.map((person) => (
          <div className="proto-person" key={person.name}>
            <span className={`proto-avatar ${person.color}`}>
              {person.initial}
              <i />
            </span>
            <div>
              <strong>{person.name}</strong>
              {expanded && <small>{person.note}</small>}
            </div>
            <span className="proto-person-status">Online</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LobbyPrototype({ direction }: { direction: Direction }) {
  const [tables, setTables] = useState(sampleTables);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedID, setSelectedID] = useState(1);
  const [joinedID, setJoinedID] = useState<number | null>(null);
  const [dialog, setDialog] = useState<
    "create" | "join" | "history" | "friends" | "settings" | null
  >(null);
  const [tableName, setTableName] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const selected = tables.find((table) => table.id === selectedID) ?? tables[0];
  if (!selected) {
    throw new Error("Prototype is missing its sample table.");
  }
  const filtered = tables.filter(
    (table) =>
      `${table.name} ${table.variant} ${table.players.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase())
      && (filter !== "open" || !table.playing)
      && (filter !== "friends" || table.friend),
  );
  function openTable(table: SampleTable) {
    setSelectedID(table.id);
    if (direction.layout !== "detail" && direction.layout !== "felt") {
      setDialog("join");
    }
  }
  const navigation = (
    <nav aria-label="Lobby navigation" className="proto-navigation">
      <button
        aria-current="page"
        className="active"
        onClick={() => setDialog(null)}
      >
        <Sparkles size={18} />
        <span>Play</span>
      </button>
      <button onClick={() => setDialog("history")}>
        <History size={18} />
        <span>History</span>
      </button>
      <button onClick={() => setDialog("friends")}>
        <Users size={18} />
        <span>Friends</span>
      </button>
      <button onClick={() => setDialog("settings")}>
        <Settings2 size={18} />
        <span>Settings</span>
      </button>
    </nav>
  );
  const tools = (
    <div className="proto-tools">
      <label className="proto-search">
        <Search size={17} />
        <input
          aria-label="Find a table"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a table or a player"
          value={search}
        />
      </label>
      <div aria-label="Filter tables" className="proto-filters">
        {(
          [
            ["all", "All tables"],
            ["open", "Open seats"],
            ["friends", "Friends"],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-pressed={filter === value}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
  const tableList = (
    <div
      aria-label="Sample tables"
      className={`proto-tables ${direction.layout === "cards" || direction.layout === "featured" || direction.layout === "social" ? "table-cards" : "table-rows"}`}
    >
      {filtered.length === 0 && (
        <div className="proto-empty">
          <Search size={24} />
          <h2>No tables found</h2>
          <p>Try a different name or clear the filters.</p>
          <button
            className="proto-secondary"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {filtered.map((table) => (
        <article
          className={`proto-table ${table.playing ? "is-playing" : ""} ${selectedID === table.id ? "is-selected" : ""}`}
          key={table.id}
        >
          <span
            aria-hidden="true"
            className={`proto-table-symbol ${table.variant.startsWith("Rainbow") ? "rainbow" : ""}`}
          >
            <Mark />
          </span>
          <div className="proto-table-info">
            <button
              className="proto-table-title"
              onClick={() => openTable(table)}
            >
              {table.name}
              {table.friend && <Star aria-label="A friend is here" size={13} />}
            </button>
            <span>{table.variant}</span>
          </div>
          <div className="proto-table-players">
            <Seats table={table} />
            <span>
              {table.players.length} / {table.seats} players
            </span>
          </div>
          <span className="proto-pace">
            <Clock3 size={13} />
            {table.pace}
          </span>
          <button
            className={`proto-table-action ${table.playing ? "watch" : ""}`}
            disabled={joinedID === table.id}
            onClick={() => {
              setSelectedID(table.id);
              setDialog("join");
            }}
          >
            {joinedID === table.id ? (
              <>
                <Check size={14} /> Seated
              </>
            ) : table.playing ? (
              <>
                <Eye size={14} /> Watch
              </>
            ) : (
              <>
                Join <ArrowRight size={14} />
              </>
            )}
          </button>
        </article>
      ))}
    </div>
  );
  const chat = (
    <section
      aria-label="Sample lobby chat"
      className={`proto-chat ${chatOpen ? "" : "chat-collapsed"}`}
    >
      <header>
        <div>
          <MessageCircle size={17} />
          <h2>Lobby chat</h2>
          <span className="proto-live-dot" />
        </div>
        <button
          aria-label={chatOpen ? "Collapse chat" : "Expand chat"}
          onClick={() => setChatOpen(!chatOpen)}
        >
          <ChevronDown size={17} />
        </button>
      </header>
      {chatOpen && (
        <>
          <div
            aria-label="Prototype chat messages"
            className="proto-chat-messages"
            role="log"
            tabIndex={0}
          >
            <p className="proto-chat-day">A good day for a good game</p>
            {messages.map((message, index) => (
              <article
                className={`proto-message ${message.who === "You" ? "from-you" : ""}`}
                key={`${index}-${message.who}`}
              >
                <span
                  className={`proto-avatar ${["rose", "blue", "green", "gold"][index % 4]}`}
                >
                  {message.who.slice(0, 1)}
                </span>
                <div>
                  <header>
                    <strong>{message.who}</strong>
                    <time>{message.time}</time>
                  </header>
                  <p>{message.text}</p>
                </div>
              </article>
            ))}
          </div>
          <form
            className="proto-composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) {
                setMessages(
                  (
                    current: ReadonlyArray<(typeof initialMessages)[number]>,
                  ) => [
                    ...current,
                    { who: "You", text: draft.trim(), time: "Now" },
                  ],
                );
                setDraft("");
              }
            }}
          >
            <input
              aria-label="Sample chat message"
              maxLength={300}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Say hello..."
              value={draft}
            />
            <button aria-label="Send sample message" disabled={!draft.trim()}>
              <Send size={17} />
            </button>
          </form>
          <p className="proto-chat-note">
            Sample conversation. Messages stay in this preview.
          </p>
        </>
      )}
    </section>
  );
  const tableDetail = (
    <section aria-label="Selected sample table" className="proto-detail">
      <div className="proto-detail-top">
        <span>{selected.variant}</span>
        <span>
          <Clock3 size={14} /> {selected.pace}
        </span>
      </div>
      <h2>{selected.name}</h2>
      <p>Good clues. Good company. An open seat for you.</p>
      <div className="proto-table-scene">
        <div className="proto-felt-surface">
          <Mark />
          <span>hanab live</span>
        </div>
        <Cards large />
        <div className="proto-scene-seats">
          {Array.from({ length: selected.seats }, (_, index) => (
            <div key={index}>
              <span
                className={`proto-avatar ${["rose", "blue", "green", "gold"][index % 4]}`}
              >
                {selected.players[index]?.slice(0, 1) ?? <Plus size={18} />}
              </span>
              <span>{selected.players[index] ?? "Your seat?"}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="proto-detail-bottom">
        <span>{selected.seats - selected.players.length} open seats</span>
        <button className="proto-primary" onClick={() => setDialog("join")}>
          Take a seat <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
  let dialogContent: ReactNode = null;
  let dialogTitle = "";
  switch (dialog) {
    case "create": {
      dialogTitle = "Make room for a game";
      dialogContent = (
        <form
          className="proto-dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            const id = Math.max(...tables.map((table) => table.id)) + 1;
            setTables((current) => [
              {
                id,
                name: tableName.trim(),
                variant: "No Variant",
                players: ["You"],
                seats: 4,
                pace: "Untimed",
                playing: false,
                friend: false,
              },
              ...current,
            ]);
            setSearch("");
            setFilter("all");
            setTableName("");
            setDialog(null);
            setNotice("Your sample table is ready. No live game was created.");
          }}
        >
          <label>
            Table name
            <input
              maxLength={60}
              onChange={(event) => setTableName(event.target.value)}
              placeholder="Something inviting"
              required
              value={tableName}
            />
          </label>
          <div className="proto-dialog-facts">
            <span>No Variant</span>
            <span>4 players</span>
            <span>Untimed</span>
          </div>
          <button className="proto-primary" disabled={!tableName.trim()}>
            Create sample table <Plus size={16} />
          </button>
        </form>
      );

      break;
    }

    case "join": {
      dialogTitle = selected.name;
      dialogContent = (
        <div className="proto-dialog-table">
          <Cards />
          <p>
            {selected.players.join(", ")}{" "}
            {selected.players.length === 1 ? "is" : "are"}{" "}
            {selected.playing ? "playing" : "waiting for teammates"}.
          </p>
          <div className="proto-dialog-facts">
            <span>{selected.variant}</span>
            <span>
              {selected.players.length} / {selected.seats} players
            </span>
            <span>{selected.pace}</span>
          </div>
          <button
            className="proto-primary"
            onClick={() => {
              if (!selected.playing) {
                setJoinedID(selected.id);
              }
              setDialog(null);
              setNotice(
                selected.playing
                  ? "Spectator view selected. This is a visual prototype, not a live game."
                  : `You joined "${selected.name}" in this preview only.`,
              );
            }}
          >
            {selected.playing ? "Preview spectating" : "Join sample table"}{" "}
            <ArrowRight size={16} />
          </button>
        </div>
      );

      break;
    }

    case "history": {
      dialogTitle = "A few good games";
      dialogContent = (
        <div className="proto-history">
          {[
            ["No Variant", "25 / 25", "Riley, Sam, you"],
            ["Rainbow (5 Suits)", "24 / 25", "Noor, Kit, you"],
            ["6 Suits", "29 / 30", "Morgan, Robin, you"],
          ].map(([variant, score, players]) => (
            <div key={variant}>
              <span>
                <strong>{variant}</strong>
                <small>{players}</small>
              </span>
              <b>{score}</b>
            </div>
          ))}
        </div>
      );

      break;
    }

    case "friends": {
      dialogTitle = "Better together";
      dialogContent = <Friends expanded />;

      break;
    }

    case "settings": {
      dialogTitle = "Make yourself at home";
      dialogContent = (
        <div className="proto-settings">
          <label>
            <input defaultChecked type="checkbox" /> Sound notifications
          </label>
          <label>
            <input defaultChecked type="checkbox" /> Colorblind-friendly card
            symbols
          </label>
          <label>
            <input type="checkbox" /> Reduce animations
          </label>
          <p>
            These controls are illustrative and do not change your account
            settings.
          </p>
        </div>
      );

      break;
    }
    // No default
  }
  return (
    <div className={`proto proto-${direction.id}`}>
      <header className="proto-header">
        <div className="proto-brand">
          <Mark />
          <span>
            hanab<span className="proto-brand-live">live</span>
          </span>
        </div>
        <span className="proto-header-note">A game is better together.</span>
        <div className="proto-presence">
          <span className="proto-live-dot" />
          128 online
        </div>
        <button
          aria-label="Sample notifications"
          className="proto-notifications"
          onClick={() =>
            setNotice("You're all caught up. These are sample notifications.")
          }
        >
          <Bell size={18} />
        </button>
        <button
          aria-label="Preview profile settings"
          className="proto-profile"
          onClick={() => setDialog("settings")}
        >
          <span className="proto-avatar you">Y</span>
          <span>You</span>
          <ChevronDown size={13} />
        </button>
      </header>
      <div className="proto-layout">
        <aside className="proto-sidebar">
          {navigation}
          <div className="proto-sidebar-note">
            <Mark />
            <p>
              One team.
              <br />A little trust.
              <br />A great game.
            </p>
          </div>
          <span className="proto-build-label">
            Design study {directions.indexOf(direction) + 1}
          </span>
        </aside>
        {direction.layout === "social" && (
          <aside className="proto-social-people">
            <Friends expanded />
            <div className="proto-invitation">
              <h2>Pull up a chair.</h2>
              <p>Invite your usual crew, or find a new one.</p>
              <button
                onClick={() =>
                  setNotice(
                    "Invite preview: share a table link after choosing a design.",
                  )
                }
              >
                Invite a friend <Plus size={14} />
              </button>
            </div>
          </aside>
        )}
        <main className="proto-main">
          <div className="proto-main-heading">
            <div>
              <h1>
                {direction.id === "paper"
                  ? "The game room."
                  : direction.id === "mono"
                    ? "Let's play."
                    : direction.id === "felt"
                      ? "Pull up a chair."
                      : direction.layout === "social"
                        ? "Open tables"
                        : direction.id === "arcade"
                          ? "Your next good game."
                          : "Find a table."}
              </h1>
              <p>
                {direction.id === "night-shift"
                  ? "Five tables. Plenty of possibilities."
                  : "Find your people. Make something brilliant together."}
              </p>
            </div>
            <button
              aria-label="Create sample table"
              className="proto-primary"
              onClick={() => setDialog("create")}
            >
              <Plus size={17} />
              <span>New table</span>
            </button>
          </div>
          {direction.layout === "featured" && (
            <section className="proto-featured">
              <div>
                <span className="proto-featured-tag">
                  <Users size={14} /> A friend has an open seat
                </span>
                <h2>The usual suspects</h2>
                <p>Riley and Sam are ready when you are.</p>
                <button
                  className="proto-primary"
                  onClick={() => {
                    setSelectedID(1);
                    setDialog("join");
                  }}
                >
                  Join the table <ArrowRight size={16} />
                </button>
              </div>
              <Cards />
            </section>
          )}
          {tools}
          <div className="proto-list-heading">
            <span>
              {filtered.length}{" "}
              {filter === "friends"
                ? "tables with friends"
                : "tables to explore"}
            </span>
            <span>
              <span className="proto-live-dot" /> Updated just now
            </span>
          </div>
          {direction.id === "signal" && (
            <div className="proto-column-labels">
              <span>Table / variant</span>
              <span>Players</span>
              <span>Pace</span>
              <span>Join</span>
            </div>
          )}
          {tableList}
          <div className="proto-main-footer">
            <span>New to Hanabi?</span>
            <button
              onClick={() =>
                setNotice(
                  "Hanabi is cooperative: help your teammates play their hidden cards in order. This gallery previews the lobby only.",
                )
              }
            >
              You're in good company. Learn the basics <ArrowRight size={14} />
            </button>
          </div>
        </main>
        {(direction.layout === "detail" || direction.layout === "felt")
          && tableDetail}
        <aside className="proto-community">
          {direction.layout !== "social" && <Friends />}
          {chat}
        </aside>
      </div>
      <footer className="proto-footer">
        <span>
          <span className="proto-live-dot" /> All systems peaceful
        </span>
        <span>
          {direction.name} / fictional sample data / no live connection
        </span>
        <span>Cooperation looks good on you.</span>
      </footer>
      {notice && (
        <div className="proto-toast" role="status">
          <Check size={18} />
          <span>{notice}</span>
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <Dialog.Root
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
          }
        }}
        open={dialog !== null}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="proto-dialog-overlay" />
          <Dialog.Content
            className={`proto proto-${direction.id} proto-dialog`}
          >
            <div className="proto-dialog-heading">
              <Dialog.Title>{dialogTitle}</Dialog.Title>
              <Dialog.Close asChild>
                <button aria-label="Close preview dialog">
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description>
              This is an interactive design sample. It does not connect to your
              account or live games.
            </Dialog.Description>
            {dialogContent}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
