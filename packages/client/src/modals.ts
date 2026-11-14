// Modals (boxes that hover on top of the UI).

import type {
  CardIdentity,
  CardOrder,
  SuitRankTuple,
  Variant,
} from "@hanabi-live/game";
import { emojiPickerClosed } from "./emojiPickerSlice.ts";
import { morphCard } from "./game/hypothetical.ts";
import * as noteIdentity from "./game/reducers/noteIdentity.ts";
import type { HanabiCard } from "./game/ui/HanabiCard.ts";
import type { MessageModal } from "./messageModalSlice.ts";
import { messageModalClosed, messageModalShown } from "./messageModalSlice.ts";
import type { PromptModal } from "./promptModalSlice.ts";
import { promptModalClosed, promptModalShown } from "./promptModalSlice.ts";
import { errorOccurredChanged } from "./sessionSlice.ts";
import { store } from "./store.ts";
import { getHtmlElement } from "./utils.ts";

let allowCloseModal = true;
/** An administrator's reason for a restart or stop, shown until its warning modal is closed. */
let downtimeMessage: string | undefined;
let currentModal: HTMLElement | undefined;
/** The element that had focus before the modal opened, which gets focus back when it closes. */
let lastActiveElement: HTMLElement | undefined;
let confirmModalOnConfirm: (() => void) | undefined;
let confirmModalOnCancel: (() => void) | undefined;
let idleModalKeepPlaying: (() => void) | undefined;
let promptOnSubmit: ((answer: string) => void) | undefined;
let promptOnCancel: (() => void) | undefined;

/** The modal that "MessageModal.tsx" renders the content of. */
const MESSAGE_MODAL_ID = "message-modal";
/** The modal that "PromptModal.tsx" renders the content of. */
const PROMPT_MODAL_ID = "prompt-modal";
export const EMOJI_MODAL_ID = "emoji-modal";

const modalDialog = getModalDialog();
const modalsContainer = getHtmlElement("#modals-container");

function getModalDialog(): HTMLDialogElement {
  const element = document.querySelector("#modal-dialog");
  if (!(element instanceof HTMLDialogElement)) {
    throw new TypeError("Failed to find the modal dialog.");
  }
  return element;
}

export function init(): void {
  // The dialog covers the screen, so a click on the dialog itself is a click beside the modal.
  modalDialog.addEventListener("pointerdown", (event) => {
    if (event.target === modalDialog) {
      closeModals();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && currentModal !== undefined) {
      // The key press must not also act on the screen behind the modal (e.g. leaving a replay). It
      // must not close the dialog either, because some modals cannot be closed.
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModals();
    }
  });
  // Other requests to close the dialog, such as the back gesture on Android.
  modalDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModals();
  });
  // The browser can close the dialog without a "cancel" event that we can stop.
  modalDialog.addEventListener("close", () => {
    if (!modalDialog.open && currentModal !== undefined) {
      if (allowCloseModal) {
        closeModals();
      } else {
        modalDialog.showModal();
      }
    }
  });
}

export function askForPassword(tableId: number): void {
  showMessageModal({
    type: "password",
    tableId,
  });
}

/** A card that the morph dialog changes into another card in a hypothetical. */
export interface MorphTarget {
  readonly order: CardOrder;
  /** The identity that the dialog starts with. */
  readonly identity: CardIdentity;
  /** The cards that the card can be, which the dialog marks. */
  readonly possibilities: readonly SuitRankTuple[];
}

/**
 * On the classic screen, a card of unknown identity that is dragged in a hypothetical asks for its
 * identity first. The drag finishes after the dialog closes.
 */
export interface MorphDrag {
  readonly card: HanabiCard;
  readonly area: "playArea" | "discardArea";
}

export function askForMorph(
  target: MorphTarget,
  variant: Variant,
  drag?: MorphDrag,
): void {
  // The drag finishes whatever the answer, in the area only if the card changed.
  function finishDrag(changed: boolean) {
    if (drag !== undefined) {
      drag.card
        .getLayoutParent()
        .continueDragAction(changed ? drag.area : undefined);
    }
  }

  showPrompt(
    {
      type: "morph",
      description:
        drag === undefined
          ? "Select the card you want to morph it into."
          : "What will the card will be for the purposes of this hypothetical?",
      variantId: variant.id,
      startSuitIndex: target.identity.suitIndex ?? 0,
      startRank: target.identity.rank ?? 1,
      possibilities: target.possibilities,
    },
    (answer) => {
      const cardIdentity = noteIdentity.parseIdentity(variant, answer);
      if (cardIdentity !== undefined) {
        morphCard(target.order, cardIdentity);
      }
      finishDrag(cardIdentity !== undefined);
    },
    () => {
      finishDrag(false);
    },
    false,
  );
}

export function showWarning(msg: string): void {
  // An error stops the connection and can only be left by reloading, so a later (or delayed)
  // warning must not replace it.
  if (store.getState().session.errorOccurred) {
    return;
  }

  // Store the screen's active element.
  lastActiveElement = document.activeElement as HTMLElement;
  showMessageModal({
    type: "warning",
    html: msg,
  });
}

/**
 * Warns that an ongoing game will end soon because nobody has taken a turn, counting down until it
 * ends. Players get a button that keeps the game going.
 */
export function showIdleWarning(
  remainingMs: number,
  onKeepPlaying: (() => void) | undefined,
): void {
  if (store.getState().session.errorOccurred) {
    return;
  }

  lastActiveElement = document.activeElement as HTMLElement;
  showMessageModal({
    type: "idle",
    deadline: Date.now() + remainingMs,
    canKeepPlaying: onKeepPlaying !== undefined,
  });
  // Showing the modal closes any previous one, so the callback must be stored afterward.
  idleModalKeepPlaying = onKeepPlaying;
}

