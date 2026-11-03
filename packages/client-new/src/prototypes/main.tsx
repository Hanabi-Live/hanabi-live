import { createRoot } from "react-dom/client";
import { Gallery } from "./Gallery";
import "./prototypes.css";

const root = document.querySelector("#root");
if (!root) {
  throw new Error("Missing prototype root.");
}
createRoot(root).render(<Gallery />);
