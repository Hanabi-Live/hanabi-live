// Modals (boxes that hover on top of the UI).

import type { Rank, Suit, SuitRankTuple, Variant } from "@hanabi-live/game";
import { millisecondsToClockString, START_CARD_RANK } from "@hanabi-live/game";
import {
  assertDefined,
  parseIntSafe,
  SECOND_IN_MILLISECONDS,
} from "complete-common";
import { globals } from "./Globals";
import * as noteIdentity from "./game/reducers/noteIdentity";
import type { HanabiCard } from "./game/ui/HanabiCard";
import { morphReplayFromModal } from "./game/ui/HanabiCardClick";
import * as lobbyNav from "./lobby/nav";
import { getHTMLElement, getHTMLInputElement } from "./utils";

/**
 * How long the modal code waits for the page cover to change before showing, focusing, or hiding
 * what is behind it.
 */
export const MODAL_DELAY_MILLISECONDS = 100;

/** Used by the morph dialog. */
type DragAreaType = "playArea" | "discardArea" | null;

let allowCloseModal = true;
/** An administrator's reason for a restart or stop, shown until its warning modal is closed. */
let downtimeMessage: string | null = null;
let currentModal: HTMLElement | null = null;
let confirmModalOnConfirm: (() => void) | null = null;
let confirmModalOnCancel: (() => void) | null = null;
let morphDragArea: DragAreaType = null;
let idleCountdown: ReturnType<typeof setInterval> | null = null;

const confirmModalCancel = getHTMLElement("#confirm-modal-cancel");
const confirmModalConfirm = getHTMLElement("#confirm-modal-confirm");
const confirmModalDescription = getHTMLElement("#confirm-modal-description");
const confirmModalTitle = getHTMLElement("#confirm-modal-title");
const createGameSubmit = getHTMLElement("#create-game-submit");
const createTablePassword = getHTMLInputElement("#createTablePassword");
const errorModalButton = getHTMLElement("#error-modal-button");
const errorModalDescription = getHTMLElement("#error-modal-description");
const idleModalClose = getHTMLElement("#idle-modal-close");
const idleModalDescription = getHTMLElement("#idle-modal-description");
const idleModalKeep = getHTMLElement("#idle-modal-keep");
const pageCover = getHTMLElement("#page-cover");
const modalsContainer = getHTMLElement("#modals-container");
const morphModalButtonCancel = getHTMLElement("#morph-modal-button-cancel");
const morphModalButtonOK = getHTMLElement("#morph-modal-button-ok");
const morphModalDescription = getHTMLElement("#morph-modal-description");
const morphModalTextbox = getHTMLInputElement("#morph-modal-textbox");
const passwordModalCancel = getHTMLElement("#password-modal-cancel");
const passwordModalID = getHTMLInputElement("#password-modal-id");
const passwordModalPassword = getHTMLInputElement("#password-modal-password");
const passwordModalSubmit = getHTMLElement("#password-modal-submit");
const warningModalButton = getHTMLElement("#warning-modal-button");
const warningModalDescription = getHTMLElement("#warning-modal-description");

export function init(): void {
  // Close modal on escape press or by clicking outside.
  pageCover.addEventListener("pointerdown", () => {
    closeModals();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && currentModal !== null) {
      // The key press must not also act on the screen behind the modal (e.g. leaving a replay).
      event.stopImmediatePropagation();
      closeModals();
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
    confirmModalOnConfirm = null;
    confirmModalOnCancel = null;
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

  // Create Game modal setup.
  createTablePassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      createGameSubmit.click();
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
      morphModalButtonOK.click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      morphModalButtonCancel.click();
    }
  });
}

function passwordSubmit() {
  const tableIDString = passwordModalID.value;
  const tableID = parseIntSafe(tableIDString); // The server expects this as a number
  if (tableID === undefined) {
    return;
  }

  const password = passwordModalPassword.value;

  globals.conn!.send("tableJoin", {
    tableID,
    password,
  });

  // Record the password in local storage (cookie).
  localStorage.setItem("joinTablePassword", password);

  closeModals();
}

