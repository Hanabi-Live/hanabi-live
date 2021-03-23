import UICard from "./UICard";

export type UIAction = ActionDragStart | ActionDragReset;

export interface ActionDragStart {
  type: "dragStart";
  card: UICard;
}

export interface ActionDragReset {
  type: "dragReset";
}
