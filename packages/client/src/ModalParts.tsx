// The parts that the message modals and the prompts share, so that they look alike: a column in the
// middle, an icon in a ring above the title, and the buttons.

/** A modal's content: one column, in the middle. */
export const MODAL_COLUMN_CLASS_NAME =
  "tw:flex tw:flex-col tw:items-center tw:text-center";

/** The title of a modal, below its icon. */
export const MODAL_TITLE_CLASS_NAME =
  "tw:mt-[0.75em] tw:mb-[0.25em] tw:text-balance";

/** The text below a title, which is quieter than the title. */
export const MODAL_DESCRIPTION_CLASS_NAME =
  "tw:w-full tw:text-balance tw:text-game-muted";

/** The row of buttons at the bottom of a modal. */
export const MODAL_ACTIONS_CLASS_NAME = "actions tw:justify-center";

/** An icon in a faint ring at the top of a modal. `icon` holds its classes, such as its color. */
export function ModalIcon({
  icon,
  iconRef,
}: {
  readonly icon: string;
  readonly iconRef?: React.Ref<HTMLElement>;
}): React.JSX.Element {
  return (
    <div className="tw:flex tw:size-[5em] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:ring-[0.25em] tw:ring-game-line/30">
      <i
        aria-hidden="true"
        className={`fas ${icon} tw:text-[2em]`}
        ref={iconRef}
      />
    </div>
  );
}

export function ModalButton({
  autoFocus = false,
  children,
  id,
  onClick,
  variant,
}: {
  readonly autoFocus?: boolean;
  readonly children: React.ReactNode;
  readonly id?: string;
  readonly onClick: () => void;
  /** The main action of the modal ("primary"), or a quiet one beside it ("alt"). */
  readonly variant?: "primary" | "alt";
}): React.JSX.Element {
  return (
    <button
      // A modal focuses the button that it expects.
      autoFocus={autoFocus}
      className={
        variant === undefined ? "button small" : `button small ${variant}`
      }
      id={id}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
