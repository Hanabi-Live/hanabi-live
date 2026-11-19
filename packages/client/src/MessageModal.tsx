// The message modals: a warning, an error, the idle warning, a question, and the password of a
// table. "modals.ts" opens and closes the dialog that holds them.

import { IDLE_WARNING_MS, SECONDS_PER_MINUTE } from "@hanabi-live/data";
import { millisecondsToClockString } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LOCAL_STORAGE_KEY } from "./constants.ts";
import { useReducedMotion } from "./fade.ts";
import { BREATHE_MILLISECONDS } from "./game/newUi/ReconnectingPanel.tsx";
import { globals } from "./Globals.ts";
import { signOut } from "./lobby/signOut.ts";
import type { ErrorCause, MessageModal as Modal } from "./messageModalSlice.ts";
import { closeModals, confirm, keepPlaying } from "./modals.ts";
import { useAppSelector } from "./store.ts";

/**
 * The text of a warning or an error. A list in it (such as the versions of an outdated client) has
 * the same space above and below.
 */
const MESSAGE_CLASS_NAME = "tw:[&_ul]:my-[1em]";

/**
 * The text of an error sits in the middle, under its title. A stack trace keeps its lines on the
 * left and scrolls, and a list loses its bullets, so that it stays in the middle too.
 */
const ERROR_MESSAGE_CLASS_NAME =
  "tw:w-full tw:text-balance tw:text-game-muted tw:[&_ul]:list-none tw:[&_ul]:p-0 tw:[&_pre]:max-h-[12em] tw:[&_pre]:overflow-auto tw:[&_pre]:text-left";

/** The icon of each cause of an error, in its color. */
const ERROR_ICONS = {
  disconnected: "fa-plug tw:text-game-turn",
  maintenance: "fa-plug tw:text-game-turn",
  failed: "fa-exclamation-triangle tw:text-game-error",
} as const satisfies Record<ErrorCause, string>;

const ERROR_TITLES = {
  disconnected: "You were disconnected.",
  maintenance: "The server is down.",
  failed: "Something went wrong.",
} as const satisfies Record<ErrorCause, string>;

export function MessageModal(): React.JSX.Element | undefined {
  const modal = useAppSelector((state) => state.messageModal.modal);
  const count = useAppSelector((state) => state.messageModal.count);
  // Each modal starts again, so that it focuses its button.
  return modal === undefined ? undefined : (
    <ModalContent key={count} modal={modal} />
  );
}

function ModalContent({ modal }: { readonly modal: Modal }) {
  switch (modal.type) {
    case "warning": {
      return (
        <section id="warning-modal">
          <h3>Warning</h3>
          {/* Warnings can hold markup from the server and the client. */}
          <p
            className={MESSAGE_CLASS_NAME}
            dangerouslySetInnerHTML={{ __html: modal.html }}
          />
          <ul className="actions">
            <li>
              <Button autoFocus onClick={closeModals}>
                Close
              </Button>
            </li>
          </ul>
        </section>
      );
    }

    case "error": {
      return <ErrorModal modal={modal} />;
    }

    case "idle": {
      return <IdleModal modal={modal} />;
    }

    case "confirm": {
      return (
        <section id="confirm-modal">
          <h3>{modal.title}</h3>
          <p>{modal.description}</p>
          <ul className="actions">
            <li>
              <Button autoFocus onClick={confirm}>
                {modal.confirmText}
              </Button>
            </li>
            <li>
              <Button onClick={closeModals}>Cancel</Button>
            </li>
          </ul>
        </section>
      );
    }

    case "password": {
      return <PasswordModal tableId={modal.tableId} />;
    }
  }
}

/**
 * An error, after which the page must load again. While the client waits for the server to come
 * back from maintenance, the icon breathes, like the icon of the panel that shows while the game
 * reconnects. The breath only decorates.
 */
function ErrorModal({
  modal,
}: {
  readonly modal: Extract<Modal, { type: "error" }>;
}) {
  const reducedMotion = useReducedMotion();
  const iconRef = useRef<HTMLElement>(null);
  const waiting = modal.cause === "maintenance";

  useLayoutEffect(() => {
    const icon = iconRef.current;
    if (!waiting || icon === null || reducedMotion) {
      return undefined;
    }

    const breathe = icon.animate(
      [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }],
      {
        duration: BREATHE_MILLISECONDS,
        easing: "ease-in-out",
        iterations: Infinity,
      },
    );
    return () => {
      breathe.cancel();
    };
  }, [waiting, reducedMotion]);

  return (
    <section
      className="tw:flex tw:flex-col tw:items-center tw:text-center"
      id="error-modal"
    >
      <div className="tw:flex tw:size-[5em] tw:items-center tw:justify-center tw:rounded-full tw:ring-[0.25em] tw:ring-game-line/30">
        <i
          aria-hidden="true"
          className={`fas ${ERROR_ICONS[modal.cause]} tw:text-[2em]`}
          ref={iconRef}
        />
      </div>
      <h3 className="tw:mt-[0.75em] tw:mb-[0.25em]">
        {ERROR_TITLES[modal.cause]}
      </h3>
      {/* Errors can hold the formatted stack trace from "errors.ts". */}
      <p
        className={`${MESSAGE_CLASS_NAME} ${ERROR_MESSAGE_CLASS_NAME}`}
        dangerouslySetInnerHTML={{ __html: modal.html }}
      />
      <ul className="actions tw:justify-center">
        <li>
          <Button
            autoFocus
            onClick={() => {
              globalThis.location.reload();
            }}
            variant="primary"
          >
            Reload
          </Button>
        </li>
        <li>
          <Button onClick={signOut} variant="alt">
            Sign out
          </Button>
        </li>
      </ul>
    </section>
  );
}

