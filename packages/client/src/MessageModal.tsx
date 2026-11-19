// The message modals: a warning, an error, the idle warning, a question, and the password of a
// table. "modals.ts" opens and closes the dialog that holds them.

import { IDLE_WARNING_MS, SECONDS_PER_MINUTE } from "@hanabi-live/data";
import { millisecondsToClockString } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { useEffect, useState } from "react";
import { LOCAL_STORAGE_KEY } from "./constants.ts";
import { useReducedMotion } from "./fade.ts";
import { globals } from "./Globals.ts";
import { signOut } from "./lobby/signOut.ts";
import type { MessageModal as Modal } from "./messageModalSlice.ts";
import { closeModals, confirm, keepPlaying } from "./modals.ts";
import { useAppSelector } from "./store.ts";

/**
 * The text of a warning or an error. A list in it (such as the versions of an outdated client) has
 * the same space above and below.
 */
const MESSAGE_CLASS_NAME = "tw:[&_ul]:my-[1em]";

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
      return (
        <section id="error-modal">
          <h3>Error</h3>
          {/* Errors can hold the formatted stack trace from "errors.ts". */}
          <p
            className={MESSAGE_CLASS_NAME}
            dangerouslySetInnerHTML={{ __html: modal.html }}
          />
          <ul className="actions">
            <li>
              <Button
                onClick={() => {
                  globalThis.location.reload();
                }}
              >
                Reload
              </Button>{" "}
              <a>
                <button
                  className="button small signout"
                  onClick={signOut}
                  type="button"
                >
                  Sign Out
                </button>
              </a>
            </li>
          </ul>
        </section>
      );
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
