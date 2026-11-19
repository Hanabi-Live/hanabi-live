// A card that turns over while the page waits for the server. Its animation is the "waiting-card"
// class in "public/css/app/common.css", so that the server's page template can show it before the
// client loads.

import { useLayoutEffect, useRef } from "react";

const WAITING_CARD_CLASS = "waiting-card";

const WAITING_CARD_SRC = "/public/img/waiting-card.svg";

/** The image's size in pixels, when nothing scales it. */
const WAITING_CARD_SIZE = 64;

const WAITING_TEXT = "Waiting for the server.";

/** When the template's card started to turn, until a `continueTemplate` card takes it. */
let templateStartTime: number | null = null;

/**
 * Remembers when the template's card started to turn. Call it before the client replaces the
 * template, so that the client's card continues the turn instead of starting again.
 */
export function rememberTemplateWaitingCard(): void {
  const card = document.querySelector(`.${WAITING_CARD_CLASS}`);
  const startTime = card?.getAnimations()[0]?.startTime;
  templateStartTime = typeof startTime === "number" ? startTime : null;
}

/**
 * With `decorative`, text next to the card says what it waits for, so screen readers skip it. With
 * `continueTemplate`, the card continues the turn of the card that the template showed.
 */
export function WaitingCard({
  className,
  decorative = false,
  continueTemplate = false,
}: {
  readonly className?: string;
  readonly decorative?: boolean;
  readonly continueTemplate?: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    if (
      !continueTemplate
      || templateStartTime === null
      || ref.current === null
    ) {
      return;
    }
    for (const animation of ref.current.getAnimations()) {
      animation.startTime = templateStartTime;
    }
    // A card that shows later starts on the red face, like every other card.
    templateStartTime = null;
  }, [continueTemplate]);

  return (
    <img
      alt={decorative ? "" : WAITING_TEXT}
      className={
        className === undefined
          ? WAITING_CARD_CLASS
          : `${WAITING_CARD_CLASS} ${className}`
      }
      height={WAITING_CARD_SIZE}
      ref={ref}
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
