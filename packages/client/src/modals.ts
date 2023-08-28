// Modals (boxes that hover on top of the UI).

import type { Rank, Suit, SuitRankTuple, Variant } from "@hanabi/data";
import { assertDefined, parseIntSafe } from "@hanabi/utils";
import { globals } from "./Globals";
import * as noteIdentity from "./game/reducers/noteIdentity";
import type { HanabiCard } from "./game/ui/HanabiCard";
import { morphReplayFromModal } from "./game/ui/HanabiCardClick";
import * as lobbyNav from "./lobby/nav";
import * as sounds from "./sounds";
import { getHTMLElement, getHTMLInputElement } from "./utils";

/** Used by the morph dialog. */
type DragAreaType = "playArea" | "discardArea" | null;

let allowCloseModal = true;
let currentModal: HTMLElement | null = null;
let morphDragArea: DragAreaType = null;

const createGameSubmit = getHTMLElement("#create-game-submit");
const createTablePassword = getHTMLInputElement("#createTablePassword");
const errorModalButton = getHTMLElement("#error-modal-button");
const errorModalDescription = getHTMLElement("#error-modal-description");
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

  // Error modal setup.
  errorModalButton.addEventListener("pointerdown", () => {
    window.location.reload();
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
  passwordModalPassword.focus();

  // We want to fill in the text field with the player's last typed-in password.
  const password = localStorage.getItem("joinTablePassword");
  if (password !== null && password !== "") {
    passwordModalPassword.value = password;
    passwordModalPassword.select();
  }

  // eslint-disable-next-line func-style
  const before = () => {
    passwordModalPassword.select();
    return true;
  };
  showModal("#password-modal", true, before);
}

export function askForMorph(
  card: HanabiCard | null,
  variant: Variant,
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
  );

  showModal("#morph-modal", false);
  setTimeout(() => {
    morphModalTextbox.focus();
    morphModalTextbox.select();
  }, 100);

  if (draggedTo === null) {
    // If action is null, the function was called from "HanabiCardClick.ts" during replay hypo.
    morphModalDescription.innerHTML =
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
    morphModalDescription.innerHTML =
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
  allowCloseModal = true;

  warningModalDescription.innerHTML = msg;

  // Store the screen's active element.
  globals.lastActiveElement = document.activeElement as HTMLElement;

  // Show the modal and focus the close button.
  // eslint-disable-next-line func-style, unicorn/consistent-function-scoping
  const before = () => {
    warningModalButton.focus();
    return true;
  };
  showModal("#warning-modal", true, before);
}

export function showError(msg: string): void {
  // Do nothing if we are already showing the error modal.
  if (globals.errorOccurred) {
    return;
  }
  globals.errorOccurred = true;

  // Clear out the top navigation buttons.
  lobbyNav.show("nothing");

  errorModalDescription.innerHTML = msg;
  showModal("#error-modal", false);

  // Play a sound if the server has shut down.
  if (msg.includes("The server is going down for scheduled maintenance.")) {
    sounds.play("turn_double_discard");
  }
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
    }, 100);
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
    }, 100);
  }
}

export function closeModals(fast = false): void {
  if (!allowCloseModal) {
    return;
  }

  pageCover.classList.remove("show");
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
      pageCover.style.display = "none";
    }, 100);
  }

  if (globals.lastActiveElement !== null) {
    globals.lastActiveElement.focus();
  }
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
  }, 100);
}

function fillMorphModalWithRadios(
  element: string,
  suits: readonly Suit[],
  ranks: readonly Rank[],
  startSuit: Suit,
  startRank: Rank,
  possibilities: readonly SuitRankTuple[],
) {
  const placeHolder = getHTMLElement(element);
  placeHolder.innerHTML = "";
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
      const radioId = `morph-radio-${suit.abbreviation}-${rank}`;

      radio.setAttribute("type", "radio");
      radio.setAttribute("name", "morph-cards");
      radio.setAttribute("id", radioId);
      radio.setAttribute("value", `${suit.displayName} ${rank}`);
      cell.append(radio);

      const label = document.createElement("label");
      label.setAttribute("for", radioId);
      const image: HTMLCanvasElement = window.globals.cardImages.get(
        `card-${suit.name}-${rank}`,
      )!;
      label.append(image);
      cell.append(label);

      if (suit === startSuit && rank === startRank) {
        radio.setAttribute("checked", "checked");
        morphModalTextbox.dataset["suit"] = suit.displayName;
        morphModalTextbox.dataset["rank"] = rank === 7 ? "S" : rank.toString();
      }
      radio.addEventListener("change", () => {
        if (!radio.checked) {
          return;
        }

        // Set textbox data attribute.
        morphModalTextbox.dataset["suit"] = suit.displayName;
        morphModalTextbox.dataset["rank"] = rank === 7 ? "S" : rank.toString();
      });

      row.append(cell);
    }

    table.append(row);
  }

  placeHolder.append(table);
}
