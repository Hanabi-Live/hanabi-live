import Konva from 'konva';
import * as KonvaBaseLayer from 'konva/types/BaseLayer';

export default function drawLayer(node: Konva.Node) {
  const layer = node.getLayer() as KonvaBaseLayer.BaseLayer | null;
  if (layer) {
    layer.batchDraw();
  }
}
