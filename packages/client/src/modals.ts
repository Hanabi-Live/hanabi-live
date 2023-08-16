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

let initialized = false;
let allowCloseModal = true;
let currentModal: HTMLElement | null = null;

// Used by morph dialog.
type DragAreaType = "playArea" | "discardArea" | null;

const pageCover = getElement("#page-cover");
const modalsContainer = getElement("#modals-container");

// Initialize various element behavior within the modals.
function init() {
  if (initialized) {
    return true;
  }

  // Close modal on escape press or by clicking outside.
  pageCover.onpointerdown = () => {
    closeModals();
  };
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && currentModal !== null) {
      closeModals();
    }
  });

  // Password modal setup.
  getElement("#password-modal-password").addEventListener(
    "keypress",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        passwordSubmit();
      }
    },
  );
  getElement("#password-modal-submit").onpointerdown = () => {
    passwordSubmit();
  };
  getElement("#password-modal-cancel").onpointerdown = () => {
    closeModals();
  };

  // Warning modal setup.
  getElement("#warning-modal-button").onpointerdown = () => {
    closeModals();
  };

  // Error modal setup.
  getElement("#error-modal-button").onpointerdown = () => {
    window.location.reload();
  };

  // Create Game modal setup.
  getElement("#createTablePassword").onkeydown = (event) => {
    if (event.key === "Enter") {
      getElement("#create-game-submit").click();
    }
  };

  // Morph modal textbox.
  const morphTextbox = getInputElement("#morph-modal-textbox");
  const morphTextboxObserver = new MutationObserver(() => {
    const { suit } = morphTextbox.dataset;
    const { rank } = morphTextbox.dataset;
    morphTextbox.value = `${suit} ${rank}`;
  });
  morphTextboxObserver.observe(morphTextbox, {
    attributes: true,
    attributeFilter: ["data-suit", "data-rank"],
  });
  morphTextbox.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      getElement("#morph-modal-button-ok").click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      getElement("#morph-modal-button-cancel").click();
    }
  };

  initialized = true;

  return true;
}

export function askForPassword(tableID: number): void {
  if (!init()) {
    return;
  }

  allowCloseModal = true;

  getElement("#password-modal-id").setAttribute("value", tableID.toString());
  getElement("#password-modal-password").focus();

  // We want to fill in the text field with the player's last typed-in password.
  const password = localStorage.getItem("joinTablePassword");
  const element = getInputElement("#password-modal-password");
  if (password !== null && password !== "") {
    element.value = password;
    element.select();
  }

  showModal("#password-modal", null, () => {
    element.select();
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
      getMorphModalSelection(),
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
    const textbox = getInputElement("#morph-modal-textbox");
    textbox.focus();
    textbox.select();
  }, 100);

  if (draggedTo === null) {
    // If action is null, the function was called from HanabiCardClick.ts during replay hypo.

    // Set the dialog text.
    getElement("#morph-modal p").innerHTML =
      "Select the card you want to morph it into:";

    // Morph modal OK button.
    getElement("#morph-modal-button-ok").onclick = morphReplayOkButton;

    // Morph modal Cancel button.
    getElement("#morph-modal-button-cancel").onclick = morphReplayCancelButton;
  } else {
    // The function was called from LayoutChild.ts during in-game hypo.

    // Set the dialog text.
    getElement("#morph-modal p").innerHTML =
      "What the card will be for the purposes of this hypothetical?";

    // Morph modal OK button.
    getElement("#morph-modal-button-ok").onclick = morphInGameOkButton;

    // Morph modal Cancel button.
    getElement("#morph-modal-button-cancel").onclick = morphInGameCancelButton;
  }
}

function passwordSubmit() {
  if (!init()) {
    return;
  }

  const tableIDString = getInputElement("#password-modal-id").value;
  const tableID = parseIntSafe(tableIDString); // The server expects this as a number

  const password = getInputElement("#password-modal-password").value;

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

  getElement("#warning-modal-description").innerHTML = msg;

  // Store the screen's active element.
  globals.lastActiveElement = document.activeElement as HTMLElement;

  // Show the modal and focus the close button.
  showModal("#warning-modal", () => {
    getElement("#warning-modal-button").focus();
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

  getElement("#error-modal-description").innerHTML = msg;
  showModal("#error-modal", false);

  // Play a sound if the server has shut down.
  if (
    /The server is going down for scheduled maintenance./.exec(msg) !== null
  ) {
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

  const button = getElement(buttonSelector);

  button.onclick = () => {
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
        getElement(focus).focus();
      } else {
        focus.call(null);
      }
    }, 100);
  };
}

export function showPrompt(
  selector: string,
  test: (() => unknown) | null = null,
  focusElement: HTMLInputElement | null = null,
  clickButtonElement: HTMLButtonElement | null = null,
): void {
  if (!init()) {
    return;
  }

  // eslint-disable-next-line
  if (!(test?.call(null) ?? true)) {
    return;
  }

  if (focusElement !== null && clickButtonElement !== null) {
    focusElement.onkeydown = (event) => {
      if (event.key === "Enter") {
        clickButtonElement.click();
      }
    };
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
    modalsContainer.appendChild(currentModal);
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

function getElement(element: string): HTMLElement {
  return document.querySelector(element) ?? new HTMLElement();
}

function getInputElement(element: string): HTMLInputElement {
  return getElement(element) as HTMLInputElement;
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
  const element = getElement(selector);

  closeModals(true);

  currentModal = element;

  allowCloseModal = true;
  if (typeof param2 === "boolean") {
    allowCloseModal = param2;
  }

  element.classList.add("modal");
  element.onpointerdown = (event) => {
    // Do not bubble clicks to pageCover.
    event.stopPropagation();
  };

  if (typeof param2 === "function") {
    const result = param2.call(null);
    // eslint-disable-next-line
    if (result ?? false) {
      return;
    }
  }

  pageCover.appendChild(element);

  pageCover.style.display = "flex";
  pageCover.classList.add("show");
  setTimeout(() => {
    pageCover.appendChild(element);
    element.classList.remove("hidden");
    if (typeof param3 === "function") {
      param3.call(null);
    }
  }, 100);
}

function getMorphModalSelection(): string {
  const inputElement = getInputElement("#morph-modal-textbox");
  return inputElement.value;
}

function fillMorphModalWithRadios(
  element: string,
  suits: readonly Suit[],
  ranks: readonly number[],
  startSuit: Suit,
  startRank: number,
  possibilities: ReadonlyArray<readonly [number, number]>,
) {
  const placeHolder = getElement(element)!;
  placeHolder.innerHTML = "";
  const table = document.createElement("table");
  table.classList.add("slim-table");
  const textbox = getElement("#morph-modal-textbox");

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
        textbox.dataset["suit"] = suit.displayName;
        textbox.dataset["rank"] = rank === 7 ? "S" : rank.toString();
      }
      radio.addEventListener("change", () => {
        if (!radio.checked) {
          return;
        }

        // Set textbox data attribute.
        textbox.dataset["suit"] = suit.displayName;
        textbox.dataset["rank"] = rank === 7 ? "S" : rank.toString();
      });

      row.append(cell);
    }
    table.append(row);
  }
  placeHolder.append(table);
}
