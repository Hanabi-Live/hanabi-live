const Loader = function Loader(finishedCallback) {
    this.finishedCallback = finishedCallback;

    const files = [
        'home',
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
        'trashcan',
        'x',
    ];
    this.filemap = {};
    for (const file of files) {
        this.filemap[file] = `public/img/${file}.png`;
    }

    this.filemap.background = 'public/img/background.jpg';
};

Loader.prototype.addImage = function addImage(name, ext) {
    this.filemap[name] = `public/img/${name}.${ext}`;
};

Loader.prototype.addAlias = function addAlias(name, alias, ext) {
    this.filemap[name] = `public/img/${alias}.${ext}`;
};

Loader.prototype.start = function start() {
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
};

Loader.prototype.progress = function progress(done, total) {
    if (this.progressCallback) {
        this.progressCallback(done, total);
    }
};

Loader.prototype.get = function get(name) {
    return this.map[name];
};

module.exports = Loader;
