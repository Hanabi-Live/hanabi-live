import { SECOND_IN_MILLISECONDS, assertDefined } from "complete-common";

type ProgressCallback = (numLoaded: number, size: number) => void;
type FinishedCallback = () => void;
type FailedCallback = (filePath: string) => void;

/** How many times to retry an image that failed to load before giving up on it. */
const MAX_IMAGE_RETRIES = 2;

/** The delay before the first retry, which doubles with each retry after it. */
const IMAGE_RETRY_BASE_DELAY_MILLISECONDS = SECOND_IN_MILLISECONDS;

/**
 * The list of all game-related images to preload. All of these files should have a ".png"
 * extension.
 */
const FILE_IDS = [
  "crown",
  "critical",
  "dda",
  "exclamation-mark",
  "eyes",
  "flashlight",
  "ghost",
  "home",
  "note",
  "note-pencil",
  "question-mark",
  "question-mark2",
  "replay",
  "replay-back",
  "replay-back-border",
  "replay-back-disabled",
  "replay-back-full",
  "replay-back-full-disabled",
  "replay-forward",
  "replay-forward-border",
  "replay-forward-disabled",
  "replay-forward-full",
  "replay-forward-full-disabled",
  "skull",
  "skull_vtk",
  "trashcan",
  "trashcan2",
  "x",
  "wastebasket",
  "wrench",
] as const;

export class Loader {
  filePathMap = new Map<string, string>();
  numLoaded = 0;
  finished = false;
  failedFiles = new Set<string>();
  imageMap = new Map<string, HTMLImageElement>();
  progressCallback: ProgressCallback | undefined = undefined;
  finishedCallback: FinishedCallback | undefined = undefined;
  failedCallback: FailedCallback | undefined = undefined;

  constructor() {
    // Build a map of image identifiers to URL paths.
    for (const fileId of FILE_IDS) {
      this.filePathMap.set(fileId, `/public/img/${fileId}.png`);
    }

    // Add files to the map that do not have a ".png" extension.
    this.filePathMap.set("background", "/public/img/background.jpg");

    this.start();
  }

  private loadImage(fileId: string, filePath: string, retryCount = 0): void {
    const img = new Image();
    img.addEventListener("load", () => {
      this.numLoaded++;
      this.progress();
      if (this.numLoaded === this.filePathMap.size) {
        this.finished = true;
        this.finishedCallback?.();
      }
    });
    img.addEventListener("error", () => {
      if (retryCount < MAX_IMAGE_RETRIES) {
        // Retry transient transport failures without counting the image as loaded.
        setTimeout(
          () => {
            this.loadImage(fileId, filePath, retryCount + 1);
          },
          IMAGE_RETRY_BASE_DELAY_MILLISECONDS * 2 ** retryCount,
        );
        return;
      }

      this.failedFiles.add(filePath);
      this.failedCallback?.(filePath);
    });
    this.imageMap.set(fileId, img);
    img.src = filePath;
  }

  get failed(): boolean {
    return this.failedFiles.size > 0;
  }

  start(): void {
    for (const [fileId, filePath] of this.filePathMap) {
      this.loadImage(fileId, filePath);
    }

    this.progress();
  }

  progress(): void {
    if (this.progressCallback !== undefined) {
      this.progressCallback(this.numLoaded, this.filePathMap.size);
    }
  }

  get(name: string): HTMLImageElement {
    const element = this.imageMap.get(name);
    assertDefined(element, `The image of ${name} was not found in the loader.`);
    return element;
  }
}
