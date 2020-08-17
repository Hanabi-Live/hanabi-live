import Konva from 'konva';

const defaultLayerSettings = {
  // Disable "listening" for every layer/element by default to increase performance
  // https://konvajs.org/docs/performance/Listening_False.html
  // This means that we have to explicitly set "listening: true" for every element that
  // we want to bind events to (for clicking, dragging, hovering, etc.)
  listening: false,
};

// We don't want to add too many layers; the Konva documentation states that 3-5 is max:
// https://konvajs.org/docs/performance/Layer_Management.html
export default class Layers {
  UI: Konva.Layer = new Konva.Layer(defaultLayerSettings);
  // The timer gets its own layer since it is being constantly updated
  timer: Konva.Layer = new Konva.Layer(defaultLayerSettings);
  card: Konva.Layer = new Konva.Layer(defaultLayerSettings);
  arrow: Konva.Layer = new Konva.Layer(defaultLayerSettings);
  // We need some UI elements to be on top of cards
  UI2: Konva.Layer = new Konva.Layer(defaultLayerSettings);
}
