# Hanab Live Game Logic

This package contains the rules for the game of Hanab. These are exported as
functions like `isCardTouchedByClue`, `isCardOnChop`, and so on.

You can see the full list of things that this library provides in the
[auto-generated documentation](https://hanabi-live.github.io/hanabi-live/).

The main export of this library is the `gameReducer` function, which can compute
the next game state from an existing game state and a game action.

## Installation

If you want to use the game logic in a bot or some other Hanab-related program,
then you can install it from npm:

```sh
bun add @hanabi-live/game
```

## Publishing

From this directory, use `bun pm pack` to inspect a release archive and
`bun publish` to publish an intentionally versioned release. The `prepack`
script builds the library first. Bun replaces `catalog:` dependencies with their
pinned versions; do not publish the source manifest with another tool.

## Usage

Here is an example of a program using the `gameReducer` function to compute a
game state:

```ts
import {
  draw,
  gameReducer,
  getDefaultMetadata,
  getInitialGameState,
} from "@hanabi-live/game";

const numPlayers = 2;
const metadata = getDefaultMetadata(numPlayers);
const initialGameState = getInitialGameState(metadata);

console.log(`First player has ${initialGameState.hands[0].length} cards.`); // Should print 0.

const action = draw(0, 0, 0, 1);
const nextGameState = gameReducer(
  initialGameState,
  action,
  true,
  false,
  false,
  false,
  metadata,
);

console.log(`First player now has ${nextGameState.hands[0].length} cards.`); // Should print 1.
```

The package is an ES module, so JavaScript uses the same `import` statement.
Node.js 20.19, 22.12, and later versions can also load it with `require()`.
