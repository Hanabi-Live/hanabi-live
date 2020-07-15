// Functions having to do with the "fade" and "critical" features
// (e.g. cards that no longer need to be played are faded,
// cards that become critical get an icon)

import globals from './globals';

// Resets the fade and critical for every card in game
export default function statusCheckOnAllCards() {
  if (globals.animateFast) {
    return;
  }

  const indexOfLastDrawnCard = globals.store!.getState().visibleState!.deck.length - 1;
  for (let i = 0; i <= indexOfLastDrawnCard; i++) {
    const card = globals.deck[i];
    card.setFade();
    card.setCritical();
  }
}