export function askForPassword(tableID: number): void {
  allowCloseModal = true;

  passwordModalID.setAttribute("value", tableID.toString());

  // We want to fill in the text field with the player's last typed-in password.
  const password = localStorage.getItem("joinTablePassword");
  if (password !== null && password !== "") {
    passwordModalPassword.value = password;
  }

  // eslint-disable-next-line func-style, unicorn/consistent-function-scoping
  const ready = () => {
    passwordModalPassword.focus();
    passwordModalPassword.select();
  };
  showModal("#password-modal", true, undefined, ready);
}

export function askForMorph(
  card: HanabiCard | null,
  variant: Variant,
  cardImages: ReadonlyMap<string, HTMLCanvasElement>,
  draggedTo: DragAreaType = null,
): void {
  morphDragArea = draggedTo;
  allowCloseModal = false;

  const { suits, ranks } = variant;
  const start =
    card === null ? { suitIndex: null, rank: null } : card.getMorphedIdentity();
  const startSuitIndex = start.suitIndex ?? 0;
  const startRank = start.rank ?? 1;

  const possibilities = card === null ? [] : card.state.possibleCardsForEmpathy;
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

  showModal("#morph-modal", false);
  setTimeout(() => {
    morphModalTextbox.focus();
    morphModalTextbox.select();
  }, MODAL_DELAY_MILLISECONDS);

  if (draggedTo === null) {
    // If action is null, the function was called from "HanabiCardClick.ts" during replay hypo.
    morphModalDescription.textContent =
      "Select the card you want to morph it into.";

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonOK.onclick = () => {
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
    morphModalButtonOK.onclick = () => {
      morphInGameOkButton(card, variant);
    };

    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    morphModalButtonCancel.onclick = () => {
      morphInGameCancelButton(card);
    };
  }
}

function morphFinishLayout(card: HanabiCard | null) {
  // Finish drag action.
  if (card === null) {
    return;
  }

  card.getLayoutParent().continueDragAction(morphDragArea);
}

function morphReplayOkButton(
  card: HanabiCard | null,
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

function morphInGameOkButton(card: HanabiCard | null, variant: Variant) {
  const success = morphReplayOkButton(card, variant);
  if (!success) {
    morphDragArea = null;
  }

  morphFinishLayout(card);
}

function morphReplayCancelButton() {
  allowCloseModal = true;
  closeModals();
}

function morphInGameCancelButton(card: HanabiCard | null) {
  morphReplayCancelButton();
  morphDragArea = null;
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
  showModal("#warning-modal", true, undefined, ready);
}

/**
 * Warns that an ongoing game will end soon because nobody has taken a turn, counting down until it
 * ends. Players get a button that keeps the game going.
 */
export function showIdleWarning(
  remainingMs: number,
  keepPlaying: (() => void) | null,
): void {
  if (globals.errorOccurred) {
    return;
  }

  const deadline = Date.now() + remainingMs;
  const countdown = document.createElement("strong");
  idleModalDescription.replaceChildren(
    "Nobody has taken a turn in a while, so this game will end in ",
    countdown,
    keepPlaying === null
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

  idleModalKeep.style.display = keepPlaying === null ? "none" : "";
  // We can't use "addEventListener" because we can't easily remove the previous listener.
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  idleModalKeep.onpointerdown = () => {
    keepPlaying?.();
    closeIdleWarning();
  };

  globals.lastActiveElement = document.activeElement as HTMLElement;
  showModal("#idle-modal", true, undefined, () => {
    (keepPlaying === null ? idleModalClose : idleModalKeep).focus();
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
  if (idleCountdown !== null) {
    clearInterval(idleCountdown);
    idleCountdown = null;
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
  showModal("#confirm-modal", true, undefined, ready);

  // Showing the modal closes any previous one (and cancels its confirmation), so the new callbacks
  // must be stored afterward.
  confirmModalOnConfirm = onConfirm;
  confirmModalOnCancel = onCancel ?? null;
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
  globals.errorOccurred = true;

  // Clear out the top navigation buttons.
  lobbyNav.show("nothing");

  // Error messages include the formatted stack trace from "errors.ts".
  // eslint-disable-next-line unicorn/no-unsafe-dom-html
  errorModalDescription.innerHTML =
    downtimeMessage === null ? msg : `${downtimeMessage}<br /><br />${msg}`;
  showModal("#error-modal", false);
}

/** Initializes a modal for a specific element. */
export function initModal(
  buttonSelector: string,
  selector: string,
  before?: () => boolean,
  test?: () => boolean,
  focus?: (() => unknown) | string,
): void {
  const button = getHTMLElement(buttonSelector);

  button.addEventListener("click", () => {
    if (test !== undefined) {
      const result = test();
      if (!result) {
        return;
      }
    }

    showModal(selector, true, before);

    if (focus === undefined) {
      return;
    }

    setTimeout(() => {
      if (typeof focus === "string") {
        getHTMLElement(focus).focus();
      } else {
        focus();
      }
    }, MODAL_DELAY_MILLISECONDS);
  });
}

export function showPrompt(
  selector: string,
  test: (() => unknown) | null = null,
  focusElement: HTMLInputElement | null = null,
  clickButtonElement: HTMLElement | null = null,
): void {
  // eslint-disable-next-line
  if (!(test?.call(null) ?? true)) {
    return;
  }

  if (focusElement !== null && clickButtonElement !== null) {
    // We can't use "addEventListener" because we can't easily remove the previous listener.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    focusElement.onkeydown = (event) => {
      if (event.key === "Enter") {
        clickButtonElement.click();
      }
    };
  }

  showModal(selector, true);

  if (focusElement !== null) {
    setTimeout(() => {
      focusElement.focus();
      const oldType = focusElement.type;
      if (oldType === "number" || oldType === "text") {
        const { length } = focusElement.value;
        // Cannot put the cursor past the text unless it's a text input.
        focusElement.type = "text";
        focusElement.setSelectionRange(0, length);
        focusElement.type = oldType;
      }
    }, MODAL_DELAY_MILLISECONDS);
  }
}

export function closeModals(fast = false): void {
  if (!allowCloseModal) {
    return;
  }

  pageCover.classList.remove("show");
  downtimeMessage = null;
  if (currentModal !== null) {
    currentModal.classList.add("hidden");
    currentModal.remove();
    modalsContainer.append(currentModal);
    currentModal = null;
  }

  if (fast) {
    pageCover.style.display = "none";
  } else {
    setTimeout(() => {
      // A modal may have been opened in the meantime (e.g. a confirmation after a prompt).
      if (currentModal === null) {
        pageCover.style.display = "none";
      }
    }, MODAL_DELAY_MILLISECONDS);
  }

  if (globals.lastActiveElement !== null) {
    globals.lastActiveElement.focus();
  }

  const onCancel = confirmModalOnCancel;
  confirmModalOnConfirm = null;
  confirmModalOnCancel = null;
  onCancel?.();
}

export function isModalVisible(): boolean {
  return currentModal !== null;
}

function showModal(
  selector: string,
  allowClose: boolean,
  before?: () => boolean,
  ready?: () => void,
) {
  closeModals(true);

  const element = getHTMLElement(selector);

  currentModal = element;
  allowCloseModal = allowClose;

  element.classList.add("modal");

  // We can't use "addEventListener" because we can't easily remove the previous listener.
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  element.onpointerdown = (event) => {
    // Do not bubble clicks to pageCover.
    event.stopPropagation();
  };

  if (before !== undefined) {
    const result = before();
    if (!result) {
      return;
    }
  }

  pageCover.append(element);
  pageCover.style.display = "flex";
  pageCover.classList.add("show");

  setTimeout(() => {
    pageCover.append(element);
    element.classList.remove("hidden");
    if (ready !== undefined) {
      ready();
    }
  }, MODAL_DELAY_MILLISECONDS);
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
  const placeholder = getHTMLElement(element);
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
        morphModalTextbox.dataset["rank"] =
          rank === START_CARD_RANK ? "S" : rank.toString();
      }
      radio.addEventListener("change", () => {
        if (!radio.checked) {
          return;
        }

        // Set textbox data attribute.
        morphModalTextbox.dataset["suit"] = suit.displayName;
        morphModalTextbox.dataset["rank"] =
          rank === START_CARD_RANK ? "S" : rank.toString();
      });

      row.append(cell);
    }

    table.append(row);
  }

  placeholder.append(table);
}
