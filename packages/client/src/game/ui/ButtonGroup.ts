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
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias

    this.list.push(button);

    (button as Konva.Node).on(
      "click tap",
      function buttonClick(this: Konva.Node) {
        (this as ClueButton).setPressed(true);

        for (const clueButton of self.list) {
          if (clueButton !== this && clueButton.pressed) {
            clueButton.setPressed(false);
          }
        }

        self.fire("change", null);
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

    // Find the next button in the group. As a guard against an infinite loop, only loop as many
    // times as needed to go through every button.
    let nextButton: ClueButton | undefined;
    for (const clueButton of this.list) {
      buttonIndex++;
      if (buttonIndex > this.list.length - 1) {
        buttonIndex = 0;
      }

      nextButton = clueButton;
      if ("enabled" in nextButton && nextButton.enabled) {
        break;
      }
    }

    if (nextButton !== undefined) {
      nextButton.dispatchEvent(new MouseEvent("click"));
    }
  }
}
