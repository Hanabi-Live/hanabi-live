export default class Loader {
    filePathMap: Map<string, string> = new Map();
    numLoaded: number = 0;
    imageMap: Map<string, HTMLImageElement> = new Map();
    progressCallback: any = null;
    finishedCallback: any = null;

    constructor(progressCallback: any, finishedCallback: any) {
        this.progressCallback = progressCallback;
        this.finishedCallback = finishedCallback;

        const fileIDs = [
            'crown',
            'eyes',
            'home',
            'note',
            'replay',
            'replay-disabled',
            'replay-back',
            'replay-back-disabled',
            'replay-back-full',
            'replay-back-full-disabled',
            'replay-forward',
            'replay-forward-disabled',
            'replay-forward-full',
            'replay-forward-full-disabled',
            'skull',
            'sparkle',
            'trashcan',
            'trashcan2',
            'x',
            'wrench',
        ];
        for (const fileID of fileIDs) {
            this.filePathMap.set(fileID, `/public/img/${fileID}.png`);
        }
        this.filePathMap.set('background', '/public/img/background.jpg');
    }

    start() {
        for (const [fileID, filePath] of this.filePathMap) {
            const img = new Image();
            img.onload = () => {
                this.numLoaded += 1;

                this.progress();

                if (this.numLoaded === this.filePathMap.size) {
                    this.finishedCallback();
                }
            };
            img.src = filePath;

            this.imageMap.set(fileID, img);
        }

        this.progress();
    }

    progress() {
        if (this.progressCallback) {
            this.progressCallback(this.numLoaded, this.filePathMap.size);
        }
    }

    get(name: string) {
        return this.imageMap.get(name);
    }
}
