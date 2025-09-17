import Konva from "konva";
import type { ColorButton } from "./ColorButton";
import type { RankButton } from "./RankButton";
import type { PlayerButton } from "./controls/PlayerButton";

type ClueButton = PlayerButton | ColorButton | RankButton;

export class ButtonGroup extends Konva.Group {
  list: ClueButton[] = [];

  constructor(config: Konva.ContainerConfig) {
    super(config);

    // Class variables
    this.list = [];
  }

  addList(button: ClueButton): void {
    const that = this; // eslint-disable-line @typescript-eslint/no-this-alias

    this.list.push(button);

    (button as Konva.Node).on(
      "click tap",
      function buttonClick(this: Konva.Node) {
        (this as ClueButton).setPressed(true);

        for (const clueButton of that.list) {
          if (clueButton !== this && clueButton.pressed) {
            clueButton.setPressed(false);
          }
        }

        that.fire("change", null);
      },
    );
  }

  getPressed(): ClueButton | null {
    for (const button of this.list) {
      if (button.pressed) {
        return button;
      }
    }

    return null;
  }

  clearPressed(): void {
    for (const clueButton of this.list) {
      clueButton.setPressed(false);
    }
  }

  /** This is only used for groups of "PlayerButton". */
  selectNextTarget(): void {
    let buttonIndex: number | undefined;
    for (const [i, clueButton] of this.list.entries()) {
      if (clueButton.pressed) {
        buttonIndex = i;
        break;
      }
    }

    // It is possible that no buttons are currently pressed.
    if (buttonIndex === undefined) {
      buttonIndex = -1;
    }

    // Find the next enabled button in the group.
    const total = this.list.length;
    let nextButton: ClueButton | undefined;

    for (let i = 1; i <= total; i++) {
      const candidateIndex = (buttonIndex + i) % total;
      const candidate = this.list[candidateIndex];

      if (candidate && "enabled" in candidate && candidate.enabled) {
        nextButton = candidate;
        break;
      }
    }

    if (nextButton) {
      nextButton.dispatchEvent(new MouseEvent("click"));
    }
  }
}
