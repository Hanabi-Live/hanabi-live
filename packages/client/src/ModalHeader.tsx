// The heading of a modal that has no Cancel button, with an X beside it that closes the modal.

import { closeModals } from "./modals.ts";

const HEADER_CLASS_NAME = "tw:flex tw:items-start tw:justify-between tw:gap-4";

const CLOSE_BUTTON_CLASS_NAME =
  "tw:-mr-2 tw:flex tw:size-10 tw:shrink-0 tw:cursor-pointer tw:appearance-none tw:items-center tw:justify-center tw:rounded tw:border-0 tw:bg-transparent tw:p-0 tw:text-[1.5em] tw:text-text-label tw:hover:bg-surface-sunken tw:hover:text-text-strong";

export function ModalHeader({
  heading,
}: {
  readonly heading: string;
}): React.JSX.Element {
  return (
    <div className={HEADER_CLASS_NAME}>
      <h2>{heading}</h2>
      <button
        aria-label="Close"
        className={CLOSE_BUTTON_CLASS_NAME}
        onClick={closeModals}
        type="button"
      >
        <i className="fas fa-times" />
      </button>
    </div>
  );
}
