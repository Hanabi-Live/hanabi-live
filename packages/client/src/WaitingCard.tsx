// A card that turns over while the page waits for the server. The animation is in the image, so
// that the server's page template can show it before the client loads.

const WAITING_CARD_SRC = "/public/img/waiting-card.svg";

/** The image's size in pixels, when nothing scales it. */
const WAITING_CARD_SIZE = 64;

const WAITING_TEXT = "Waiting for the server.";

/** With `decorative`, text next to the card says what it waits for, so screen readers skip it. */
export function WaitingCard({
  className,
  decorative = false,
}: {
  readonly className?: string;
  readonly decorative?: boolean;
}): React.JSX.Element {
  return (
    <img
      alt={decorative ? "" : WAITING_TEXT}
      className={className}
      height={WAITING_CARD_SIZE}
      src={WAITING_CARD_SRC}
      width={WAITING_CARD_SIZE}
    />
  );
}

/**
 * The classes of a button with a `WaitingLabel`. While it waits, the pointer cannot press it, and
 * it looks disabled. The "disabled" class would fade the card too, so `WaitingLabel` draws the
 * disabled background on a layer instead.
 */
export function getWaitingButtonClass(waiting: boolean): string {
  return waiting
    ? "tw:relative tw:pointer-events-none tw:bg-transparent! tw:shadow-none!"
    : "tw:relative";
}

/**
 * A button's label. While the button waits, the turning card and `waitingText` replace it. The
 * label keeps its place, so that the button does not change size. The button needs
 * `getWaitingButtonClass`.
 */
export function WaitingLabel({
  waiting,
  waitingText,
  children,
}: {
  readonly waiting: boolean;
  readonly waitingText: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      {waiting && (
        // The background of a disabled button (see "overrides.css").
        <span
          aria-hidden="true"
          className="tw:absolute tw:inset-0 tw:rounded-[inherit] tw:bg-button-disabled tw:opacity-25"
        />
      )}
      <span className={waiting ? "tw:invisible" : undefined}>{children}</span>
      {waiting && (
        <span className="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:gap-[0.25em] tw:text-button-disabled-text">
          <WaitingCard className="tw:h-[2em] tw:w-[2em]" decorative />
          {waitingText}
        </span>
      )}
    </>
  );
}
