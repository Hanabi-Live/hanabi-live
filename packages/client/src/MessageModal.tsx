// The message modals: a warning, an error, the idle warning, a question, and the password of a
// table. "modals.ts" opens and closes the dialog that holds them.

import { millisecondsToClockString } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { useEffect, useState } from "react";
import { LOCAL_STORAGE_KEY } from "./constants.ts";
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

function IdleModal({
  modal,
}: {
  readonly modal: Extract<Modal, { type: "idle" }>;
}) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, SECOND_IN_MILLISECONDS);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <section id="idle-modal">
      <h3>Is anyone still there?</h3>
      <p>
        Nobody has taken a turn in a while, so this game will end in{" "}
        <strong>
          {millisecondsToClockString(Math.max(0, modal.deadline - now))}
        </strong>
        {modal.canKeepPlaying
          ? " unless someone takes a turn or keeps it going."
          : " unless a player takes a turn or keeps it going."}
      </p>
      <ul className="actions">
        <li>
          {modal.canKeepPlaying && (
            <>
              <Button autoFocus onClick={keepPlaying}>
                Keep Playing
              </Button>{" "}
            </>
          )}
          <Button autoFocus={!modal.canKeepPlaying} onClick={closeModals}>
            Close
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
    globals.conn!.send("tableJoin", {
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
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
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
}: {
  readonly autoFocus?: boolean;
  readonly children: React.ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      // A modal focuses the button that it expects.
      autoFocus={autoFocus}
      className="button small"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
