// Keldon had commented out code for reordering a hand, which might be useful in the future

/*
if (note.who == ui.player_us) {
    child.draggable(true);

    child.on("dragend.reorder", function() {
        var pos = this.absolutePosition();

        pos.x += this.width() * this.scaleX() / 2;
        pos.y += this.height() * this.scaleY() / 2;

        var area = player_hands[ui.player_us];

        if (globals.elements.playArea.isOver()) {
            var i, x;

            while (1) {
                i = this.index;
                x = this.x();

                if (i == 0) break;

                if (x > this.parent.children[i - 1].x()) {
                    this.moveDown();
                } else {
                    break;
                }
            }

            while (1) {
                i = this.index;
                x = this.x();

                if (i == this.parent.children.length - 1) break;

                if (x < this.parent.children[i + 1].x()) {
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
