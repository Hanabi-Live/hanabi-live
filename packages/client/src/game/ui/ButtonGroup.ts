import Konva from "konva";
import ColorButton from "./ColorButton";
import PlayerButton from "./controls/PlayerButton";
import RankButton from "./RankButton";

type ClueButton = PlayerButton | ColorButton | RankButton;

export default class ButtonGroup extends Konva.Group {
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

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < self.list.length; i++) {
          if (self.list[i] !== this && self.list[i]!.pressed) {
            self.list[i]!.setPressed(false);
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
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i]!.pressed) {
        this.list[i]!.setPressed(false);
      }
    }
  }

  /** This is only used for groups of "PlayerButton". */
  selectNextTarget(): void {
    let buttonIndex: number | undefined;
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i]!.pressed) {
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
    let button: PlayerButton | undefined;
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.list.length; i++) {
      buttonIndex++;
      if (buttonIndex > this.list.length - 1) {
        buttonIndex = 0;
      }

      button = this.list[buttonIndex] as PlayerButton;
      if (button.enabled) {
        break;
      }
    }

    if (button !== undefined) {
      button.dispatchEvent(new MouseEvent("click"));
    }
  }
}
