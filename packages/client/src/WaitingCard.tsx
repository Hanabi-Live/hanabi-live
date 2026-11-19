// A card that turns over while the page waits for the server. The animation is in the image, so
// that the server's page template can show it before the client loads.

const WAITING_CARD_SRC = "/public/img/waiting-card.svg";

/** The image's size in pixels, when nothing scales it. */
const WAITING_CARD_SIZE = 64;

const WAITING_TEXT = "Waiting for the server.";

export function WaitingCard({
  className,
}: {
  readonly className?: string;
}): React.JSX.Element {
  return (
    <img
      alt={WAITING_TEXT}
      className={className}
      height={WAITING_CARD_SIZE}
      src={WAITING_CARD_SRC}
      width={WAITING_CARD_SIZE}
    />
  );
}

/**
 * The classes of a button with a `WaitingLabel`. While it waits, it keeps its look and size, but
 * the pointer cannot press it.
 */
export function getWaitingButtonClass(waiting: boolean): string {
  return waiting ? "tw:relative tw:pointer-events-none" : "tw:relative";
}

/**
 * A button's label, which the turning card replaces while the button waits. The label keeps its
 * place, so that the button does not change size. The button needs `getWaitingButtonClass`.
 */
export function WaitingLabel({
  waiting,
  children,
}: {
  readonly waiting: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <span className={waiting ? "tw:invisible" : undefined}>{children}</span>
      {waiting && (
        <WaitingCard className="tw:absolute tw:inset-0 tw:m-auto tw:h-[2.5em] tw:w-[2.5em]" />
      )}
    </>
  );
}
