// Modals (boxes that hover on top of the UI)

import * as noteIdentity from "./game/reducers/noteIdentity";
import HanabiCard from "./game/ui/HanabiCard";
import { morphFromModal } from "./game/ui/HanabiCardClick";
import globals from "./globals";
import * as lobbyNav from "./lobby/nav";
import { parseIntSafe } from "./misc";
import * as sounds from "./sounds";

let initialized = false;
let allowCloseModal = true;
let currentModal: HTMLElement | null = null;

let card: HanabiCard | null = null;

const pageCover = getElement("#page-cover");
const modalsContainer = getElement("#modals-container");

// Initialize various element behavior within the modals
export function init(): boolean {
  if (initialized) {
    return true;
  }

  // Close modal on escape press or by clicking outside
  pageCover.onpointerdown = () => {
    closeModals();
  };
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && currentModal !== null) {
      closeModals();
    }
  });

  // Password modal setup
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

  // Warning modal setup
  getElement("#warning-modal-button").onpointerdown = () => {
    closeModals();
  };

  // Error modal setup
  getElement("#error-modal-button").onpointerdown = () => {
    window.location.reload();
  };

  // Create Game modal setup
  getElement("#createTablePassword").onkeydown = (event) => {
    if (event.key === "Enter") {
      getElement("#create-game-submit").click();
    }
  };

  // Morph modal buttons
  getElement("#morph-modal-button-ok").onclick = () => {
    allowCloseModal = true;
    closeModals();

    const cardIdentity = noteIdentity.parseIdentity(
      window.globals.variant,
      getMorphModalSelection(),
    );
    if (cardIdentity.suitIndex === null || cardIdentity.rank === null) {
      return;
    }
    morphFromModal(card!, cardIdentity);
  };

  getElement("#morph-modal-button-cancel").onclick = () => {
    allowCloseModal = true;
    closeModals();
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

  // We want to fill in the text field with the player's last typed-in password
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

export function askForMorph(morphCard: HanabiCard | null): void {
  if (!init()) {
    return;
  }

  allowCloseModal = false;
  card = morphCard;

  const suits = Array.from(window.globals.variant.suits, (suit) => suit.name);
  const ranks = Array.from(window.globals.variant.ranks, (rank) => rank);

  fillModalWithRadios("#morph-modal-suits", suits, "suit", suits[0], ranks);
  fillModalWithRadios("#morph-modal-ranks", ranks, "rank", suits[0]);

  showModal("#morph-modal", false);
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

  // Record the password in local storage (cookie)
  localStorage.setItem("joinTablePassword", password);

  closeModals();
}

export function showWarning(msg: string): void {
  if (!init()) {
    return;
  }

  allowCloseModal = true;

  getElement("#warning-modal-description").innerHTML = msg;

  // Store the screen's active element
  globals.lastActiveElement = document.activeElement as HTMLElement;

  // Show the modal and focus the close button
  showModal("#warning-modal", () => {
    getElement("#warning-modal-button").focus();
  });
}

export function showError(msg: string): void {
  if (!init()) {
    return;
  }

  // Do nothing if we are already showing the error modal
  if (globals.errorOccurred) {
    return;
  }
  globals.errorOccurred = true;

  // Clear out the top navigation buttons
  lobbyNav.show("nothing");

  getElement("#error-modal-description").innerHTML = msg;
  showModal("#error-modal", false);

  // Play a sound if the server has shut down
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
        const length = focusElement.value.length;
        // Cannot put the cursor past the text unless it's a text input
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
    pageCover.removeChild(currentModal);
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
  return <HTMLInputElement>getElement(element);
}

function showModal(selector: string): void;
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
): void {
  const element = getElement(selector);

  closeModals(true);

  currentModal = element;

  allowCloseModal = true;
  if (typeof param2 === "boolean") {
    allowCloseModal = param2;
  }

  element.classList.add("modal");
  element.onpointerdown = (event) => {
    // Do not bubble clicks to pageCover
    event.stopPropagation();
  };

  if (typeof param2 === "function") {
    const result = param2?.call(null);
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
  const form = Array.from(document.forms).find(
    (el) => el.name === "morph-modal-form",
  )!;

  const suit = (<RadioNodeList>form.elements.namedItem("suit")).value;
  const rank = (<RadioNodeList>form.elements.namedItem("rank")).value;

  if (suit.toLowerCase() === "blank") {
    return suit;
  }

  return `${suit} ${rank}`;
}

function fillModalWithRadios(
  element: string,
  items: string[] | number[],
  groupName: string,
  firstSuit?: string,
  ranks?: number[],
): void {
  const placeHolder = getElement(element)!;
  placeHolder.innerHTML = "";

  let checked = false;
  items.forEach((item) => {
    const div = document.createElement("div");
    const radio = document.createElement("input");
    const radioId = `morph-${groupName}-${item}`;

    radio.setAttribute("type", "radio");
    radio.setAttribute("name", groupName);
    radio.setAttribute("id", radioId);
    radio.setAttribute("value", item.toString());
    if (!checked) {
      radio.setAttribute("checked", "checked");
      checked = true;
    }
    div.append(radio);

    const label = document.createElement("label");
    label.setAttribute("for", radioId);
    let image: HTMLCanvasElement;
    if (typeof item === "string") {
      // suit
      image = window.globals.cardImages.get(`card-${item}-0`)!;
      label.setAttribute("data-suit", item);
      radio.addEventListener("change", (event) => {
        if (!(<HTMLInputElement>event.target).checked) {
          return;
        }
        const suit = label.getAttribute("data-suit");

        ranks?.forEach((rank) => {
          const childCanvas = getElement(`#morph-image-${rank}`);
          const newImage = window.globals.cardImages.get(
            `card-${suit}-${rank}`,
          )!;
          newImage.setAttribute("id", `morph-image-${rank}`);
          childCanvas?.replaceWith(newImage);
        });
      });
    } else {
      // rank
      image = window.globals.cardImages.get(`card-${firstSuit}-${item}`)!;
      image.setAttribute("id", `morph-image-${item}`);
    }

    label.append(image);
    div.append(label);
    placeHolder.append(div);
  });
}
