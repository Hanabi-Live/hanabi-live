// Modals (boxes that hover on top of the UI).

import type { Suit, Variant } from "@hanabi/data";
import { parseIntSafe } from "@hanabi/utils";
import * as noteIdentity from "./game/reducers/noteIdentity";
import { CardIdentityType } from "./game/types/CardIdentityType";
import type { HanabiCard } from "./game/ui/HanabiCard";
import { morphReplayFromModal } from "./game/ui/HanabiCardClick";
import { globals } from "./globals";
import * as lobbyNav from "./lobby/nav";
import * as sounds from "./sounds";
import { getHTMLElement, getHTMLInputElement } from "./utils";

let initialized = false;
let allowCloseModal = true;
let currentModal: HTMLElement | null = null;

/** Used by the morph dialog. */
type DragAreaType = "playArea" | "discardArea" | null;

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

// Initialize various element behavior within the modals.
function init(): boolean {
  if (initialized) {
    return true;
  }

  // Close modal on escape press or by clicking outside.
  pageCover.addEventListener("pointerdown", () => {
    closeModals();
  });
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && currentModal !== null) {
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

  initialized = true;
  return true;
}

export function askForPassword(tableID: number): void {
  if (!init()) {
    return;
  }

  allowCloseModal = true;

  passwordModalID.setAttribute("value", tableID.toString());
  passwordModalPassword.focus();

  // We want to fill in the text field with the player's last typed-in password.
  const password = localStorage.getItem("joinTablePassword");
  if (password !== null && password !== "") {
    passwordModalPassword.value = password;
    passwordModalPassword.select();
  }

  showModal("#password-modal", null, () => {
    passwordModalPassword.select();
  });
}

export function askForMorph(
  card: HanabiCard | null,
  variant: Variant,
  draggedTo: DragAreaType = null,
): void {
  if (!init()) {
    return;
  }
  let dragArea = draggedTo;

  // eslint-disable-next-line func-style
  const morphFinishLayout = () => {
    // Finish drag action.
    if (card === null) {
      return;
    }

    card.getLayoutParent().continueDragAction(dragArea);
  };

  // eslint-disable-next-line func-style
  const morphReplayOkButton = (): boolean => {
    allowCloseModal = true;
    closeModals();

    const cardIdentity = noteIdentity.parseIdentity(
      variant,
      morphModalTextbox.value,
    );

    if (
      cardIdentity.suitIndex === CardIdentityType.Fail ||
      cardIdentity.rank === CardIdentityType.Fail
    ) {
      // The morph did not succeed.
      return false;
    }

    morphReplayFromModal(card!, cardIdentity);
    return true;
  };

  // eslint-disable-next-line func-style
  const morphInGameOkButton = () => {
    const success = morphReplayOkButton();
    if (!success) {
      dragArea = null;
    }

    morphFinishLayout();
  };

  // eslint-disable-next-line func-style
  const morphReplayCancelButton = () => {
    allowCloseModal = true;
    closeModals();
  };

  // eslint-disable-next-line func-style
  const morphInGameCancelButton = () => {
    morphReplayCancelButton();
    dragArea = null;
    morphFinishLayout();
  };

  allowCloseModal = false;

  const { suits } = variant;
  const { ranks } = variant;
  const start =
    card !== null ? card.getMorphedIdentity() : { suitIndex: null, rank: null };
  const startSuit = start.suitIndex ?? 0;
  const startRank = start.rank !== null && start.rank !== 0 ? start.rank : 1;
  const possibilities = card !== null ? card.state.possibleCardsForEmpathy : [];

  fillMorphModalWithRadios(
    "#morph-modal-cards",
    suits,
    ranks,
    suits[startSuit]!,
    startRank,
    possibilities,
  );

  showModal("#morph-modal", false);
  setTimeout(() => {
    morphModalTextbox.focus();
    morphModalTextbox.select();
  }, 100);

  if (draggedTo === null) {
    // If action is null, the function was called from HanabiCardClick.ts during replay hypo.

    // Set the dialog text.
    morphModalDescription.innerHTML =
      "Select the card you want to morph it into:";

    // Morph modal OK button.
    morphModalButtonOK.addEventListener("click", morphReplayOkButton);

    // Morph modal Cancel button.
    morphModalButtonCancel.addEventListener("click", morphReplayCancelButton);
  } else {
    // The function was called from LayoutChild.ts during in-game hypo.

    // Set the dialog text.
    morphModalDescription.innerHTML =
      "What the card will be for the purposes of this hypothetical?";

    // Morph modal OK button.
    morphModalButtonOK.addEventListener("click", morphInGameOkButton);

    // Morph modal Cancel button.
    morphModalButtonCancel.addEventListener("click", morphInGameCancelButton);
  }
}

