import { CARD_H, CARD_W } from "./constants";

export function initCanvas(): [
  cvs: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
] {
  const cvs = document.createElement("canvas");
  cvs.width = CARD_W;
  cvs.height = CARD_H;

  const ctx = cvs.getContext("2d");
  if (ctx === null) {
    throw new Error("Failed to get the context for a new canvas element.");
  }

  const namedTuple: [cvs: HTMLCanvasElement, ctx: CanvasRenderingContext2D] = [
    cvs,
    ctx,
  ];
  return namedTuple;
}

export function cloneCanvas(
  oldCvs: HTMLCanvasElement,
  _oldCtx: CanvasRenderingContext2D,
): HTMLCanvasElement {
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

export function saveCanvas(
  cvs: HTMLCanvasElement,
  _ctx: CanvasRenderingContext2D,
): HTMLCanvasElement {
  return cvs;
}
