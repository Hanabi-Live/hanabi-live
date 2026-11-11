// Modals (boxes that hover on top of the UI).

import type { Rank, Suit, SuitRankTuple, Variant } from "@hanabi-live/game";
import { millisecondsToClockString, START_CARD_RANK } from "@hanabi-live/game";
import {
  assertDefined,
  parseIntSafe,
  SECOND_IN_MILLISECONDS,
} from "complete-common";
import { globals } from "./Globals.ts";
import { LOCAL_STORAGE_KEY, START_CARD_RANK_LABEL } from "./constants.ts";
import * as noteIdentity from "./game/reducers/noteIdentity.ts";
import type { HanabiCard } from "./game/ui/HanabiCard.ts";
import { morphReplayFromModal } from "./game/ui/HanabiCardClick.ts";
import { signOut } from "./lobby/signOut.ts";
import { getHtmlElement, getHtmlInputElement } from "./utils.ts";

/** Used by the morph dialog. */
type DragAreaType = "playArea" | "discardArea" | undefined;

let allowCloseModal = true;
/** An administrator's reason for a restart or stop, shown until its warning modal is closed. */
let downtimeMessage: string | undefined;
let currentModal: HTMLElement | undefined;
let confirmModalOnConfirm: (() => void) | undefined;
let confirmModalOnCancel: (() => void) | undefined;
let morphDragArea: DragAreaType;
let idleCountdown: ReturnType<typeof setInterval> | undefined;

const confirmModalCancel = getHtmlElement("#confirm-modal-cancel");
const confirmModalConfirm = getHtmlElement("#confirm-modal-confirm");
const confirmModalDescription = getHtmlElement("#confirm-modal-description");
const confirmModalTitle = getHtmlElement("#confirm-modal-title");
const errorModalButton = getHtmlElement("#error-modal-button");
const errorModalDescription = getHtmlElement("#error-modal-description");
const errorModalSignOut = getHtmlElement("#error-modal-signout");
const idleModalClose = getHtmlElement("#idle-modal-close");
const idleModalDescription = getHtmlElement("#idle-modal-description");
const idleModalKeep = getHtmlElement("#idle-modal-keep");
const modalDialog = getModalDialog();
const modalsContainer = getHtmlElement("#modals-container");
const morphModalButtonCancel = getHtmlElement("#morph-modal-button-cancel");
const morphModalButtonOk = getHtmlElement("#morph-modal-button-ok");
const morphModalDescription = getHtmlElement("#morph-modal-description");
const morphModalTextbox = getHtmlInputElement("#morph-modal-textbox");
const passwordModalCancel = getHtmlElement("#password-modal-cancel");
const passwordModalId = getHtmlInputElement("#password-modal-id");
const passwordModalPassword = getHtmlInputElement("#password-modal-password");
const passwordModalSubmit = getHtmlElement("#password-modal-submit");
const warningModalButton = getHtmlElement("#warning-modal-button");
const warningModalDescription = getHtmlElement("#warning-modal-description");

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

  // Password modal setup.
  passwordModalPassword.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      passwordSubmit();
    }
  });
  passwordModalSubmit.addEventListener("pointerdown", () => {
    passwordSubmit();
  });
  passwordModalCancel.addEventListener("pointerdown", () => {
    closeModals();
  });

  // Warning modal setup.
  warningModalButton.addEventListener("pointerdown", () => {
    closeModals();
  });

  // Idle modal setup.
  idleModalClose.addEventListener("pointerdown", () => {
    closeModals();
  });

  // Confirm modal setup. Use "click" so that the buttons also work from the keyboard.
  confirmModalConfirm.addEventListener("click", () => {
    const onConfirm = confirmModalOnConfirm;
    confirmModalOnConfirm = undefined;
    confirmModalOnCancel = undefined;
    closeModals();
    onConfirm?.();
  });
  confirmModalCancel.addEventListener("click", () => {
    closeModals();
  });

  // Error modal setup.
  errorModalButton.addEventListener("pointerdown", () => {
    globalThis.location.reload();
  });
  errorModalSignOut.addEventListener("click", signOut);

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

