import Konva from "konva";
import { FitText } from "./controls/FitText";
import { globals } from "./globals";

export class MultiFitText extends Konva.Group {
  maxLines: number;
  smallHistory: string[] = [];

  constructor(config: Konva.ContainerConfig, maxLines: number) {
    super(config);

    if (config.height === undefined) {
      throw new Error(
        'The "height" property is not defined on a new MultiFitText.',
      );
    }

    this.maxLines = maxLines;

    for (let i = 0; i < this.maxLines; i++) {
      const newConfig = $.extend({}, config);

      newConfig.listening = false;
      newConfig.height = config.height / this.maxLines;
      newConfig.x = 0;
      newConfig.y = i * newConfig.height;

      const childText = new FitText(newConfig);
      this.add(childText);
    }
  }

  setMultiText(text: string): void {
    if (this.smallHistory.length >= this.maxLines) {
      this.smallHistory.shift();
    }
    this.smallHistory.push(text);

    // Performance optimization: setText on the children is slow, so do not actually do it until its
    // time to display things. We also have to call refreshText after any time we manipulate replay
    // position.
    if (!globals.state.replay.active || !globals.animateFast) {
      this.refreshText();
    }
  }

  refreshText(): void {
    for (let i = 0; i < this.children.length; i++) {
      let msg = this.smallHistory[i];
      if (msg === undefined) {
        msg = "";
      }
      (this.children[i] as FitText).fitText(msg);
    }
  }

  reset(): void {
    this.smallHistory = [];
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      (child as FitText).fitText("");
    }
  }

  isEmpty(): boolean {
    return this.smallHistory.length === 0;
  }
}