/** How long the ring of the idle warning takes to fill up again after "Keep playing". */
const IDLE_REFILL_MILLISECONDS = 250;

/** The radius of the ring of the idle warning, in the units of its view box (0 to 100). */
const IDLE_RING_RADIUS = 45;

function IdleModal({
  modal,
}: {
  readonly modal: Extract<Modal, { type: "idle" }>;
}) {
  const reducedMotion = useReducedMotion();
  const [now, setNow] = useState(Date.now);
  // "Keep playing" fills the ring up again before the modal closes, so that the player sees the
  // time go back to the start.
  const [refilling, setRefilling] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, SECOND_IN_MILLISECONDS);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!refilling) {
      return undefined;
    }

    const timeout = setTimeout(keepPlaying, IDLE_REFILL_MILLISECONDS);
    return () => {
      clearTimeout(timeout);
    };
  }, [refilling]);

  const remaining = refilling
    ? IDLE_WARNING_MS
    : Math.max(0, modal.deadline - now);
  const fraction = Math.min(1, remaining / IDLE_WARNING_MS);
  const lastMinute = remaining < SECONDS_PER_MINUTE * SECOND_IN_MILLISECONDS;
  const colorClass = lastMinute ? "tw:text-game-error" : "tw:text-game-turn";

  return (
    <section
      className="tw:flex tw:flex-col tw:items-center tw:text-center"
      id="idle-modal"
    >
      <div className="tw:relative tw:size-[8.5em]">
        <svg
          aria-hidden
          className="tw:size-full tw:-rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            className="tw:stroke-game-line/30"
            cx="50"
            cy="50"
            fill="none"
            r={IDLE_RING_RADIUS}
            strokeWidth="6"
          />
          <circle
            className={`tw:stroke-current ${colorClass}`}
            cx="50"
            cy="50"
            fill="none"
            pathLength={1}
            r={IDLE_RING_RADIUS}
            strokeDasharray="1 1"
            // The spent time grows clockwise from the top, like the hand of a clock.
            strokeDashoffset={fraction - 1}
            strokeLinecap="round"
            strokeWidth="6"
            style={
              refilling
                ? {
                    transition: `stroke-dashoffset ${IDLE_REFILL_MILLISECONDS}ms ease-out`,
                  }
                : undefined
            }
          />
        </svg>
        <span
          className={`tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:text-[2.25em] tw:font-semibold tw:tabular-nums ${colorClass}`}
          role="timer"
        >
          {millisecondsToClockString(remaining)}
        </span>
      </div>
      <h3 className="tw:mt-[0.5em] tw:mb-[0.25em]">This game ends soon.</h3>
      <p className="tw:text-game-muted">
        No one has taken a turn for a while.
        {!modal.canKeepPlaying && " Only a player can keep it going."}
      </p>
      <ul className="actions tw:justify-center">
        {modal.canKeepPlaying && (
          <li>
            <Button
              autoFocus
              onClick={() => {
                if (reducedMotion) {
                  keepPlaying();
                } else {
                  setRefilling(true);
                }
              }}
              variant="primary"
            >
              Keep playing
            </Button>
          </li>
        )}
        <li>
          <Button
            autoFocus={!modal.canKeepPlaying}
            onClick={closeModals}
            variant={modal.canKeepPlaying ? "alt" : undefined}
          >
            Dismiss
          </Button>
        </li>
      </ul>
    </section>
  );
}

function PasswordModal({ tableId }: { readonly tableId: number }) {
  // It starts with the password that we typed last.
  const [password, setPassword] = useState(
    () => localStorage.getItem(LOCAL_STORAGE_KEY.JOIN_TABLE_PASSWORD) ?? "",
  );

  function submit() {
    globals.connection.send("tableJoin", {
      tableId,
      ...(password !== "" && { password }),
    });
    localStorage.setItem(LOCAL_STORAGE_KEY.JOIN_TABLE_PASSWORD, password);
    closeModals();
  }

  return (
    <section id="password-modal">
      <h3>Enter Password</h3>
      <p>Enter the password for this game:</p>
      {/* The modal only asks for the password. */}
      <input
        autoFocus
        id="password-modal-password"
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        onFocus={(event) => {
          event.target.select();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }

          event.preventDefault();
          submit();
        }}
        placeholder="Password"
        type="text"
        value={password}
      />
      <br />
      <ul className="actions">
        <li>
          <Button onClick={submit}>Submit</Button>
        </li>
        <li>
          <Button onClick={closeModals}>Cancel</Button>
        </li>
      </ul>
    </section>
  );
}

function Button({
  autoFocus = false,
  children,
  onClick,
  variant,
}: {
  readonly autoFocus?: boolean;
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  /** The main action of the modal ("primary"), or a quiet one beside it ("alt"). */
  readonly variant?: "primary" | "alt";
}) {
  return (
    <button
      // A modal focuses the button that it expects.
      autoFocus={autoFocus}
      className={
        variant === undefined ? "button small" : `button small ${variant}`
      }
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
