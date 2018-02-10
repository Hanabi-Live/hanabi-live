module.exports = class Card {
    constructor(config) {
        this.suit = config.suit;
        this.rank = config.rank;
        this.order = config.order;
        this.possibleSuits = config.possibleSuits;
        this.possibleRanks = config.possibleRanks;
        this.holder = config.holder;
    }
};

/*

// From: http://proclive.io/pixi-js-drag-drop/

var drag = false;
createDragAndDropFor(container)

function createDragAndDropFor(target){
  target.interactive = true;
  target.on("mousedown", function(e){
    drag = target;
  })
  target.on("mouseup", function(e){
    drag = false;
  })
  target.on("mousemove", function(e){
    if(drag){
      drag.position.x += e.data.originalEvent.movementX;
      drag.position.y += e.data.originalEvent.movementY;
    }
  })
}

*/
