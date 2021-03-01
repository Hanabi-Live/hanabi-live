interface Settings {
  document: any;
  width: number;
  height: number;
}

export = ctx;
declare class ctx {
  public constructor(s: Settings);
  private __createElement;
  private __setDefaultStyles;
  private __applyStyleState;
  private __getStyleState;
  private __applyStyleToCurrentElement;
  private __closestGroupOrSvg;
  getSerializedSvg(fixNamedEntities: any): any;
  getSvg(): any;
  save(): void;
  __currentElement: any;
  restore(): void;
  __currentElementsToStyle: {
    element: any;
    children: any[];
  };

  private __addTransform;
  scale(x: any, y: any): void;
  rotate(angle: any): void;
  translate(x: any, y: any): void;
  transform(a: any, b: any, c: any, d: any, e: any, f: any): void;
  beginPath(): void;
  __currentDefaultPath: string;
  __currentPosition:
    | {
        x?: undefined;
        y?: undefined;
      }
    | {
        x: any;
        y: any;
      };

  private __applyCurrentDefaultPath;
  private __addPathCommand;
  moveTo(x: any, y: any): void;
  closePath(): void;
  lineTo(x: any, y: any): void;
  bezierCurveTo(
    cp1x: any,
    cp1y: any,
    cp2x: any,
    cp2y: any,
    x: any,
    y: any,
  ): void;
  quadraticCurveTo(cpx: any, cpy: any, x: any, y: any): void;
  arcTo(x1: any, y1: any, x2: any, y2: any, radius: any): void;
  stroke(): void;
  fill(): void;
  rect(x: any, y: any, width: any, height: any): void;
  fillRect(x: any, y: any, width: any, height: any): void;
  strokeRect(x: any, y: any, width: any, height: any): void;
  __clearCanvas(): void;
  __groupStack: any[];
  clearRect(x: any, y: any, width: any, height: any): void;
  createLinearGradient(x1: any, y1: any, x2: any, y2: any): any;
  createRadialGradient(
    x0: any,
    y0: any,
    r0: any,
    x1: any,
    y1: any,
    r1: any,
  ): any;
  private __parseFont;
  private __wrapTextLink;
  private __applyText;
  fillText(text: any, x: any, y: any): void;
  strokeText(text: any, x: any, y: any): void;
  measureText(text: any): TextMetrics;
  arc(
    x: any,
    y: any,
    radius: any,
    startAngle: any,
    endAngle: any,
    counterClockwise: any,
  ): void;
  clip(): void;
  drawImage(...args: any[]): void;
  drawImageSvg(...args: any[]): void;
  createPattern(image: any, repetition: any): any;
  setLineDash(dashArray: any): void;
  lineDash: any;
  __applyFilter(): void;
  drawFocusRing(): void;
  createImageData(): void;
  getImageData(): void;
  putImageData(): void;
  globalCompositeOperation(): void;
  setTransform(): void;
}
