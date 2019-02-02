const LayoutChild = function LayoutChild(config) {
    Kinetic.Group.call(this, config);

    this.tween = null;
};

Kinetic.Util.extend(LayoutChild, Kinetic.Group);

LayoutChild.prototype.add = function add(child) {
    const self = this;

    Kinetic.Group.prototype.add.call(this, child);
    this.setWidth(child.getWidth());
    this.setHeight(child.getHeight());

    child.on('widthChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        self.setWidth(event.newVal);
        if (self.parent) {
            self.parent.doLayout();
        }
    });

    child.on('heightChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        self.setHeight(event.newVal);
        if (self.parent) {
            self.parent.doLayout();
        }
    });
};

module.exports = LayoutChild;
