import type { UICard } from "./UICard.ts";

export type UIAction = ActionDragStart | ActionDragReset;

interface ActionDragStart {
  type: "dragStart";
  card: UICard;
}

interface ActionDragReset {
  type: "dragReset";
}
