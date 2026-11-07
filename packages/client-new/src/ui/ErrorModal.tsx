import * as Dialog from "@radix-ui/react-dialog";
import type { LobbyConnection } from "../connection";
import { RichText } from "./RichText";

/** Matches the legacy client's error modal, which can only be left by reloading or signing out. */
export function ErrorModal({
  connection,
  text,
}: {
  connection: LobbyConnection;
  text: string;
}) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay">
          <Dialog.Content
            aria-describedby="error-modal-description"
            className="modal modal-message"
            id="error-modal"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <section>
              <Dialog.Title asChild>
                <h3>Error</h3>
              </Dialog.Title>
              <p id="error-modal-description">
                <RichText html={text} />
              </p>
              <ul className="actions">
                <li>
                  <button
                    className="button small"
                    id="error-modal-button"
                    onClick={() => globalThis.location.reload()}
                    type="button"
                  >
                    Reload
                  </button>{" "}
                  <button
                    className="button small signout"
                    id="error-modal-signout"
                    onClick={() => {
                      void connection.logout();
                    }}
                    type="button"
                  >
                    Sign Out
                  </button>
                </li>
              </ul>
            </section>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
