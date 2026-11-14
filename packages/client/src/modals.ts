// Modals (boxes that hover on top of the UI).

import type {
  CardIdentity,
  CardOrder,
  Rank,
  Suit,
  SuitRankTuple,
  Variant,
} from "@hanabi-live/game";
import { START_CARD_RANK } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { globals } from "./Globals.ts";
import {
  CLOSE_BUTTON_CLASS_NAME,
  MODAL_HEADER_CLASS_NAME,
} from "./closeButton.ts";
import { START_CARD_RANK_LABEL } from "./constants.ts";
import { emojiPickerClosed } from "./emojiPickerSlice.ts";
import { getCardImages } from "./game/cardImages.ts";
import { morphCard } from "./game/hypothetical.ts";
import * as noteIdentity from "./game/reducers/noteIdentity.ts";
import type { HanabiCard } from "./game/ui/HanabiCard.ts";
import type { MessageModal } from "./messageModalSlice.ts";
import { messageModalClosed, messageModalShown } from "./messageModalSlice.ts";
import { errorOccurredChanged } from "./sessionSlice.ts";
import { store } from "./store.ts";
import { getHtmlElement, getHtmlInputElement } from "./utils.ts";

/** Used by the morph dialog. */
type DragAreaType = "playArea" | "discardArea" | undefined;

let allowCloseModal = true;
/** An administrator's reason for a restart or stop, shown until its warning modal is closed. */
let downtimeMessage: string | undefined;
let currentModal: HTMLElement | undefined;
let confirmModalOnConfirm: (() => void) | undefined;
let confirmModalOnCancel: (() => void) | undefined;
let idleModalKeepPlaying: (() => void) | undefined;
let morphDragArea: DragAreaType;

/** The modal that "MessageModal.tsx" renders the content of. */
const MESSAGE_MODAL_ID = "message-modal";
export const EMOJI_MODAL_ID = "emoji-modal";

const modalDialog = getModalDialog();
const modalsContainer = getHtmlElement("#modals-container");
const morphModalButtonCancel = getHtmlElement("#morph-modal-button-cancel");
const morphModalButtonOk = getHtmlElement("#morph-modal-button-ok");
const morphModalDescription = getHtmlElement("#morph-modal-description");
const morphModalTextbox = getHtmlInputElement("#morph-modal-textbox");

/** The prompts that have no Cancel button, so they get an X beside their heading. */
const PROMPTS_WITHOUT_CANCEL = [
  "#set-leader-modal",
  "#set-turn-modal",
  "#play-discard-modal",
  "#set-modifier-modal",
] as const;

function addCloseButton(modal: HTMLElement) {
  const heading = modal.querySelector(":scope > h2");
  if (heading === null) {
    throw new Error(`Failed to find the heading of: #${modal.id}`);
  }
  const button = document.createElement("button");
  button.ariaLabel = "Close";
  button.className = CLOSE_BUTTON_CLASS_NAME;
  button.type = "button";
  const icon = document.createElement("i");
  icon.className = "fas fa-times";
  button.append(icon);
  button.addEventListener("click", closeModals);
  const header = document.createElement("div");
  header.className = MODAL_HEADER_CLASS_NAME;
  heading.replaceWith(header);
  header.append(heading, button);
}

function getModalDialog(): HTMLDialogElement {
  const element = document.querySelector("#modal-dialog");
  if (!(element instanceof HTMLDialogElement)) {
    throw new TypeError("Failed to find the modal dialog.");
  }
  return element;
}

export function init(): void {
  for (const selector of PROMPTS_WITHOUT_CANCEL) {
    addCloseButton(getHtmlElement(selector));
  }

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

  // Morph modal textbox.
  const morphTextboxObserver = new MutationObserver(() => {
    const { suit } = morphModalTextbox.dataset;
    const { rank } = morphModalTextbox.dataset;
    morphModalTextbox.value = `${suit} ${rank}`;
  });
  morphTextboxObserver.observe(morphModalTextbox, {
    attributes: true,
    attributeFilter: ["data-suit", "data-rank"],
  });
  morphModalTextbox.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      morphModalButtonOk.click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      morphModalButtonCancel.click();
    }
  });
}

export function askForPassword(tableId: number): void {
  showMessageModal({ type: "password", tableId });
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
  morphDragArea = drag?.area;
  allowCloseModal = false;

  const { suits, ranks } = variant;
  const startSuitIndex = target.identity.suitIndex ?? 0;
  const startRank = target.identity.rank ?? 1;
  const startSuit = suits[startSuitIndex];
  assertDefined(
    startSuit,
    `Failed to get the suit at index: ${startSuitIndex}`,
  );

  fillMorphModalWithRadios(
    "#morph-modal-cards",
    suits,
    ranks,
    startSuit,
    startRank,
    target.possibilities,
    getCardImages(variant),
  );

  showModal("#morph-modal", false, () => {
    morphModalTextbox.focus();
    morphModalTextbox.select();
  });

  if (drag === undefined) {
    morphModalDescription.textContent =
      "Select the card you want to morph it into.";

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonOk.onclick = () => {
      morphOkButton(target, variant);
    };

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonCancel.onclick = morphCancelButton;
  } else {
    morphModalDescription.textContent =
      "What will the card will be for the purposes of this hypothetical?";

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonOk.onclick = () => {
      if (!morphOkButton(target, variant)) {
        morphDragArea = undefined;
      }
      morphFinishDrag(drag.card);
    };

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonCancel.onclick = () => {
      morphCancelButton();
      morphDragArea = undefined;
      morphFinishDrag(drag.card);
    };
  }
}

