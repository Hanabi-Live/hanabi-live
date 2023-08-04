import Konva from "konva";
import { LABEL_COLOR } from "../constants";
import { FitText } from "./FitText";

export class TimerDisplay extends Konva.Group {
  timerText: FitText;
  labelText: FitText;
  private readonly _oval: Konva.Rect;

  tooltipName = "";
  tooltipContent = "";

  get oval(): Konva.Rect {
    return this._oval;
  }

  constructor(config: Konva.ContainerConfig) {
    super(config);

    this._oval = new Konva.Rect({
      x: 0,
      y: 0,
      width: config.width,
      height: config.height,
      fill: "black",
      cornerRadius: config["cornerRadius"] as number | number[] | undefined,
      opacity: 0.2,
      listening: true,
    });
    this.add(this._oval);

    this.timerText = new FitText({
      x: 0,
      y: config["spaceH"] as number | undefined,
      width: config.width,
      height: config.height,
      fontSize: config["fontSize"] as number | undefined,
      fontFamily: "Verdana",
      align: "center",
      text: "??:??",
      fill: LABEL_COLOR,
      shadowColor: "black",
      shadowBlur: 10,
      shadowOffset: {
        x: 0,
        y: 0,
      },
      shadowOpacity: 0.9,
      listening: false,
    });
    this.add(this.timerText);

    this.labelText = new FitText({
      x: 0,
      y: 6 * config["spaceH"],
      width: config.width,
      height: config.height,
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      fontSize: (config["labelFontSize"] || config["fontSize"]) as
        | number
        | undefined,
      fontFamily: "Verdana",
      align: "center",
      text: config["label"] as string | undefined,
      fill: LABEL_COLOR,
      shadowColor: "black",
      shadowBlur: 10,
      shadowOffset: {
        x: 0,
        y: 0,
      },
      shadowOpacity: 0.9,
      listening: false,
    });
    this.add(this.labelText);
  }

  setTimerText(text: string): void {
    this.timerText.fitText(text);
  }

  setLabelText(text: string): void {
    this.labelText.fitText(text);
  }
}