function passwordSubmit() {
  const tableIdString = passwordModalId.value;
  const tableId = parseIntSafe(tableIdString); // The server expects this as a number
  if (tableId === undefined) {
    return;
  }

  const password = passwordModalPassword.value;

  globals.conn!.send("tableJoin", {
    tableId,
    ...(password !== "" && { password }),
  });

  // Record the password in local storage (cookie).
  localStorage.setItem(LOCAL_STORAGE_KEY.JOIN_TABLE_PASSWORD, password);

  closeModals();
}

export function askForPassword(tableId: number): void {
  allowCloseModal = true;

  passwordModalId.setAttribute("value", tableId.toString());

  // We want to fill in the text field with the player's last typed-in password.
  const password = localStorage.getItem(LOCAL_STORAGE_KEY.JOIN_TABLE_PASSWORD);
  if (password !== null && password !== "") {
    passwordModalPassword.value = password;
  }

  // eslint-disable-next-line func-style, unicorn/consistent-function-scoping
  const ready = () => {
    passwordModalPassword.focus();
    passwordModalPassword.select();
  };
  showModal("#password-modal", true, ready);
}

export function askForMorph(
  card: HanabiCard | undefined,
  variant: Variant,
  cardImages: ReadonlyMap<string, HTMLCanvasElement>,
  draggedTo?: DragAreaType,
): void {
  morphDragArea = draggedTo;
  allowCloseModal = false;

  const { suits, ranks } = variant;
  const start =
    card === undefined
      ? { suitIndex: undefined, rank: undefined }
      : card.getMorphedIdentity();
  const startSuitIndex = start.suitIndex ?? 0;
  const startRank = start.rank ?? 1;

  const possibilities =
    card === undefined ? [] : card.state.possibleCardsForEmpathy;
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
    possibilities,
    cardImages,
  );

  showModal("#morph-modal", false, () => {
    morphModalTextbox.focus();
    morphModalTextbox.select();
  });

  if (draggedTo === undefined) {
    // If action is undefined, the function was called from "HanabiCardClick.ts" during replay hypo.
    morphModalDescription.textContent =
      "Select the card you want to morph it into.";

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonOk.onclick = () => {
      morphReplayOkButton(card, variant);
    };

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonCancel.onclick = morphReplayCancelButton;
  } else {
    // The function was called from "LayoutChild.ts" during in-game hypo.
    morphModalDescription.textContent =
      "What will the card will be for the purposes of this hypothetical?";

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonOk.onclick = () => {
      morphInGameOkButton(card, variant);
    };

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonCancel.onclick = () => {
      morphInGameCancelButton(card);
    };
  }
}

function morphFinishLayout(card: HanabiCard | undefined) {
  // Finish drag action.
  if (card === undefined) {
    return;
  }

  card.getLayoutParent().continueDragAction(morphDragArea);
}

function morphReplayOkButton(
  card: HanabiCard | undefined,
  variant: Variant,
): boolean {
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

  morphReplayFromModal(card!, cardIdentity);
  return true;
}

function morphInGameOkButton(card: HanabiCard | undefined, variant: Variant) {
  const success = morphReplayOkButton(card, variant);
  if (!success) {
    morphDragArea = undefined;
  }

  morphFinishLayout(card);
}

function morphReplayCancelButton() {
  allowCloseModal = true;
  closeModals();
}

function morphInGameCancelButton(card: HanabiCard | undefined) {
  morphReplayCancelButton();
  morphDragArea = undefined;
  morphFinishLayout(card);
}

