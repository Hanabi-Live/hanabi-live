import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useRef } from "react";

export function Modal({
  title,
  description,
  close,
  children,
  id,
  className = "",
  initialFocus,
}: {
  title: string;
  description: string;
  close: () => void;
  children: ReactNode;
  id?: string;
  className?: string;
  initialFocus?: string;
}) {
  const content = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement);
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
            className={`client-new-classic modal dialog-content ${className}`}
            id={id}
            onCloseAutoFocus={(event) => {
              const target = previousFocus.current;
              if (target instanceof HTMLElement && target.isConnected) {
                event.preventDefault();
                target.focus();
              }
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              const target =
                initialFocus === undefined
                  ? content.current
                  : content.current?.querySelector<HTMLElement>(initialFocus);
              (target ?? content.current)?.focus();
            }}
            ref={content}
          >
            <div className="dialog-heading">
              {id === "create-game-modal" ? (
                <div className="row">
                  <div className="col-12">
                    <Dialog.Title>{title}</Dialog.Title>
                  </div>
                </div>
              ) : (
                <Dialog.Title>{title}</Dialog.Title>
              )}
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
