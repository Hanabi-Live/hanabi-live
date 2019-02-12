// Keldon had commented out code for reordering a hand, which might be useful in the future

/*
if (note.who == ui.player_us) {
    child.setDraggable(true);

    child.on("dragend.reorder", function() {
        var pos = this.getAbsolutePosition();

        pos.x += this.getWidth() * this.getScaleX() / 2;
        pos.y += this.getHeight() * this.getScaleY() / 2;

        var area = player_hands[ui.player_us];

        if (globals.elements.playArea.isOver()) {
            var i, x;

            while (1) {
                i = this.index;
                x = this.getX();

                if (i == 0) break;

                if (x > this.parent.children[i - 1].getX()) {
                    this.moveDown();
                } else {
                    break;
                }
            }

            while (1) {
                i = this.index;
                x = this.getX();

                if (i == this.parent.children.length - 1) break;

                if (x < this.parent.children[i + 1].getX()) {
                    this.moveUp();
                } else {
                    break;
                }
            }
        }

        area.doLayout();
    });
}
*/
