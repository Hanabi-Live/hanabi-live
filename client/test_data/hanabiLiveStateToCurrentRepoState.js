// To grab a test state from a game, go to hanabi.live, run the replay to the desired state,
// then paste the following on the console
// Tested at commit 47e68f701825ed36f22af5edd2c7a061bb6b21c7

{
  const getPossibleCards = (cardState) => {
    const possibleCards = [];
    globals.variant.suits.forEach((suit, suitIndex) => {
      possibleCards[suitIndex] = [];
      globals.variant.ranks.forEach((rank) => {
        possibleCards[suitIndex][rank] = cardState.possibleCards.get(`${suit.name}${rank}`);
      });
    });
    return possibleCards;
  }

  const getPipStates = (possibleCards, possibilities, isRank) => {
    const pipStates = [];
    if (isRank) {
      globals.variant.ranks.forEach((rank) => {
        pipStates[rank] = (rank >= 1 && rank <= 5 && possibilities.includes(rank)) ? 'Visible' : 'Hidden';
        if (pipStates[rank] === 'Visible') {
          const rankPossible = globals.variant.suits.some((_, suitIndex) => possibleCards[suitIndex][rank] > 0);
          if (!rankPossible) {
            pipStates[rank] = 'Eliminated';
          }
        }
      });
    } else {
      globals.variant.suits.forEach((suit, suitIndex) => {
        pipStates[suitIndex] = possibilities.includes(suitIndex) ? 'Visible' : 'Hidden';
        if (pipStates[suitIndex] === 'Visible') {
          const suitPossible = globals.variant.ranks.some((rank) => possibleCards[suitIndex][rank] > 0);
          if (!suitPossible) {
            pipStates[suitIndex] = 'Eliminated';
          }
        }
      });
    }
    return pipStates;
  }

  const getCards = () => {
    return globals.deck.map(c => {
      const s = c.state;
      const possibleCards = getPossibleCards(s);
      return ({
        order: s.order,
        location: (s.holder !== null ? s.holder : s.isDiscarded ? 'discard' : s.isPlayed ? 'playStack' : 'deck'),
        suitIndex: globals.variant.suits.indexOf(s.suit),
        rank: s.rank,

        rankClueMemory: {
          possibilities: s.possibleRanks,
          positiveClues: s.positiveRankClues,
          negativeClues: s.negativeRankClues,
          pipStates: getPipStates(possibleCards, s.possibleRanks, true),
        },
        colorClueMemory: {
          possibilities: s.possibleSuits.map(suit => globals.variant.suits.indexOf(suit)),
          positiveClues: s.positiveColorClues.map(color => globals.variant.clueColors.indexOf(color)),
          negativeClues: s.negativeColorClues.map(color => globals.variant.clueColors.indexOf(color)),
          pipStates: getPipStates(possibleCards, s.possibleSuits.map(suit => globals.variant.suits.indexOf(suit)), false),
        },

        possibleCards: possibleCards,
        identityDetermined: s.identityDetermined,
        numPositiveClues: s.numPositiveClues,
        segmentFirstClued: s.turnsClued.length > 0 ? s.turnsClued[0] : null,
        segmentDrawn: s.turnDrawn,
        segmentDiscarded: s.turnDiscarded,
        segmentPlayed: s.turnPlayed,
        isMisplayed: s.isMisplayed,
      });
    }).filter(c => c.location !== 'deck');
  }

  JSON.stringify(getCards());
}
