import { assertDefined } from "complete-common";

type ProgressCallback = (numLoaded: number, size: number) => void;
type FinishedCallback = () => void;
type FailedCallback = (filePath: string) => void;

// The list of all game-related images to preload. All of these files should have a ".png"
// extension.
const FILE_IDS = [
  "checkbox-on",
  "checkbox-off",
  "checkbox-on-disabled",
  "checkbox-off-disabled",
  "crown",
  "critical",
  "dda",
  "exclamation-mark",
  "eyes",
  "home",
  "note",
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
  progressCallback: ProgressCallback | null = null;
  finishedCallback: FinishedCallback | null = null;
  failedCallback: FailedCallback | null = null;

  get failed(): boolean {
    return this.failedFiles.size > 0;
  }

  constructor() {
    // Build a map of image identifiers to URL paths.
    for (const fileID of FILE_IDS) {
      this.filePathMap.set(fileID, `/public/img/${fileID}.png`);
    }

    // Add files to the map that do not have a ".png" extension.
    this.filePathMap.set("background", "/public/img/background.jpg");

    this.start();
  }

  start(): void {
    for (const [fileID, filePath] of this.filePathMap) {
      this.loadImage(fileID, filePath);
    }

    this.progress();
  }

  private loadImage(fileID: string, filePath: string, retryCount = 0): void {
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
      if (retryCount < 2) {
        // Retry transient transport failures without counting the image as loaded.
        setTimeout(
          () => {
            this.loadImage(fileID, filePath, retryCount + 1);
          },
          1000 * 2 ** retryCount,
        );
        return;
      }

      this.failedFiles.add(filePath);
      this.failedCallback?.(filePath);
    });
    this.imageMap.set(fileID, img);
    img.src = filePath;
  }

  progress(): void {
    if (this.progressCallback !== null) {
      this.progressCallback(this.numLoaded, this.filePathMap.size);
    }
  }

  get(name: string): HTMLImageElement {
    const element = this.imageMap.get(name);
    assertDefined(element, `The image of ${name} was not found in the loader.`);
    return element;
  }
}
