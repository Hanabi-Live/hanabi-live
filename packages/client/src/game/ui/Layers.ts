import Konva from "konva";

// We do not want to add too many layers; the Konva documentation states that 3-5 is max:
// https://konvajs.org/docs/performance/Layer_Management.html

// The layers listen so that their interactive elements can receive events. Elements that do not
// handle events set "listening: false", which keeps them out of hit detection:
// https://konvajs.org/docs/performance/Listening_False.html
export class Layers {
  UI: Konva.Layer = new Konva.Layer();
  // The timer gets its own layer since it is being constantly updated.
  timer: Konva.Layer = new Konva.Layer();
  card: Konva.Layer = new Konva.Layer();
  arrow: Konva.Layer = new Konva.Layer();
  // We need some UI elements to be on top of cards.
  UI2: Konva.Layer = new Konva.Layer();
}
