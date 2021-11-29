// Modals (boxes that hover on top of the UI)

import globals from "./globals";
import * as lobbyNav from "./lobby/nav";
import { parseIntSafe } from "./misc";
import * as sounds from "./sounds";

let initialized = false;
let allowCloseModal = true;
let currentModal: HTMLElement | null = null;

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

  // Set turn slider
  getElement("#set-turn-range").addEventListener("input", (evt) => {
    document
      .getElementById("set-turn-label")
      ?.setAttribute("data-value", (<HTMLInputElement>evt.target).value);
  });

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

function passwordSubmit() {
  if (!init()) {
    return;
  }

  console.log("DIALOG: password submit 1");

  console.log("DIALOG: password submit 2");
  const tableIDString = getInputElement("#password-modal-id").value;
  console.log(`DIALOG: password submit tableIDString: ${tableIDString}`);
  const tableID = parseIntSafe(tableIDString); // The server expects this as a number

  console.log("DIALOG: password submit 3");
  const password = getInputElement("#password-modal-password").value;

  console.log(`DIALOG: password submit 4 : ${password}`);
  globals.conn!.send("tableJoin", {
    tableID,
    password,
  });

  // Record the password in local storage (cookie)
  localStorage.setItem("joinTablePassword", password);

  console.log("DIALOG: password submit 5");

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

  allowCloseModal = false;

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
): void {
  if (!init()) {
    return;
  }

  const button = getElement(buttonSelector);

  button.onpointerdown = () => {
    if (!(test?.call(null) ?? true)) {
      return;
    }
    showModal(selector, before);
  };
}

export function showPrompt(
  selector: string,
  test: (() => unknown) | null = null,
): void {
  if (!init()) {
    return;
  }

  if (!(test?.call(null) ?? true)) {
    return;
  }

  showModal(selector);
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
  console.log(`DIALOG: searching for ${element}`);
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
