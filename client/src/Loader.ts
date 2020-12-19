type ProgressCallback = (numLoaded: number, size: number) => void;
type FinishedCallback = () => void;

// The list of all game-related images to preload
// All of these files should have a ".png" extension
const fileIDs = [
  "checkbox-on",
  "checkbox-off",
  "checkbox-on-disabled",
  "checkbox-off-disabled",
  "crown",
  "critical",
  "eyes",
  "home",
  "note",
  "question-mark",
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
  "trashcan",
  "trashcan2",
  "x",
  "wrench",
];

export default class Loader {
  filePathMap: Map<string, string> = new Map<string, string>();
  numLoaded = 0;
  finished = false;
  imageMap: Map<string, HTMLImageElement> = new Map<string, HTMLImageElement>();
  progressCallback: ProgressCallback | null = null;
  finishedCallback: FinishedCallback | null = null;

  constructor() {
    // Build a map of image identifiers to URL paths
    for (const fileID of fileIDs) {
      this.filePathMap.set(fileID, `/public/img/${fileID}.png`);
    }
    // This is the only file with a non ".png" extension
    this.filePathMap.set("background", "/public/img/background.jpg");

    this.start();
  }

  start(): void {
    for (const [fileID, filePath] of this.filePathMap) {
      const img = new Image();
      img.onload = () => {
        this.numLoaded += 1;
        this.progress();
        if (this.numLoaded === this.filePathMap.size) {
          this.finished = true;
          if (this.finishedCallback) {
            this.finishedCallback();
          }
        }
      };
      img.src = filePath;

      this.imageMap.set(fileID, img);
    }

    this.progress();
  }

  progress(): void {
    if (this.progressCallback) {
      this.progressCallback(this.numLoaded, this.filePathMap.size);
    }
  }

  get(name: string): HTMLImageElement {
    const element = this.imageMap.get(name);
    if (element === undefined) {
      throw new Error(`The image of ${name} was not found in the loader.`);
    }
    return element;
  }
}
