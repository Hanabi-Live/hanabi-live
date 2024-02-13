# Hanab Live Game Logic

This package contains the rules for the game of Hanab. These are exported as functions like `isCardTouchedByClue`, `isCardOnChop`, and so on.

You can see the full list of things that this library provides in the [auto-generated documentation](https://hanabi-live.github.io/hanabi-live/).

The main export of this library is the `gameReducer` function, which can compute the next game state from an existing game state and a game action.

<br>

## Installation

If you want to use the game logic in a bot or some other Hanab-related program, then you can install it from npm:

```sh
npm install @hanabi-live/game --save
```

<br>

## Usage

### TypeScript

Here is an example of a TypeScript program using the `gameReducer` function to compute a game state:

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

This library is currently published as CommonJS (CJS) due to technical limitations in the monorepo. (We have CJS dependencies.) Thus, the above ESM syntax will only work if you are using TypeScript. (We recommend using [`tsx`](https://github.com/privatenumber/tsx) to run your TypeScript, which skips the compilation step.)

### JavaScript

Using pure JavaScript to consume this library is not recommended. (Use TypeScript to save yourself from run-time error pain!) If you are some sort of masochist and want to use pure JavaScript, then you have to use the legacy CJS import format like so:

```js
const hanabiLiveGame = require("@hanabi-live/game");

const { draw, gameReducer, getDefaultMetadata, getInitialGameState } =
  hanabiLiveGame;

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