/** Keeps the game of the idle warning going. */
export function keepPlaying(): void {
  idleModalKeepPlaying?.();
  closeIdleWarning();
}

/** Closes the idle warning (and only it), for example after a turn keeps the game going. */
export function closeIdleWarning(): void {
  if (
    currentModal?.id === MESSAGE_MODAL_ID
    && store.getState().messageModal.modal?.type === "idle"
  ) {
    closeModals();
  }
}

/**
 * Asks the user to confirm an action. `onCancel` runs however the modal is dismissed, including
 * when another modal replaces it.
 */
export function askForConfirmation(
  title: string,
  description: string,
  confirmText: string,
  onConfirm: () => void,
  onCancel?: () => void,
): void {
  // An error stops the connection and can only be left by reloading.
  if (store.getState().session.errorOccurred) {
    onCancel?.();
    return;
  }

  // Store the screen's active element.
  lastActiveElement = document.activeElement as HTMLElement;
  showMessageModal({
    type: "confirm",
    title,
    description,
    confirmText,
  });

  // Showing the modal closes any previous one (and cancels its confirmation), so the new callbacks
  // must be stored afterward.
  confirmModalOnConfirm = onConfirm;
  confirmModalOnCancel = onCancel;
}

/** Confirms the action of the confirm modal. */
export function confirm(): void {
  const onConfirm = confirmModalOnConfirm;
  confirmModalOnConfirm = undefined;
  confirmModalOnCancel = undefined;
  closeModals();
  onConfirm?.();
}

/** The reason stays visible if a reconnect error (such as an outdated client) replaces it. */
export function showDowntime(msg: string): void {
  showWarning(msg);
  downtimeMessage = msg;
}

export function showError(msg: string): void {
  // Do nothing if we are already showing the error modal.
  if (store.getState().session.errorOccurred) {
    return;
  }
  // This also clears the buttons of the navigation bar.
  store.dispatch(errorOccurredChanged(true));

  showMessageModal(
    {
      type: "error",
      html:
        downtimeMessage === undefined
          ? msg
          : `${downtimeMessage}<br /><br />${msg}`,
    },
    false,
  );
}

/**
 * Shows a prompt, which runs `onSubmit` with the answer. `onCancel` runs however the prompt is
 * dismissed without an answer. A prompt that cannot be closed waits for its answer or
 * `cancelPrompt`.
 */
export function showPrompt(
  prompt: PromptModal,
  onSubmit: (answer: string) => void,
  onCancel?: () => void,
  allowClose = true,
): void {
  showModal(`#${PROMPT_MODAL_ID}`, allowClose);
  store.dispatch(promptModalShown(prompt));
  // Showing the modal closes any previous one (and cancels its prompt), so the new callbacks must
  // be stored afterward.
  promptOnSubmit = onSubmit;
  promptOnCancel = onCancel;
}

/** Closes the prompt, and runs its function with the answer. */
export function submitPrompt(answer: string): void {
  const onSubmit = promptOnSubmit;
  promptOnSubmit = undefined;
  promptOnCancel = undefined;
  allowCloseModal = true;
  closeModals();
  onSubmit?.(answer);
}

/** Closes the prompt without an answer, even one that cannot otherwise be closed. */
export function cancelPrompt(): void {
  allowCloseModal = true;
  closeModals();
}

/** Shows the emote and emoji picker, with the focus in its search input. */
export function showEmojiModal(searchInput: HTMLInputElement): void {
  showModal(`#${EMOJI_MODAL_ID}`, true, () => {
    searchInput.focus();
  });
}

export function closeModals(): void {
  if (!allowCloseModal) {
    return;
  }

  downtimeMessage = undefined;
  idleModalKeepPlaying = undefined;
  if (currentModal?.id === MESSAGE_MODAL_ID) {
    store.dispatch(messageModalClosed());
  }
  if (currentModal?.id === PROMPT_MODAL_ID) {
    store.dispatch(promptModalClosed());
  }
  if (currentModal?.id === EMOJI_MODAL_ID) {
    store.dispatch(emojiPickerClosed());
  }
  if (currentModal !== undefined) {
    currentModal.classList.add("hidden");
    modalsContainer.append(currentModal);
    currentModal = undefined;
  }
  modalDialog.close();

  if (lastActiveElement !== undefined) {
    lastActiveElement.focus();
  }

  const onCancel = confirmModalOnCancel;
  confirmModalOnConfirm = undefined;
  confirmModalOnCancel = undefined;
  onCancel?.();

  const onPromptCancel = promptOnCancel;
  promptOnSubmit = undefined;
  promptOnCancel = undefined;
  onPromptCancel?.();
}

export function isModalVisible(): boolean {
  return currentModal !== undefined;
}

/** Shows a message modal. Its buttons focus themselves once it renders. */
function showMessageModal(modal: MessageModal, allowClose = true) {
  showModal(`#${MESSAGE_MODAL_ID}`, allowClose);
  store.dispatch(messageModalShown(modal));
}

function showModal(selector: string, allowClose: boolean, ready?: () => void) {
  closeModals();

  const element = getHtmlElement(selector);

  currentModal = element;
  allowCloseModal = allowClose;

  element.classList.add("modal");
  element.classList.remove("hidden");
  modalDialog.append(element);
  modalDialog.showModal();
  ready?.();
}
