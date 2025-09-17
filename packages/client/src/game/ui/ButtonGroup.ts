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

  getPressedIndex(): number | null {
    for (const [i, button] of this.list.entries()) {
      if (button.pressed) {
        return i;
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
    const buttonIndex = this.getPressedIndex() ?? -1;

    // Find the next enabled button in the group.
    const total = this.list.length;
    let nextButton: ClueButton | undefined;

    for (let i = 1; i <= total; i++) {
      const candidateIndex = (buttonIndex + i) % total;
      const candidateButton = this.list[candidateIndex];

      if (
        candidateButton !== undefined &&
        "enabled" in candidateButton &&
        candidateButton.enabled
      ) {
        nextButton = candidateButton;
        break;
      }
    }

    if (nextButton !== undefined) {
      nextButton.dispatchEvent(new MouseEvent("click"));
    }
  }
}
