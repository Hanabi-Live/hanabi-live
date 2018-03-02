List of Changes & Improvements
==============================

This server attempts to emulate the [Keldon Hanabi server](http://keldon.net/hanabi/). However, it also contains many new features, bug fixes, and quality of life improvements.

<br />



## New Variants

#### Orange Suit

* The old "black" variant (with more than one of each card) was changed to orange in order to disambiguate it from the "black one of each" variant.

#### White Suit (colorless) and Rainbow Suit (all-colors)

* This is like the "Rainbow" variant, but purple is replaced with white.
* No color clues touch the white suit.

#### Dual-color Suits

* This has 6 new suits:
  1. Green (blue / yellow)
  2. Purple (blue / red)
  3. Navy (blue / black)
  4. Orange (yellow / red)
  5. Tan (yellow / black)
  6. Burgundy (red / black)
* There are only 4 types of clues:
  1. Blue
  2. Yellow
  3. Red
  4. Black

#### Dual-color and Rainbow Suits

* This has 5 new suits and 1 old suit:
  1. Teal (blue / green)
  2. Lime (green / yellow)
  3. Orange (yellow / red)
  4. Cardinal (red / purple)
  5. Indigo (blue / purple)
  6. Rainbow (all colors)
* The standard clue types are available.

#### Wild & Crazy

* This has 4 new suits and 2 old suits:
  1. Green (blue / yellow)
  2. Purple (blue / red)
  3. Orange (yellow / red)
  4. White (colorless)
  5. Rainbow (all colors)
  6. Black (one of each)
* There are 4 types of clues
  1. Blue
  2. Yellow
  3. Red
  4. Black

#### Ambiguous Suits

* This has 6 new suits:
  1. Sky (blue)
  2. Navy (blue)
  3. Lime (green)
  4. Forest (green)
  5. Tomato (red)
  6. Burgundy (red)
* There are 3 types of clues:
  1. Blue
  2. Green
  3. Red

#### Red & Blue

* This has 6 new suits:
  1. Sky (blue)
  2. Berry (blue)
  3. Navy (blue)
  4. Tomato (red)
  5. Ruby (red)
  6. Mahogany (red)
* There are 2 types of clues:
  1. Blue
  2. Red

#### Acid Trip

* This has the same 6 suits as the "orange" variant.
* This has the same 6 clues available as the "orange" variant.
* All color clues touch all cards.

<br />



## New Major Features

#### Improved Clue Indication

* The cards last touched by a clue are now indicated by arrows.
* Yellow borders around a card signify that it has been "touched" by one or more clues.
* Color pips (that match the suits of the stack) and black boxes (that match the number possibilities) will appear on cards in your hand. The pips and boxes will automatically disappear as you learn more information about the card.
* You can left-click on someone else's card to see how it appears to them. (This is referred to as "empathy".)

#### Bottom Deck Blind Plays

* As an added "house" rule, on your turn, if there is 1 card left in the deck, you are allowed to blind play it.
* This is done by dragging the deck on to the play area.
* A golden border will appear around the deck when there is 1 card left in order to signify that this is possible.
* This feature prevents stupid losses that occur from being "bottom decked" by a 3 or a 4 that was impossible to save in the early or mid-game.
* This feature is enabled by default. If you don't want to use this rule, then simply have your team agree to not use the feature beforehand.

#### Shared Replays

* Any replay can be started as a "shared" replay. Once created, an unlimited number of people can join it.
* When in a shared replay, the leader can control what turn is being shown to everyone in the replay.
* The leader can right-click on a card to highlight it with a red arrow.
* You can see who the leader of the replay is by hovering over the "👑" icon in the bottom right-hand corner.
* You can use this feature to share a past game with a friend who was not in that game.
* You can transfer the leader role by right clicking on a player's name.

#### Timed Games

* Each game now has the option to be created with as a "Timed Game".
* Similar to chess, each player has a bank of time that decreases only during their turn.
* By default, each player starts with 5 minutes.
* Upon performing a move, each player will add 10 seconds to their clock.
* If time runs out for any player, the game immediately ends.
* In non-timed games, the timers will still show, but they will count up instead of down to show how long each player is taking.

#### Notes

* You can right-click a card to add a note to it.
* Since notes are tracked by the server, you can switch computers mid-game and keep your notes.
* Your notes will persist into the replay.
* Everyone's notes are combined and shown to spectators, which is fun to see.

#### Forced Chop Rotation

* Each game now has the option to be created with as "Forced Chop Rotation".
* If enabled, each player will automatically reorder their cards in the following algorithmic fashion:
  * After you discard or clue, if all the people between you and the last person who discarded played cards, then you move your right-most unclued card to the left-most position.

#### Color-Blind Mode

* Each player has the option to toggle a color-blind mode that will add a letter to each card that signifies which suit it is.

<br />



## New Sounds

* The sound for reaching your turn is improved.
* There is a new sound whenever someone else performs an action.
* There is a custom sound for a failed play.
* There is a custom sound for a blind play.

<br />



## Keyboard Shortcuts

* For the lobby:
  * Create a table: `Alt + c`
  * Show history: `Alt + h`
  * Start a game: `Alt + s`
  * Leave a table: `Alt + l`
  * Return to tables: `Alt + r`
* For in-game:
  * Play a card: `a` or `+` (will prompt an alert for the slot number)
  * Discard a card: `d` or `-` (will prompt an alert for the slot number)
  * Clue:
    * `Tab` to select a player
    * `1`, `2`, `3`, `4`, `5` for a number clue
    * Or `q`, `w`, `e`, `r`, `t` for a color clue
    * Then `Enter` to submit
* For in a replay:
  * Rewind back one turn: `Left`
  * Fast-forward one turn: `Right`
  * Rewind one full rotation: `[`
  * Fast-forward one full rotation: `]`
  * Go to the beginning: `Home`
  * Go to the end: `End`

<br />



## Bug Fixes

* Games will no longer randomly crash if there are too many spectators.
* Your hand will be properly revealed at the end of the game.

<br />



## Quality of Life Improvements

* The way clues are represented on cards has been changed:
  * The cards that will be affected by a clue are represented by white arrows.
  * When a card has been touched by one or more clues, it will have a yellow border.
  * The possibilities of what a card can be are directly shown on the card.
* The action log is improved:
  * It will show what slot a player played or discarded from.
  * It will show "(blind)" for blind plays.
  * It will shows "(clued)" when discarding clued cards.
  * It will show 3 actions instead of 1.
  * It will show how many cards were left in the deck at the start of each message. (This only occurs when you click on it to see the full log.)
  * At the end of the game, it will show how much time each player had left. Or, in non-timed games, it will show how much time they took in total.
* The clue log will still continue to function if you mouse over played and discarded cards.
* The "No Clues" indicator is much easier to see.
* In-game replays will show card faces based on your current knowledge of the card.
* Replays of other games will no longer show "Alice", "Bob", etc., and will instead show the real player names. This way, if you have a question about what they did, you can actually message them and ask.
* Upon refreshing the page, if you are in the middle of the game, you will be automatically taken into that game from the lobby.
* You will no longer have to refresh the page after resizing the browser window.
* The "Clues" text on the game UI will be red while at 8 clues.
* Each suit name is listed below the stack in the middle of the screen during games with the multi-color variants.
* All lobby chat will be replicated to (and from) the Hanabi Discord server.
* The ambiguous checkboxes in the lobby have been converted to a "Status" indicator, showing exactly what the person is doing.
  * The possible statuses are as follows: Lobby, Pre-Game, Playing, Replay, Shared Replay, Spectating
* During a game, you can mouse over the "👀" icon in the bottom right-hand corner to see who is spectating the game.
* The username box on the login box will now be automatically focused and you can press enter to login.
* When you create a game, the server will suggest a randomly generated table name for you.
* The fade time has been shortened to 200 milliseconds (from 800 milliseconds) in order to make the UI snappier.
* Your name will be bolded in the user list.
* The UI has been cleaned up a little to make it look less cramped.

<br />
