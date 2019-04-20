class Loader {
    constructor(finishedCallback) {
        this.finishedCallback = finishedCallback;

        const files = [
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
            'x',
        ];
        this.filemap = {};
        for (const file of files) {
            this.filemap[file] = `/public/img/${file}.png`;
        }

        this.filemap.background = '/public/img/background.jpg';
    }

    addImage(name, ext) {
        this.filemap[name] = `/public/img/${name}.${ext}`;
    }

    addAlias(name, alias, ext) {
        this.filemap[name] = `/public/img/${alias}.${ext}`;
    }

    start() {
        const total = Object.keys(this.filemap).length;

        this.map = {};
        this.numLoaded = 0;

        for (const name of Object.keys(this.filemap)) {
            const img = new Image();

            this.map[name] = img;

            img.onload = () => {
                this.numLoaded += 1;

                this.progress(this.numLoaded, total);

                if (this.numLoaded === total) {
                    this.finishedCallback();
                }
            };

            img.src = this.filemap[name];
        }

        this.progress(0, total);
    }

    progress(done, total) {
        if (this.progressCallback) {
            this.progressCallback(done, total);
        }
    }

    get(name) {
        return this.map[name];
    }
}

module.exports = Loader;
