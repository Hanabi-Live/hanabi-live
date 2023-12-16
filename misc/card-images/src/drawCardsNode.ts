import jsdom from "jsdom";
import { CARD_H, CARD_W } from "../src/game/ui/constants";
import Canvas2svg from "./canvas2svg_node";

export function initCanvas(): {
  cvs: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const { document } = new jsdom.JSDOM("").window;
  const cvs = document.createElement("canvas");
  cvs.width = CARD_W;
  cvs.height = CARD_H;

  const ctx = new Canvas2svg({
    document,
    width: CARD_W,
    height: CARD_H,
  }) as unknown as CanvasRenderingContext2D;

  return {
    cvs,
    ctx,
  };
}

export function cloneCanvas(
  oldCvs: HTMLCanvasElement,
  oldCtx: CanvasRenderingContext2D,
): HTMLCanvasElement {
  // The next line prevents TypeScript errors.
  // eslint-disable-next-line
  if (oldCvs) {
  }

  return (oldCtx as any).getSerializedSvg(); // eslint-disable-line
}

export function saveCanvas(
  cvs: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): HTMLCanvasElement {
  // The next line prevents TypeScript errors.
  // eslint-disable-next-line
  if (cvs) {
  }

  return (ctx as any).getSerializedSvg(); // eslint-disable-line
}
