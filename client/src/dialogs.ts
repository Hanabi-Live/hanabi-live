import { setShadeOpacity } from "./modals";

const backdrop = document.getElementById("backdrop");
const dialogsContainer = document.getElementById("dialogs-container");

let currentDialog: null | HTMLElement = null;
let initialized = false;

function init(): void {
  if (initialized || backdrop === null) {
    return;
  }

  backdrop.onpointerdown = () => {
    hideDialog();
  };

  // Close on Esc keypress
  window.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && backdrop.classList.contains("show")) {
      hideDialog();
    }
  });

  initialized = true;
}

type DialogOptions = {
  before: (() => unknown) | null;
  ready: (() => unknown) | null;
};

type PromptOptions = {
  testFunction: (() => boolean) | null;
};

export function setDialog(
  sourceId: string,
  targetId: string,
  options: DialogOptions | null = null,
): void {
  init();

  if (backdrop === null) {
    return;
  }

  const source = <HTMLElement>document.getElementById(sourceId);
  const target = <HTMLElement>document.getElementById(targetId);

  if (source === null || target === null) {
    return;
  }

  target.classList.add("dialog");
  target.onpointerdown = (event) => {
    // Do not bubble clicks to pageCover
    event.stopPropagation();
  };

  source.onpointerdown = () => {
    setShadeOpacity(0.6);
    options?.ready?.call(null);
    backdrop.style.display = "flex";
    backdrop.classList.add("show");
    setTimeout(() => {
      currentDialog = target;
      backdrop.appendChild(target);
      target.classList.remove("hidden");
      options?.ready?.call(null);
    }, 100);
  };
}

export function showPrompt(
  targetId: string,
  options: PromptOptions | null = null,
): void {
  init();

  if (backdrop === null) {
    return;
  }

  const target = <HTMLElement>document.getElementById(targetId);

  if (target === null) {
    return;
  }

  target.classList.add("dialog");
  target.onpointerdown = (event) => {
    // Do not bubble clicks to pageCover
    event.stopPropagation();
  };

  const result = options?.testFunction?.call(null);
  if (result ?? false) {
    return;
  }
  setShadeOpacity(0.6);
  backdrop.style.display = "flex";
  backdrop.classList.add("show");
  setTimeout(() => {
    currentDialog = target;
    backdrop.appendChild(target);
    target.classList.remove("hidden");
  }, 100);
}

export function hideDialog(): void {
  if (backdrop === null || currentDialog === null) {
    return;
  }

  setShadeOpacity(0);

  backdrop.classList.remove("show");
  if (currentDialog !== null) {
    currentDialog.classList.add("hidden");
    backdrop.removeChild(currentDialog);
    dialogsContainer?.appendChild(currentDialog);
    currentDialog = null;
  }

  setTimeout(() => {
    backdrop.style.display = "none";
  }, 400);
}