function morphFinishDrag(card: HanabiCard) {
  card.getLayoutParent().continueDragAction(morphDragArea);
}

function morphOkButton(target: MorphTarget, variant: Variant): boolean {
  allowCloseModal = true;
  closeModals();

  const cardIdentity = noteIdentity.parseIdentity(
    variant,
    morphModalTextbox.value,
  );

  if (cardIdentity === undefined) {
    // The text that they entered does not correspond to a card.
    return false;
  }

  morphCard(target.order, cardIdentity);
  return true;
}

function morphCancelButton() {
  allowCloseModal = true;
  closeModals();
}

export function showWarning(msg: string): void {
  // An error stops the connection and can only be left by reloading, so a later (or delayed)
  // warning must not replace it.
  if (store.getState().session.errorOccurred) {
    return;
  }

  // Store the screen's active element.
  globals.lastActiveElement = document.activeElement as HTMLElement;
  showMessageModal({ type: "warning", html: msg });
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

  globals.lastActiveElement = document.activeElement as HTMLElement;
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
  globals.lastActiveElement = document.activeElement as HTMLElement;
  showMessageModal({ type: "confirm", title, description, confirmText });

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

export function showPrompt(
  selector: string,
  test?: () => unknown,
  focusElement?: HTMLInputElement,
  clickButtonElement?: HTMLElement,
): void {
  // eslint-disable-next-line
  if (!(test?.call(undefined) ?? true)) {
    return;
  }

  if (focusElement !== undefined && clickButtonElement !== undefined) {
    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    focusElement.onkeydown = (event) => {
      if (event.key === "Enter") {
        clickButtonElement.click();
      }
    };
  }

  showModal(selector, true, () => {
    if (focusElement === undefined) {
      return;
    }
    focusElement.focus();
    const oldType = focusElement.type;
    if (oldType === "number" || oldType === "text") {
      const { length } = focusElement.value;
      // Cannot put the cursor past the text unless it's a text input.
      focusElement.type = "text";
      focusElement.setSelectionRange(0, length);
      focusElement.type = oldType;
    }
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
  if (currentModal?.id === EMOJI_MODAL_ID) {
    store.dispatch(emojiPickerClosed());
  }
  if (currentModal !== undefined) {
    currentModal.classList.add("hidden");
    modalsContainer.append(currentModal);
    currentModal = undefined;
  }
  modalDialog.close();

  if (globals.lastActiveElement !== undefined) {
    globals.lastActiveElement.focus();
  }

  const onCancel = confirmModalOnCancel;
  confirmModalOnConfirm = undefined;
  confirmModalOnCancel = undefined;
  onCancel?.();
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

function fillMorphModalWithRadios(
  element: string,
  suits: readonly Suit[],
  ranks: readonly Rank[],
  startSuit: Suit,
  startRank: Rank,
  possibilities: readonly SuitRankTuple[],
  cardImages: ReadonlyMap<string, HTMLCanvasElement>,
) {
  const placeholder = getHtmlElement(element);
  placeholder.replaceChildren();
  const table = document.createElement("table");
  table.classList.add("slim-table");

  for (const rank of ranks) {
    const row = document.createElement("tr");

    for (const [suitIndex, suit] of suits.entries()) {
      const cell = document.createElement("td");
      const possibleCardIdentity = possibilities.some(
        (possibility) =>
          possibility[0] === suitIndex && possibility[1] === rank,
      );
      if (!possibleCardIdentity) {
        cell.classList.add("faded");
      }
      const radio = document.createElement("input");
      const radioId = `morph-radio-${suitIndex}-${rank}`;

      radio.setAttribute("type", "radio");
      radio.setAttribute("name", "morph-cards");
      radio.setAttribute("id", radioId);
      radio.setAttribute("value", `${suit.displayName} ${rank}`);
      cell.append(radio);

      const label = document.createElement("label");
      label.setAttribute("for", radioId);
      const cardImageLabel = `card-${suit.name}-${rank}`;
      const image = cardImages.get(cardImageLabel);
      assertDefined(
        image,
        `Failed to get the card image with label: ${cardImageLabel}`,
      );
      label.append(image);
      cell.append(label);

      if (suit === startSuit && rank === startRank) {
        radio.setAttribute("checked", "checked");
        morphModalTextbox.dataset["suit"] = suit.displayName;
        morphModalTextbox.dataset["rank"] = getRankLabel(rank);
      }
      radio.addEventListener("change", () => {
        if (!radio.checked) {
          return;
        }

        // Set textbox data attribute.
        morphModalTextbox.dataset["suit"] = suit.displayName;
        morphModalTextbox.dataset["rank"] = getRankLabel(rank);
      });

      row.append(cell);
    }

    table.append(row);
  }

  placeholder.append(table);
}

function getRankLabel(rank: Rank): string {
  return rank === START_CARD_RANK ? START_CARD_RANK_LABEL : rank.toString();
}
