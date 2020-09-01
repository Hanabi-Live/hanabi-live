import Konva from 'konva';
import * as KonvaBaseLayer from 'konva/types/BaseLayer';
import globals from './globals';

export const drawLayer = (node: Konva.Node) => {
  const layer = node.getLayer() as KonvaBaseLayer.BaseLayer | null;
  if (layer) {
    layer.batchDraw();
  }
};

interface CanTween {
  tween: Konva.Tween | null;
}

interface TweenConfig {
  duration?: number;
  x?: number;
  y?: number;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  easing?: (t: any, b: any, c: any, d: any) => any;
  onFinish?: () => void;
}

export const animate = (
  node: Konva.Node & CanTween,
  params: TweenConfig,
  interactive: boolean = false,
  fast: boolean = globals.animateFast,
  // overrideDisableListening: boolean = false,
) => {
  // Before animating, ensure that the node is visible
  // (since some elements might be previously hidden)
  node.show();

  if (node.tween !== null) {
    node.tween.destroy();
    node.tween = null;
  }

  if (fast || params.duration === 0) {
    if (params.x !== undefined) {
      node.x(params.x);
    }
    if (params.y !== undefined) {
      node.y(params.y);
    }
    if (params.offsetX !== undefined) {
      node.offsetX(params.offsetX);
    }
    if (params.offsetY !== undefined) {
      node.offsetY(params.offsetY);
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

    // If interactive is true, the node should be listening in its default state
    // Ensure that the node is listening
    // (it might have had the listening disabled when it started to play an animation but never
    // ended up finishing the animation)
    if (interactive) {
      node.listening(true);
    }
  } else {
    const config: any = {
      node,
      onFinish: () => {
        // If the game is restarted in the middle of an animation,
        // it is possible to get here with something important being undefined
        if (node === undefined || globals.store === null || globals.state === undefined) {
          return;
        }

        if (node.tween !== null) {
          node.tween.destroy();
          node.tween = null;
        }

        // Now that the animation is finished, we can re-enable listening (see below explanation)
        if (interactive) {
          node.listening(true);
        }

        if (params.onFinish !== undefined) {
          params.onFinish();
        }
      },
    };

    // The Konva object is weakly typed, and expects the keys to
    // be there or not if there is a desire to change the value
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
    if (params.offsetX !== undefined) {
      config.offsetX = params.offsetX;
    }
    if (params.offsetY !== undefined) {
      config.offsetY = params.offsetY;
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

    // Temporarily disable listening on this element while it is animating
    // (for performance reasons and to prevent players from accidentally clicking on it)
    if (interactive) {
      node.listening(false);
    }

    node.tween = new Konva.Tween(config).play();
  }
};
