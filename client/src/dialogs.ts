const backdrop = document.getElementById("page-cover");
const dialogsContainer = document.getElementById("modals-container");

let currentDialog: null | HTMLElement = null;

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
  if (backdrop === null) {
    return;
  }

  const source = <HTMLElement>document.getElementById(sourceId);
  const target = <HTMLElement>document.getElementById(targetId);

  if (source === null || target === null) {
    return;
  }

  target.classList.add("modal");
  target.onpointerdown = (event) => {
    // Do not bubble clicks to pageCover
    event.stopPropagation();
  };

  source.onpointerdown = () => {
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
  if (backdrop === null) {
    return;
  }

  const target = document.getElementById(targetId);

  if (target === null) {
    return;
  }

  target.classList.add("modal");
  target.onpointerdown = (event) => {
    // Do not bubble clicks to pageCover
    event.stopPropagation();
  };

  const result = options?.testFunction?.call(null);
  if (result ?? false) {
    return;
  }
  backdrop.style.display = "flex";
  backdrop.classList.add("show");
  setTimeout(() => {
    currentDialog = target;
    backdrop.appendChild(target);
    target.classList.remove("hidden");
  }, 100);
}
