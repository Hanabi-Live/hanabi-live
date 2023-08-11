import { Button } from "./Button";

export class SharedTurnsButton extends Button {
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  setLeft: (this: SharedTurnsButton) => void = () => {};

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  setCenter: (this: SharedTurnsButton) => void = () => {};
}
