var input = [{
    "slug": "Start",
    "text": "Was the right-most 5 on chop?",
    "connectsto": "save, otherclues",
    "connectstext": "Yes, No",
    "rowNumber": 1
}, {
    "slug": "save",
    "text": "It is a <i>Save Clue</i> on the 5 (This does not imply anything special)",
    "connectsto": "End",
    "connectstext": "The End",
    "rowNumber": 2
}, {
    "slug": "otherclues",
    "text": "Were there other <i>Play Clues</i> or <i>Save Clues</i> that the cluer could have given instead?",
    "connectsto": "onlyfiness, other5scloser",
    "connectstext": "Yes, No",
    "rowNumber": 3
}, {
    "slug": "onlyfiness",
    "text": "Was the only thing left to do giving a <i>Play Clue</i> to a card on <i>Finesse Position</i>?",
    "connectsto": "other5scloser, oneaway",
    "connectstext": "Yes, No",
    "rowNumber": 4
}, {
    "slug": "oneaway",
    "text": "Was the right-most 5 one-away from chop?",
    "connectsto": "early5cm, 5pull",
    "connectstext": "Yes, No",
    "rowNumber": 5
}, {
    "slug": "early5cm",
    "text": "It is an <i>Early 5's Chop Move</i> (They should Chop Move the card to the right of the 5)",
    "connectsto": "End",
    "connectstext": "The End",
    "rowNumber": 6
}, {
    "slug": "5pull",
    "text": "It is a <i>5 Pull</i> (They should blind play the card to the right of the 5)",
    "connectsto": "End",
    "connectstext": "The End",
    "rowNumber": 7
}, {
    "slug": "other5scloser",
    "text": "Were there any other 5's that were closer to chop than this one?",
    "connectsto": "oneaway, 5stall",
    "connectstext": "Yes, No",
    "rowNumber": 8
}, {
    "slug": "5stall",
    "text": "It is a <i>5 Stall</i> (This is an early save on the 5 and does not imply anything special)",
    "connectsto": "End",
    "connectstext": "The End",
    "rowNumber": 9
}, {
    "slug": "End",
    "text": "Back to the hanabi dungeons with you",
    "connectsto": "",
    "connectstext": "",
    "rowNumber": 10
}];