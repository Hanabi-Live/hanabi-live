import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { Loader } from "./Loader";

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

function getImage(loader: Loader, fileID: string): FakeImage {
  return loader.imageMap.get(fileID) as unknown as FakeImage;
}

describe("image loader", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    globalThis.Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.Image = originalImage;
  });

  test("finishes after all images load successfully", () => {
    const loader = new Loader();
    const onFinished = jest.fn();
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
    const fileID = "crown";
    const firstImage = getImage(loader, fileID);
    const onFinished = jest.fn();
    loader.finishedCallback = () => {
      onFinished();
    };

    firstImage.emit("error");
    expect(loader.numLoaded).toBe(0);
    expect(loader.finished).toBe(false);

    jest.advanceTimersByTime(1000);
    const retriedImage = getImage(loader, fileID);
    expect(retriedImage).not.toBe(firstImage);
    retriedImage.emit("load");

    for (const [id] of loader.filePathMap) {
      if (id !== fileID) {
        getImage(loader, id).emit("load");
      }
    }

    expect(loader.numLoaded).toBe(loader.filePathMap.size);
    expect(loader.finished).toBe(true);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  test("reports a permanent error after bounded retries", () => {
    const loader = new Loader();
    const fileID = "crown";
    const onFailed = jest.fn();
    const onFinished = jest.fn();
    loader.failedCallback = (filePath) => {
      onFailed(filePath);
    };
    loader.finishedCallback = () => {
      onFinished();
    };

    getImage(loader, fileID).emit("error");
    jest.advanceTimersByTime(1000);
    getImage(loader, fileID).emit("error");
    jest.advanceTimersByTime(2000);
    getImage(loader, fileID).emit("error");

    expect(loader.failed).toBe(true);
    expect(loader.numLoaded).toBe(0);
    expect(loader.finished).toBe(false);
    expect(onFailed).toHaveBeenCalledWith("/public/img/crown.png");
    expect(onFinished).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("reports current progress when a callback is attached late", () => {
    const loader = new Loader();
    getImage(loader, "crown").emit("load");

    const onProgress = jest.fn();
    loader.progressCallback = (numLoaded, size) => {
      onProgress(numLoaded, size);
    };
    loader.progress();

    expect(onProgress).toHaveBeenCalledWith(1, loader.filePathMap.size);
  });
});
