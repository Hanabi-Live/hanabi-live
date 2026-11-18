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

/**
 * How long the modal and the dimming of the page behind it take to fade in and out, in
 * milliseconds. With the "Reduced motion" setting, they show and go at once.
 */
const MODAL_FADE_MILLISECONDS = 400;

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
    if (currentModal === undefined || event.key !== "Escape") {
      return;
    }

    // The key press must not also act on the screen behind the modal (e.g. leaving a replay). It
    // must not close the dialog either, because some modals cannot be closed.
    event.preventDefault();
    event.stopImmediatePropagation();
    closeModals();
  });
  // Other requests to close the dialog, such as the back gesture on Android.
  modalDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModals();
  });
  // The browser can close the dialog without a "cancel" event that we can stop.
  modalDialog.addEventListener("close", () => {
    if (currentModal !== undefined && !modalDialog.open) {
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
 * Asks which card a card in a hypothetical is, and changes it into that card. A card of unknown
 * identity that is played or discarded in a hypothetical asks for its identity first: then `onMove`
 * gets whether the card changed, after the dialog closes, so that the move goes on only if it did.
 */
export function askForMorph(
  target: MorphTarget,
  variant: Variant,
  onMove?: (changed: boolean) => void,
): void {
  showPrompt(
    {
      type: "morph",
      description:
        onMove === undefined
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
      onMove?.(cardIdentity !== undefined);
    },
    () => {
      onMove?.(false);
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
    // The modal's content goes now, so a copy of it fades out with the dimming of the page.
    fadeOutModalCopy(currentModal);
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
  setModalFade();
  modalDialog.showModal();
  ready?.();
}

function getModalFadeMilliseconds(): number {
  return store.getState().session.settings.reducedMotion
    ? 0
    : MODAL_FADE_MILLISECONDS;
}

/**
 * Sets how long the modal fades, which the stylesheet reads. The setting can change at any time.
 */
function setModalFade() {
  modalDialog.style.setProperty(
    "--modal-fade",
    `${getModalFadeMilliseconds()}ms`,
  );
}

/**
 * Leaves a copy of a modal that is about to close, which fades out in the dialog while the dialog's
 * backdrop fades out. The copy cannot be clicked or focused, and it has no IDs, so that the page
 * does not find it instead of the modal.
 */
function fadeOutModalCopy(modal: HTMLElement) {
  setModalFade();
  const duration = getModalFadeMilliseconds();
  if (duration === 0 || !modalDialog.open) {
    return;
  }

  const copy = modal.cloneNode(true) as HTMLElement;
  for (const element of [copy, ...copy.querySelectorAll("[id]")]) {
    element.removeAttribute("id");
  }
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.style.pointerEvents = "none";
  copy.scrollTop = modal.scrollTop;
  modalDialog.append(copy);

  const opacity = Number(getComputedStyle(modal).opacity);
  const animation = copy.animate([{ opacity }, { opacity: 0 }], {
    duration,
    easing: "ease-in",
    fill: "forwards",
  });
  function remove() {
    copy.remove();
  }
  animation.addEventListener("finish", remove);
  animation.addEventListener("cancel", remove);
}
