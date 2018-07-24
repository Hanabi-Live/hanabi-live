List of Features
================

The server was originally an attempt to emulate the [Keldon Hanabi server](http://keldon.net/hanabi/) and was written in Node.js. Since then, it has been completely rewritten in Go. This page mainly shows the differences between Hanabi.live and Keldon's site.

<br />



## New Major Features

#### New Variants

* The server implements several official and unofficial Hanabi variants, which are listed on [a separate page](https://github.com/Zamiell/hanabi-live/tree/master/docs/VARIANTS.md).

#### Improved Clue Indication

* The cards last touched by a clue are now indicated by arrows.
* Yellow borders around a card signify that it has been "touched" by one or more clues.
* Color pips (that match the suits of the stack) and black boxes (that match the number possibilities) will appear on cards in your hand. The pips and boxes will automatically disappear as you learn more information about the card.
* You can left-click on someone else's card to see how it appears to them. (This is referred to as "empathy".)

#### Bottom Deck Blind Plays

* As an added "house" rule, on your turn, if there is 1 card left in the deck, you are allowed to blind play it.
* This is done by dragging the deck on to the play area.
* A golden border will appear around the deck when there is 1 card left in order to signify that this is possible.
* This feature prevents losses that occur from being "bottom decked" by a 3 or a 4 that was impossible to save in the early or mid-game.
* This feature is enabled by default. If you don't want to use this rule, then simply have your team agree to not use the feature beforehand.

#### Shared Replays

* At the end of a game, you will automatically be put into a shared replay with everyone who played the game.
* Furthermore, any replay can be started as a "shared" replay. Once created, an unlimited number of people can join it.
* When in a shared replay, the leader can control what turn is being shown to everyone in the replay. By default, the leader will be the person who created the game or created the shared replay.
* The leader can right-click on a card to highlight it with a red arrow (to point out things to the other players).
* The leader can shift + left-click on a card to morph it into an arbitrary card.
* You can see who the leader of the replay is by hovering over the "👑" icon in the bottom right-hand corner.
* You can use this feature to show a past game with a friend who was not in that game.
* You can transfer the leader role by right clicking on a player's name.

#### Timed Games

* Each game now has the option to be created with as a "Timed Game".
* Similar to chess, each player has a bank of time that decreases only during their turn.
* By default, each player starts with 2 minutes and adds 20 seconds to their clock after performing each move.
* If time runs out for any player, the game immediately ends and a score of 0 will be achieved.
* In non-timed games, there is an option to show the timers anyway. They will count up instead of down to show how long each player is taking.

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

#### Efficiency Statistics

* Each player has the option to toggle efficiency statistics about the current game. They are shown at the bottom of the clue log.

#### Reverse Hand Direction

* Each player has the option to toggle a "reverse hand direction" option, in which the user interface will display the hand from right-to-left instead of from left-to-right.
* This is useful for players that are used to drawing cards from the right side instead of from the left.

<br />



## New Sounds

* The sound for reaching your turn is improved.
* There is a new sound whenever someone else performs an action.
* There is a custom sound for a failed play.
* There is a custom sound for a blind play.
* There is a custom sound for multiple blind plays in a row (up to 4).
* There is a custom sound for discarding a critical card.

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



## Bug Fixes (from Keldon's server)

* Games will no longer randomly crash if there are too many spectators.
* Your hand will be properly revealed at the end of the game.

<br />



## Quality of Life Improvements

* The action log is improved:
  * It will show what slot a player played or discarded from.
  * It will show "(blind)" for blind plays.
  * It will shows "(clued)" when discarding clued cards.
  * It will show 3 actions instead of 1.
  * It will show how many cards were left in the deck at the start of each message. (This only occurs when you click the action log to see the full log.)
  * At the end of the game, in timed games, it will show how much time each player had left. In non-timed games, it will show how much time that the game took in total.
* The clue log will still continue to function if you mouse over played and discarded cards.
* The "No Clues" indicator is much easier to see.
* In-game replays will show card faces based on your current knowledge of the card.
* Replays of other games will no longer show "Alice", "Bob", etc., and will instead show the real player names. This way, if you have a question about what they did, you can actually message them and ask.
* Upon refreshing the page, if you are in the middle of the game, you will be automatically taken into that game from the lobby.
* You will no longer have to refresh the page after resizing the browser window.
* The "Clues" text on the game UI will be red while at 8 clues.
* Each suit name is listed below the stack in the middle of the screen during games with the multi-color variants.
* All lobby chat will be replicated to (and from) the Hanabi Discord server.
* The lobby has been completely rehauled:
  * The nice-looking user interface is [Alpha from HTML5UP](https://html5up.net/alpha).
  * The username box on the login box will now be automatically focused and you can press enter to login.
  * Your name will be bolded in the user list.
  * The ambiguous checkboxes in the lobby have been converted to a "Status" indicator, showing exactly what the person is doing.
* You can now view a replay (or share a replay) by ID number.
* When you create a game, the server will suggest a randomly generated table name for you.
* During a game, you can mouse over the "👀" icon in the bottom right-hand corner to see who is spectating the game.
* Idle games and idle shared replays will automatically be ended by the server after 30 minutes.

<br />