function passwordSubmit() {
  if (!init()) {
    return;
  }

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

export function showWarning(msg: string): void {
  if (!init()) {
    return;
  }

  allowCloseModal = true;

  warningModalDescription.innerHTML = msg;

  // Store the screen's active element.
  globals.lastActiveElement = document.activeElement as HTMLElement;

  // Show the modal and focus the close button.
  showModal("#warning-modal", () => {
    warningModalButton.focus();
  });
}

export function showError(msg: string): void {
  if (!init()) {
    return;
  }

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

export function setModal(
  buttonSelector: string,
  selector: string,
  before?: () => unknown,
  test?: () => unknown,
  focus: (() => unknown) | string | null = null,
): void {
  if (!init()) {
    return;
  }

  const button = getHTMLElement(buttonSelector);

  button.addEventListener("click", () => {
    // eslint-disable-next-line
    if (!(test?.call(null) ?? true)) {
      return;
    }
    showModal(selector, before);
    if (focus === null) {
      return;
    }
    setTimeout(() => {
      if (typeof focus === "string") {
        getHTMLElement(focus).focus();
      } else {
        focus.call(null);
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
  if (!init()) {
    return;
  }

  // eslint-disable-next-line
  if (!(test?.call(null) ?? true)) {
    return;
  }

  if (focusElement !== null && clickButtonElement !== null) {
    focusElement.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        clickButtonElement.click();
      }
    });
  }

  showModal(selector);

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

function showModal(selector: string, allowClose: boolean): void;
function showModal(selector: string, before?: () => unknown): void;
function showModal(
  selector: string,
  before: (() => unknown) | null,
  ready: (() => unknown) | null,
): void;

function showModal(
  selector: string,
  param2?: (() => unknown) | boolean | null,
  param3?: (() => unknown) | boolean | null,
) {
  const element = getHTMLElement(selector);

  closeModals(true);

  currentModal = element;

  allowCloseModal = true;
  if (typeof param2 === "boolean") {
    allowCloseModal = param2;
  }

  element.classList.add("modal");
  element.addEventListener("pointerdown", (event) => {
    // Do not bubble clicks to pageCover.
    event.stopPropagation();
  });

  if (typeof param2 === "function") {
    const result = param2.call(null);
    // eslint-disable-next-line
    if (result ?? false) {
      return;
    }
  }

  pageCover.append(element);

  pageCover.style.display = "flex";
  pageCover.classList.add("show");
  setTimeout(() => {
    pageCover.append(element);
    element.classList.remove("hidden");
    if (typeof param3 === "function") {
      param3.call(null);
    }
  }, 100);
}

function fillMorphModalWithRadios(
  element: string,
  suits: readonly Suit[],
  ranks: readonly number[],
  startSuit: Suit,
  startRank: number,
  possibilities: ReadonlyArray<readonly [number, number]>,
) {
  const placeHolder = getHTMLElement(element);
  placeHolder.innerHTML = "";
  const table = document.createElement("table");
  table.classList.add("slim-table");

  for (const rank of ranks) {
    const row = document.createElement("tr");

    for (const [i, suit] of suits.entries()) {
      const cell = document.createElement("td");
      const possibleCardIdentity = possibilities.some(
        (possibility) => possibility[0] === i && possibility[1] === rank,
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
