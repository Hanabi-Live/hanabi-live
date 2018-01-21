/*
    This contains functions for the clue UI
    and other things that only appear on your turn
    (when you are taking an action)
*/

exports.hide = (fast) => {
    // TODO
    /*
    if (fast) {
        clueArea.hide();
    } else {
        new Kinetic.Tween({
            node: clueArea,
            opacity: 0.0,
            duration: 0.5,
            runonce: true,
            onFinish: () => {
                clueArea.hide();
            },
        }).play();
    }

    noClueLabel.hide();
    noClueBox.hide();
    noDiscardLabel.hide();

    showClueMatch(-1);
    clueTargetButtonGroup.off('change');
    clueButtonGroup.off('change');

    for (let i = 0; i < playerHands[ui.playerUs].children.length; i++) {
        const child = playerHands[ui.playerUs].children[i];

        child.off('dragend.play');
        child.setDraggable(false);
    }

    drawDeck.cardback.setDraggable(false);
    deckPlayAvailableLabel.setVisible(false);

    submitClue.off('click tap');
    */
};
