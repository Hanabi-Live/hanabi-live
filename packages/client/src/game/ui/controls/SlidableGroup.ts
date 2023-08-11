import Konva from "konva";

export class SlidableGroup extends Konva.Group {
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  setLeft: (this: SlidableGroup) => void = () => {};

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  setCenter: (this: SlidableGroup) => void = () => {};
}
