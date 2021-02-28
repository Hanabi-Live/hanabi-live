import { CARD_H, CARD_W } from "./constants";

export function initCanvas(): HTMLCanvasElement {
  const cvs = document.createElement("canvas");
  cvs.width = CARD_W;
  cvs.height = CARD_H;

  return cvs;
}

export function cloneCanvas(oldCvs: HTMLCanvasElement): HTMLCanvasElement {
  const newCvs = document.createElement("canvas");
  newCvs.width = oldCvs.width;
  newCvs.height = oldCvs.height;
  const ctx = newCvs.getContext("2d");
  if (ctx === null) {
    throw new Error("Failed to get the context for a new canvas element.");
  }
  ctx.drawImage(oldCvs, 0, 0);

  return newCvs;
}