export function showWarning(msg: string): void {
  // An error stops the connection and can only be left by reloading, so a later (or delayed)
  // warning must not replace it.
  if (globals.errorOccurred) {
    return;
  }
  allowCloseModal = true;

  // Warning messages include intentional markup from the server and client.
  // eslint-disable-next-line unicorn/no-unsafe-dom-html
  warningModalDescription.innerHTML = msg;

  // Store the screen's active element.
  globals.lastActiveElement = document.activeElement as HTMLElement;

  // Show the modal and focus the close button.
  // eslint-disable-next-line func-style, unicorn/consistent-function-scoping
  const ready = () => {
    warningModalButton.focus();
  };
  showModal("#warning-modal", true, ready);
}

/**
 * Warns that an ongoing game will end soon because nobody has taken a turn, counting down until it
 * ends. Players get a button that keeps the game going.
 */
export function showIdleWarning(
  remainingMs: number,
  keepPlaying: (() => void) | undefined,
): void {
  if (globals.errorOccurred) {
    return;
  }

  const deadline = Date.now() + remainingMs;
  const countdown = document.createElement("strong");
  idleModalDescription.replaceChildren(
    "Nobody has taken a turn in a while, so this game will end in ",
    countdown,
    keepPlaying === undefined
      ? " unless a player takes a turn or keeps it going."
      : " unless someone takes a turn or keeps it going.",
  );
  function update() {
    countdown.textContent = millisecondsToClockString(
      Math.max(0, deadline - Date.now()),
    );
  }
  update();
  stopIdleCountdown();
  idleCountdown = setInterval(() => {
    if (currentModal?.id === "idle-modal") {
      update();
    } else {
      stopIdleCountdown();
    }
  }, SECOND_IN_MILLISECONDS);

  idleModalKeep.style.display = keepPlaying === undefined ? "none" : "";
  // We can't use "addEventListener" because we can't easily remove the previous listener.
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  idleModalKeep.onpointerdown = () => {
    keepPlaying?.();
    closeIdleWarning();
  };

  globals.lastActiveElement = document.activeElement as HTMLElement;
  showModal("#idle-modal", true, () => {
    (keepPlaying === undefined ? idleModalClose : idleModalKeep).focus();
  });
}

/** Closes the idle warning (and only it), for example after a turn keeps the game going. */
export function closeIdleWarning(): void {
  stopIdleCountdown();
  if (currentModal?.id === "idle-modal") {
    closeModals();
  }
}

function stopIdleCountdown() {
  if (idleCountdown !== undefined) {
    clearInterval(idleCountdown);
    idleCountdown = undefined;
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
  if (globals.errorOccurred) {
    onCancel?.();
    return;
  }

  confirmModalTitle.textContent = title;
  confirmModalDescription.textContent = description;
  confirmModalConfirm.textContent = confirmText;

  // Store the screen's active element.
  globals.lastActiveElement = document.activeElement as HTMLElement;

  // eslint-disable-next-line func-style
  const ready = () => {
    confirmModalConfirm.focus();
  };
  showModal("#confirm-modal", true, ready);

  // Showing the modal closes any previous one (and cancels its confirmation), so the new callbacks
  // must be stored afterward.
  confirmModalOnConfirm = onConfirm;
  confirmModalOnCancel = onCancel;
}

/** The reason stays visible if a reconnect error (such as an outdated client) replaces it. */
export function showDowntime(msg: string): void {
  showWarning(msg);
  downtimeMessage = msg;
}

export function showError(msg: string): void {
  // Do nothing if we are already showing the error modal.
  if (globals.errorOccurred) {
    return;
  }
  // This also clears the buttons of the navigation bar.
  globals.errorOccurred = true;

  // Error messages include the formatted stack trace from "errors.ts".
  // eslint-disable-next-line unicorn/no-unsafe-dom-html
  errorModalDescription.innerHTML =
    downtimeMessage === undefined
      ? msg
      : `${downtimeMessage}<br /><br />${msg}`;
  showModal("#error-modal", false);
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
