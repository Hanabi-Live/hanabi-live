import Konva from 'konva';
import * as KonvaBaseLayer from 'konva/types/BaseLayer';
import globals from './globals';

export function drawLayer(node: Konva.Node) {
  const layer = node.getLayer() as KonvaBaseLayer.BaseLayer | null;
  if (layer) {
    layer.batchDraw();
  }
}

interface CanTween {
  tween: Konva.Tween | null;
}

interface TweenConfig {
  duration?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  easing?: (t: any, b: any, c: any, d: any) => any;
  onFinish?: () => void;
}

export function animate(
  node: Konva.Node & CanTween,
  params: TweenConfig,
  fast: boolean = globals.animateFast,
  interactive: boolean = false,
) {
  if (node.tween) {
    node.tween.destroy();
    node.tween = null;
  }
  if (fast) {
    if (params.x !== undefined) {
      node.x(params.x);
    }
    if (params.y !== undefined) {
      node.y(params.y);
    }
    if (params.scale !== undefined) {
      node.scaleX(params.scale);
      node.scaleY(params.scale);
    }
    if (params.rotation !== undefined) {
      node.rotation(params.rotation);
    }
    if (params.opacity !== undefined) {
      node.opacity(params.opacity);
    }
    if (params.onFinish !== undefined) {
      params.onFinish();
    }
  } else {
    const wasListening = node.listening();
    const config: any = {
      node,
      onFinish: () => {
        if (node && node.tween) {
          node.tween.destroy();
          node.tween = null;
        }
        if (params.onFinish !== undefined) {
          params.onFinish();
        }
        if (!interactive && node) {
          node.listening(wasListening);
        }
      },
    };
    // The Konva object is weakly typed, and expects the keys to
    // be there or not if there's a desire to change the value.
    // Therefore, disable the linter rule for this block
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    if (params.duration !== undefined) {
      config.duration = params.duration;
    }
    if (params.x !== undefined) {
      config.x = params.x;
    }
    if (params.y !== undefined) {
      config.y = params.y;
    }
    if (params.scale !== undefined) {
      config.scaleX = params.scale;
      config.scaleY = params.scale;
    }
    if (params.rotation !== undefined) {
      config.rotation = params.rotation;
    }
    if (params.opacity !== undefined) {
      config.opacity = params.opacity;
    }
    if (params.easing !== undefined) {
      config.easing = params.easing;
    }
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    if (!interactive) {
      node.listening(false);
    }
    node.tween = new Konva.Tween(config).play();
  }
}
