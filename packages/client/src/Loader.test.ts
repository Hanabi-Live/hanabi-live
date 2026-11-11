import type { Clock } from "@sinonjs/fake-timers";
import { install } from "@sinonjs/fake-timers";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Loader } from "./Loader.ts";

let clock: Clock;

class FakeImage {
  readonly listeners = new Map<string, () => void>();
  src = "";

  addEventListener(event: string, listener: () => void): void {
    this.listeners.set(event, listener);
  }

  emit(event: string): void {
    this.listeners.get(event)?.();
  }
}

const originalImage = globalThis.Image;

function getImage(loader: Loader, fileId: string): FakeImage {
  return loader.imageMap.get(fileId) as unknown as FakeImage;
}

describe("image loader", () => {
  beforeEach(() => {
    clock = install({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    globalThis.Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    clock.uninstall();
    globalThis.Image = originalImage;
  });

  test("finishes after all images load successfully", () => {
    const loader = new Loader();
    const onFinished = vi.fn();
    loader.finishedCallback = () => {
      onFinished();
    };

    for (const image of loader.imageMap.values()) {
      (image as unknown as FakeImage).emit("load");
    }

    expect(loader.numLoaded).toBe(loader.filePathMap.size);
    expect(loader.finished).toBe(true);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  test("retries a transient image error without counting it as loaded", () => {
    const loader = new Loader();
    const fileId = "crown";
    const firstImage = getImage(loader, fileId);
    const onFinished = vi.fn();
    loader.finishedCallback = () => {
      onFinished();
    };

    firstImage.emit("error");
    expect(loader.numLoaded).toBe(0);
    expect(loader.finished).toBe(false);

    clock.tick(1000);
    const retriedImage = getImage(loader, fileId);
    expect(retriedImage).not.toBe(firstImage);
    retriedImage.emit("load");

    for (const [id] of loader.filePathMap) {
      if (id !== fileId) {
        getImage(loader, id).emit("load");
      }
    }

    expect(loader.numLoaded).toBe(loader.filePathMap.size);
    expect(loader.finished).toBe(true);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  test("reports a permanent error after bounded retries", () => {
    const loader = new Loader();
    const fileId = "crown";
    const onFailed = vi.fn();
    const onFinished = vi.fn();
    loader.failedCallback = (filePath) => {
      onFailed(filePath);
    };
    loader.finishedCallback = () => {
      onFinished();
    };

    getImage(loader, fileId).emit("error");
    clock.tick(1000);
    getImage(loader, fileId).emit("error");
    clock.tick(2000);
    getImage(loader, fileId).emit("error");

    expect(loader.failed).toBe(true);
    expect(loader.numLoaded).toBe(0);
    expect(loader.finished).toBe(false);
    expect(onFailed).toHaveBeenCalledWith("/public/img/crown.png");
    expect(onFinished).not.toHaveBeenCalled();
    expect(clock.countTimers()).toBe(0);
  });

  test("reports current progress when a callback is attached late", () => {
    const loader = new Loader();
    getImage(loader, "crown").emit("load");

    const onProgress = vi.fn();
    loader.progressCallback = (numLoaded, size) => {
      onProgress(numLoaded, size);
    };
    loader.progress();

    expect(onProgress).toHaveBeenCalledWith(1, loader.filePathMap.size);
  });
});
