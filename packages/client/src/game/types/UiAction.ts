import type { UiCard } from "./UiCard.ts";

export type UiAction = ActionDragStart | ActionDragReset;

interface ActionDragStart {
  type: "dragStart";
  card: UiCard;
}

interface ActionDragReset {
  type: "dragReset";
}
