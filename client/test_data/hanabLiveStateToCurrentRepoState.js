// To grab a test state from a game, run the replay to the desired state,
// then paste the following on the console

{
  JSON.stringify(globals.state.visibleState.deck.filter(c => c.location !== 'deck'), null, 4)
}
