import * as Dialog from "@radix-ui/react-dialog";
import { RichText } from "./RichText";

/** Matches the legacy client's warning modal, which the user closes after reading. */
export function WarningModal({
  close,
  text,
}: {
  close: () => void;
  text: string;
}) {
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay">
          <Dialog.Content
            aria-describedby="warning-modal-description"
            className="modal modal-message"
            id="warning-modal"
          >
            <section>
              <Dialog.Title asChild>
                <h3>Warning</h3>
              </Dialog.Title>
              <p id="warning-modal-description">
                <RichText html={text} />
              </p>
              <ul className="actions">
                <li>
                  <button
                    className="button small"
                    id="warning-modal-button"
                    onClick={close}
                    type="button"
                  >
                    Close
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
