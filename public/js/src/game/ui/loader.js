const Loader = function Loader(cb) {
    this.cb = cb;

    this.filemap = {};

    const basic = [
        'x',
        'replay',
        'replay-back',
        'replay-back-full',
        'replay-forward',
        'replay-forward-full',
        'trashcan',
    ];

    for (let i = 0; i < basic.length; i++) {
        this.filemap[basic[i]] = `public/img/${basic[i]}.png`;
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
    const self = this;

    const total = Object.keys(self.filemap).length;

    this.map = {};
    this.numLoaded = 0;

    for (const name of Object.keys(this.filemap)) {
        const img = new Image();

        this.map[name] = img;

        img.onload = () => {
            self.numLoaded += 1;

            self.progress(self.numLoaded, total);

            if (self.numLoaded === total) {
                self.cb();
            }
        };

        img.src = self.filemap[name];
    }

    self.progress(0, total);
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
