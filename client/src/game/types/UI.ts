import UICard from "./UICard";

export type UIAction = ActionDragStart | ActionDragReset;

interface ActionDragStart {
  type: "dragStart";
  card: UICard;
}

interface ActionDragReset {
  type: "dragReset";
}
