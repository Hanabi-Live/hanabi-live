const PIXI = require('pixi.js');
const constants = require('../constants');
const globals = require('../globals');
const deck = require('./deck');
const Card = require('./card');

module.exports = (data) => {
    // If an action in the game happens, cancel any notes that are currently being edited
    if (globals.ui.editingNote !== null) {
        const evt = jQuery.Event('keydown');
        evt.key = 'Escape';
        $(`#tooltip-card-${globals.ui.editingNote}-input`).trigger(evt);
    }

    // Automatically disable any tooltips once an action in the game happens
    // TODO replace this will closeAllTooltips
    if (globals.ui.activeHover !== null) {
        globals.ui.activeHover.dispatchEvent(new MouseEvent('mouseout'));
        globals.ui.activeHover = null;
    }

    const { type } = data;
    if (type === 'draw') {
        /*
        if (!ui.learnedCards[data.order]) {
            ui.learnedCards[data.order] = {
                possibleSuits: this.variant.suits.slice(),
                possibleRanks: this.variant.ranks.slice(),
            };
        }
        */

        // Create the card and add it to the current game state
        const variant = constants.VARIANT_INTEGER_MAPPING[globals.init.variant];
        const suit = variant.suits[data.suit];
        const card = new Card({
            suit,
            rank: data.rank,
            order: data.order,
            possibleSuits: variant.suits.slice(),
            possibleRanks: variant.ranks.slice(),
            holder: data.who,
        });
        globals.ui.state.deck[data.order] = card;
        globals.ui.state.hands[data.who].push(card);

        // Draw the card on the board
        const cardTexture = PIXI.Texture.fromCanvas(globals.ui.cards[`Card-${suit.name}-${data.rank}`]);
        const cardSprite = new PIXI.Sprite(cardTexture);
        cardSprite.x = globals.ui.objects.deckArea.x;
        cardSprite.y = globals.ui.objects.deckArea.y;
        cardSprite.width = globals.ui.objects.deckArea.width;
        cardSprite.height = globals.ui.objects.deckArea.height;
        globals.app.stage.addChild(cardSprite);

        // Add the card to the CardLayout object for the respective player
        // (this will automatically tween)
        globals.ui.objects.hands[data.who].add(cardSprite);

        // TODO
        /*
        const pos = drawDeck.cardback.getAbsolutePosition();
        child.setAbsolutePosition(pos);
        child.setRotation(-playerHands[data.who].getRotation());

        const scale = drawDeck.cardback.getWidth() / CARDW;
        child.setScale({
            x: scale,
            y: scale,
        });

        playerHands[data.who].add(child);
        playerHands[data.who].moveToTop();
        */
    } else if (type === 'drawSize') {
        deck.setCount(data.size);
    } else if (type === 'played') {
        /*
        const suit = msgSuitToSuit(data.which.suit, ui.variant);
        showClueMatch(-1);

        const child = ui.deck[data.which.order].parent;

        const learnedCard = ui.learnedCards[data.which.order];
        learnedCard.suit = suit;
        learnedCard.rank = data.which.rank;
        learnedCard.possibleSuits = [suit];
        learnedCard.possibleRanks = [data.which.rank];
        learnedCard.revealed = true;

        ui.deck[data.which.order].showOnlyLearned = false;
        ui.deck[data.which.order].trueSuit = suit;
        ui.deck[data.which.order].trueRank = data.which.rank;
        ui.deck[data.which.order].setBareImage();

        ui.deck[data.which.order].hideClues();

        const pos = child.getAbsolutePosition();
        child.setRotation(child.parent.getRotation());
        const card = child.children[0];
        card.suitPips.hide();
        card.rankPips.hide();
        child.remove();
        child.setAbsolutePosition(pos);

        playStacks.get(suit).add(child);
        playStacks.get(suit).moveToTop();

        clueLog.checkExpiry();
        */
    } else if (type === 'discard') {
        /*
        const suit = msgSuitToSuit(data.which.suit, ui.variant);
        showClueMatch(-1);

        const child = ui.deck[data.which.order].parent;

        const learnedCard = ui.learnedCards[data.which.order];
        learnedCard.suit = suit;
        learnedCard.rank = data.which.rank;
        learnedCard.possibleSuits = [suit];
        learnedCard.possibleRanks = [data.which.rank];
        learnedCard.revealed = true;

        ui.deck[data.which.order].showOnlyLearned = false;
        ui.deck[data.which.order].trueSuit = suit;
        ui.deck[data.which.order].trueRank = data.which.rank;
        ui.deck[data.which.order].setBareImage();

        ui.deck[data.which.order].hideClues();

        const pos = child.getAbsolutePosition();
        child.setRotation(child.parent.getRotation());
        const card = child.children[0];
        card.suitPips.hide();
        card.rankPips.hide();
        child.remove();
        child.setAbsolutePosition(pos);

        discardStacks.get(suit).add(child);

        for (const discardStack of discardStacks) {
            if (discardStack[1]) {
                discardStack[1].moveToTop();
            }
        }

        let finished = false;
        do {
            const n = child.getZIndex();

            if (!n) {
                break;
            }

            if (data.which.rank < child.parent.children[n - 1].children[0].trueRank) {
                child.moveDown();
            } else {
                finished = true;
            }
        } while (!finished);

        clueLog.checkExpiry();
        */
    } else if (type === 'reveal') {
        /*
        const suit = msgSuitToSuit(data.which.suit, ui.variant);
        const card = ui.deck[data.which.order];

        const learnedCard = ui.learnedCards[data.which.order];
        learnedCard.suit = suit;
        learnedCard.rank = data.which.rank;
        learnedCard.possibleSuits = [suit];
        learnedCard.possibleRanks = [data.which.rank];
        learnedCard.revealed = true;

        card.showOnlyLearned = false;
        card.trueSuit = suit;
        card.trueRank = data.which.rank;
        card.setBareImage();

        card.hideClues();
        card.suitPips.hide();
        card.rankPips.hide();

        if (!this.animateFast) {
            cardLayer.draw();
        }
        */
    } else if (type === 'clue') {
        /*
        const clue = msgClueToClue(data.clue, ui.variant);
        showClueMatch(-1);

        for (let i = 0; i < data.list.length; i++) {
            ui.deck[data.list[i]].setIndicator(true);
            ui.deck[data.list[i]].cluedBorder.show();

            ui.deck[data.list[i]].applyClue(clue, true);
            ui.deck[data.list[i]].setBareImage();
        }

        const neglist = [];

        for (let i = 0; i < playerHands[data.target].children.length; i++) {
            const child = playerHands[data.target].children[i];

            const card = child.children[0];
            const { order } = card;

            if (data.list.indexOf(order) < 0) {
                neglist.push(order);
                card.applyClue(clue, false);
                card.setBareImage();
            }
        }

        let clueName;
        if (data.clue.type === CLUE_TYPE.RANK) {
            clueName = clue.value.toString();
        } else {
            clueName = clue.value.name;
        }

        const entry = new HanabiClueEntry({
            width: clueLog.getWidth(),
            height: 0.017 * winH,
            giver: ui.playerNames[data.giver],
            target: ui.playerNames[data.target],
            clueName,
            list: data.list,
            neglist,
        });

        clueLog.add(entry);

        clueLog.checkExpiry();
        */
    } else if (type === 'status') {
        /*
        clueLabel.setText(`Clues: ${data.clues}`);

        if (data.clues === 0 || data.clues === 8) {
            clueLabel.setFill('#df1c2d');
        } else if (data.clues === 1) {
            clueLabel.setFill('#ef8c1d');
        } else if (data.clues === 2) {
            clueLabel.setFill('#efef1d');
        } else {
            clueLabel.setFill('#d8d5ef');
        }

        scoreLabel.setText(`Score: ${data.score}`);
        if (!this.animateFast) {
            UILayer.draw();
        }
        */
    } else if (type === 'strike') {
        /*
        const x = new Kinetic.Image({
            x: (0.675 + 0.04 * (data.num - 1)) * winW,
            y: 0.918 * winH,
            width: 0.02 * winW,
            height: 0.036 * winH,
            image: ImageLoader.get('redx'),
            opacity: 0,
        });

        strikes[data.num - 1] = x;

        UILayer.add(x);

        if (ui.animateFast) {
            x.setOpacity(1.0);
        } else {
            new Kinetic.Tween({
                node: x,
                opacity: 1.0,
                duration: ui.animateFast ? 0.001 : 1.0,
                runonce: true,
            }).play();
        }
        */
    } else if (type === 'turn') {
        /*
        for (let i = 0; i < ui.playerNames.length; i++) {
            nameFrames[i].setActive(data.who === i);
        }

        if (!this.animateFast) {
            UILayer.draw();
        }
        */
    } else if (type === 'gameOver') {
        /*
        for (let i = 0; i < this.playerNames.length; i++) {
            nameFrames[i].off('mousemove');
        }

        if (timer1) {
            timer1.hide();
        }

        timerLayer.draw();

        this.stopLocalTimer();

        // If the game just finished for the players,
        // start the process of transforming it into a shared replay
        if (!this.replayOnly) {
            this.replayOnly = true;
            this.replayTurn = this.replayMax;
            this.sharedReplayTurn = this.replayTurn;
        }

        // We could be in the middle of an in-game replay when the game ends,
        // so don't jerk them out of the in-game replay
        if (!this.replay) {
            this.enterReplay(true);
        }

        if (!this.animateFast) {
            UILayer.draw();
        }
        */
    } else if (type === 'reorder') {
        /*
        const hand = playerHands[data.target];
        // TODO: Throw an error if hand and note.hand dont have the same numbers in them

        // Get the LayoutChild objects in the hand and put them in the right order in a temporary array
        const newChildOrder = [];
        const handSize = hand.children.length;
        for (let i = 0; i < handSize; i++) {
            const order = data.handOrder[i];
            const child = ui.deck[order].parent;
            newChildOrder.push(child);

            // Take them out of the hand itself
            child.remove();
        }

        // Put them back into the hand in the new order
        for (let i = 0; i < handSize; i++) {
            const child = newChildOrder[i];
            hand.add(child);
        }
        */
    } else if (type === 'boot') {
        /*
        this.stopLocalTimer();

        alert(`The game was ended by: ${data.who}`);
        ui.lobby.gameEnded();
        */
    }
};
