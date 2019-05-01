List of Features
================

[Hanabi Live](https://hanabi.live/) was released on October 2017 as an attempt to improve upon Keldon's [Keldon's Hanabi server](http://keldon.net/hanabi/). Much of the client code was originally borrowed from his implementation. Nearly all of the server code was written by Zamiel. Several community members have contributed to the project.

<br />

## Basic How-To

* If you don't know how to play Hanabi already, you can read [the official rules](https://pastebin.com/pR54gTq4) or [watch my video explanation](https://www.youtube.com/watch?v=jR9i1qCbHXQ).
* Getting a game going should be self-explanatory, but just in case:
  * Once logged in, use the "Create Game" button on the top navigation bar and then click "Create".
  * For everyone else, the game will now appear in the list of games. To join it, they need to click on the arrow symbol (in the "Action" column).
  * Then, the creator of the table needs to click on the "Start Game" button on the top navigation bar.
* Once inside a game, the UI elements are as follows:
  * The play stacks are in the center of the screen (one for each suit).
  * Around the play stacks, the players are evenly distributed. (This is similar to how players would be if they were sitting at a table in real life.)
  * The "newest" side of a player's hand is indicated by a white glow.
  * You can tell whose turn it is by looking to see if a player's name is bolded.
  * In the top-right-hand corner is a clue log that will track every clue given over the course of the game.
  * In the middle-right is some statistics about how well the game is going.
  * In the bottom-left-hand corner is the deck, which shows how many cards are left in it.
  * In the bottom-right-hand corner is the discard pile.
  * To the left of the discard pile is the turn count, score, clue count, and strike count.
* To perform an action:
  * Play a card by clicking and dragging it to the center stacks.
  * Discard a card by clicking and dragging it to the discard pile.
  * Give a clue by:
    * Click on the button corresponding to the clue recipient.
    * Click on the button corresponding to the rank or the color.
    * Click on the "Give Clue" button.
* Once the game is over, use the "Lobby" button in the bottom-left-hand corner.

<br />

## Major Features

#### Clue Indication

* The cards last touched by a clue are indicated by arrows. A circle on the arrow shows the type of clue that was given.
* Yellow borders around a card signify that it has been "touched" by one or more clues.
* The game will keep track of the clues that accumulate on your cards, "filling them in" for you.
* You can left-click on someone else's card to see how it appears to them. (This is referred to as "Empathy".)

#### Pips

* Color pips (that match the suits of the stack) and black boxes (that match the number possibilities) will appear on cards in a player's hand.
* The pips and boxes will automatically disappear as positive clues and negative clues "touch" the card.
* The pips and boxes will automatically be crossed out if all the particular cards for that suit/rank are visible.

#### Clue Log

* A clue log is also shown in the top-right-hand corner.
* When mousing over a card, the positive clues that have touched the card will turn white and the negative clues that have touched the card will turn red.
* You can click on an entry in the clue log to go to the turn when the clue was given.

#### Notes

* Players can right-click on any card to add a note to it. Afterward, by hovering over a card, a tooltip will appear with the written note.
* This is useful for storing contextual information about a card for later.
* Notes can also be written inside of an in-game replay as a way to track the card as it moves throughout your hand.
* If the note matches the name of a card (e.g. "red 1", "r1", etc.), the card face will change to match. (The card face will automatically be deactivated if a clue is received that falsifies the note.)
* Since notes are tracked by the server, players can switch computers mid-game and keep any notes written.
* Notes are saved in the database and will persist into the replay.
* Everyone's notes are combined and shown to spectators, which is fun to see.
* There are also some keyboard shortcuts for making notes:
  * Shift + Right-click --> f
    * "f" is a common abbreviation for "this card is *Finessed*".
  * Alt + Right-click --> cm
    * "cm" is a common abbreviation for "this card is *Chop Moved*".
  * Ctrl + Shift + Right-click --> [previously entered note]
    * If you need to put the same note on multiple cards, enter the note on the first card, and then use this hotkey on the rest of the cards.

#### Spectators

* All games have the ability to be spectated by other idle players.
* Spectators will see all of the hands.
* The list of current spectators can be seen by hovering over the "👀" icon in the bottom-right-hand corner.
* Spectators can right-click on a player's name to view the game from their perspective.

#### In-Game Replay

* In the middle of a game, players can click on the arrow button in the bottom-left-hand corner to open the in-game replay feature.
* Using this feature, players can go back in time to see the exact game state at a specific turn.
* There are some helpful shortcuts for going to a specific turn:
  * You can Alt + click on a card to go to the turn it was drawn.
  * You can click on a card in the play stacks to go to the turn before the card was played.
  * You can click on a card in the discard pile to go to the turn before the card was discarded.
  * You can click on an entry in the clue log to go to the turn when the clue was given.
  * You can click on the three strike squares to go to the turn before the strike happened, if any.
  * You can right-click on the "Turn" label to go to an arbitrary turn.

#### Game History and Profiles

* After a game is completed, it will be recorded in the database.
* Players will be able to see their past games in the "Show History" screen.
* You can click on a player's name in the lobby to view their profile, which will show all of their past games and some extra statistics.

#### Replays

* Any past game can be viewed as a replay or a shared replay.
* Similar to an in-game replay, in a post-game replay, you can review the game turn by turn.

#### Shared Replays

* A shared replay is similar to a normal replay, but others can join to have a coordinated review session.
* At the end of each game, you will automatically be put into a shared replay with everyone who played the game.
* The leader controls what turn is being shown. By default, the leader will be the person who created the game or created the shared replay.
* The leader can right-click on a card to highlight it with a red arrow (to point out things to the other players).
* The leader can Ctrl + Shift + Alt + right-click on a card to morph it into an arbitrary card.
* The current leader can be seen by hovering over the "👑" icon in the bottom right-hand corner.
* The leader role can be transfered by right-clicking on a player's name or by right-clicking the crown.

#### Game Statistics

* Some statistics are shown on the right hand side of the screen to show how well the game is going.
* Pace:
  * You can think of Hanabi as a race to play all of the cards before the deck runs out. It is useful to track how close to the end of the race you are.
  * Pace is a measure of the amount of discards that can happen while still having a chance to get the maximum score.
  * Pace is calculated with the following formula: `current score + cards in deck + number of players - maximum score`.
  * If you discard all copies of a card, so that the the maximum achievable score lowers, pace will adjust accordingly.
  * At pace 0, the only way to win is if every player plays a card in the last round of the game.
* Efficiency:
  * In Hanabi, you want to be as efficient as possible with the limited number of clues that you have. It is useful to track how well the team is doing with regards to this.
  * Efficiency is calculated with the following formula: `number of clues given / (number of cards played + number of unplayed cards with one or more clues "on" them)`
  * The numerator (first number) shows the efficiency of the current game.
  * The denominator (second number) shows the minimum possible efficiency needed to win with the current number of players and the current variant. (This number is statically calculated at the beginning of the game - it will not adjust if the maximum achievable score lowers.)
  * Note that this measure of efficiency assumes *Good Touch Principle* - that all clued cards will eventually be played. If your team does not play with *Good Touch Principle*, then these numbers won't be useful.
  * Even known useless cards with a clue on them will be counted.

#### 6-Player Games

Hanabi is supposed to be played with 2-5 players. But nobody can tell me what to do.

<br />

## Custom Game Options

#### Variants

* The server implements several official and unofficial Hanabi variants, which are listed on [a separate page](https://github.com/Zamiell/hanabi-live/tree/master/docs/VARIANTS.md).

#### Timed Games

* Each game has the option to be created with as a "Timed Game".
* Similar to chess, each player has a bank of time that decreases only during their turn.
* By default, each player starts with 2 minutes and adds 20 seconds to their clock after performing each move.
* If time runs out for any player, the game immediately ends and a score of 0 will be given.

#### Speedruns

* Each game has the option to be created as a speedrun. Speedruns are where players attempt to beat the game as fast as possible (as a special challenge). The best speedrun times are tracked on the [Speedrun.com leaderboards](https://www.speedrun.com/hanabi).
* In a speedrun, the controls work differently and are optimized for faster play:
  * Left-clicking on a card in your hand will play it.
  * Right-clicking on a card in your hand hand will discard it.
  * Left-clicking on a card in your teammate's hand will give it a color clue.
  * Right-clicking on a card in your teammate's hand will give it a rank clue.
  * Empathy can still be used by Ctrl + Left-clicking.
* Speedrunning games will not count towards your statistics.
* If this mode is enabled, then the "Timed" option will be disabled.

#### Bottom Deck Blind Plays

* Each game has the option to allow a special "house" rule.
* If enabled, when there is 1 card left in the deck, players are allowed to blind play it.
* This is done by dragging the deck on to the play area.
* A golden border will appear around the deck when there is 1 card left in order to signify that this is possible.
* This feature can prevent losses that occur from being "bottom decked" by a 3 or a 4 that was impossible to save in the early or mid-game.

#### Empty Clues

* By default, it is not possible to give an "empty" clue, which is a clue that touches 0 cards.
* Each game has the option to allow empty clues.
* More information on the history of empty clues can be found in the [Hyphen-ated conventions repository](https://github.com/Zamiell/hanabi-conventions/blob/master/other-conventions/Empty_Clues.md#history).

#### Detrimental Character Assignments

* Each game has the option to enable "Detrimental Character Assignments". When enabled, it will restrict players in additional ways beyond the normal rules.
* The characters are loosly based on [this post](https://boardgamegeek.com/thread/1688194/hanabi-characters-variant) from Sean McCarthy on the Board Game Geek forums.
* More information on the characters are listed on [a separate page](https://github.com/Zamiell/hanabi-live/tree/master/docs/CHARACTERS.md).

#### Correspondence Games

* Normally, games will be automatically terminated after 30 minutes of inactivity in order to prevent the lobby from getting cluttered.
* If players are intending to play a [correspondence game](https://en.wikipedia.org/wiki/Correspondence_chess) over a span of multiple days, then they can increase the 30 minute idle-timeout to 24 hours by enabling this option.
* Correspondence games will not be visible from the lobby and can not be spectated by other players.

#### Password-Protected Games

* Each game has the option to be created with a password.
* This allows private tables to be created.
* Note that all passwords are [salted](https://en.wikipedia.org/wiki/Salt_(cryptography)) and [hashed](https://en.wikipedia.org/wiki/Cryptographic_hash_function) (with [SHA256](https://en.wikipedia.org/wiki/SHA-2)) before being sent to the server.

<br />

## Other Options

#### Keldon Mode

* By default, the interface will look similar to the  [Board Game Arena](https://en.boardgamearena.com/) implementation of Hanabi, in which all of the hands are grouped together in rows.
* In Keldon mode, the hands are distributed around the table, similar to how it would look if you were playing Hanabi in real-life.

#### Color-Blind Mode

* Each player has the option to toggle a color-blind mode that will add a letter to each card that signifies which suit it is.

#### Reverse Hand Direction

* Each player has the option to toggle a "reverse hand direction" option, in which the user interface will display the hand from right-to-left instead of from left-to-right.
* This is useful for players that are used to drawing cards from the right side instead of from the left.

#### Real-Life Mode

* In real-life mode, cards will no longer be filled in with positive and negative clues.
* Furthermore, extra UI elements are turned off (8 clue warning, double discard warning, etc.).

#### Pre-Playing

* Each player has the option to enable the ability to pre-play cards, which is similar to "pre-moves" in Chess.
* Players can pre-play or pre-discard by clicking and dragging a card to the respective location and releasing the mouse button. Once done, the card will hover over the location until their turn has arrived, and then the action will be automatically performed.
* Once a card is pre-played or pre-discarded, it cannot be undone unless they go back to the lobby (or refresh the page).

<br />

## Sounds

* There are different sounds for:
  * when a player takes an action
  * when it reaches your turn
  * when a card fails to play
  * when two cards fail to play in a row
  * when a card blind-plays
  * when multiple cards blind-play in a row (up to 4)
  * discarding a "critical" card
  * finishing the game with a score of 0
  * finishing the game with a non-perfect score
  * finishing the game with a perfect score

<br />

## Keyboard Shortcuts

* In the lobby:
  * Create a table: `Alt + c`
  * Show history: `Alt + h`
  * Start a game: `Alt + s`
  * Leave a table: `Alt + l`
  * Return to tables: `Alt + r`
* In a game:
  * Play a card: `a` or `+` (will prompt an alert for the slot number)
  * Discard a card: `d` or `-` (will prompt an alert for the slot number)
  * Clue:
    * `Tab` to select a player
    * `1`, `2`, `3`, `4`, `5` for a rank clue
    * Or `q`, `w`, `e`, `r`, `t` for a color clue
    * Then `Ctrl + Enter` to submit
* In a replay:
  * Rewind back one turn: `Left`
  * Fast-forward one turn: `Right`
  * Rewind one full rotation: `[`
  * Fast-forward one full rotation: `]`
  * Go to the beginning: `Home`
  * Go to the end: `End`

<br />

## Similar Deals and Competitive Play

* Normally, when a game is started, the server will find a deal in the database (based on a seed) that none of the players have played before.
* If there were no old deals that matched this criteria, the server will generate a new random deal.
* After the game is completed, the "Other Scores" button on the game history screen will show other players who played the same deal, if any. You can even view the replay of other people's games to see how they played the deal.
* If two groups of Hanabi players want to compete against each other, then there are two ways to play a non-randomly generated deal:
  * Start a game with `!seed [seed]` to play a deal generated by that specific seed. For example: `!seed showmatch-jan-2050-game-1`
  * Start a game with `!deal [deal]` to play a deal specified by a text file. The text file must already be present on the server in the `specific-deals` directory. If necessary, you can contact an administrator to upload a new text file. For example: `!deal showmatch-jan-2050-game-1`

<br />

## Discord Integration

* All lobby chat will be replicated to (and from) the [Hanabi Discord server](https://discord.gg/FADvkJp).
* If you want to try to get some people together for a game, you can use the `/here` command to ping everyone who has joined the Discord server.
* If you want the Discord bot to ping you when the next game starts, use the `/next` command to be put on the waiting list.
* The full list of commands is found in the [chatCommand.go file](https://github.com/Zamiell/hanabi-live/blob/master/src/chatCommand.go).

<br />

## Other Quality of Life Improvements (over Keldon's Server)

* The action log is improved:
  * It will show what slot a player played or discarded from.
  * It will show "(blind)" for blind plays.
  * It will shows "(clued)" when discarding clued cards.
  * It will show 3 actions instead of 1.
  * It will show how many cards were left in the deck at the start of each message. (This only occurs when you click the action log to see the full log.)
  * At the end of the game, in timed games, it will show how much time each player had left. In non-timed games, it will show how much time that the game took in total.
* The clue log will still continue to function if you mouse over played and discarded cards.
* The "No Clues" indicator is much easier to see.
* Replays of other games will no longer show "Alice", "Bob", etc., and will instead show the real player names. This way, if you have a question about what they did, you can message them and ask.
* Upon refreshing the page, if you are in the middle of the game, you will be automatically taken into that game from the lobby.
* You will no longer have to refresh the page after resizing the browser window.
* The "Clues" text on the game UI will be red while at 8 clues.
* Each suit name is listed below the stack in the middle of the screen during games with the multi-color variants.
* The lobby has been completely rehauled:
  * The nice-looking user interface is [Alpha from HTML5UP](https://html5up.net/alpha).
  * The username box on the login box will now be automatically focused and you can press enter to login.
  * Your name will be bolded in the user list.
  * The ambiguous checkboxes in the lobby have been converted to a "Status" indicator, showing exactly what the person is doing.
* You can now view a replay (or share a replay) by ID number.
* You can now view a replay (or share a replay) from arbitrary JSON game data.
* When you create a game, the server will suggest a randomly generated table name for you.
* Idle games and idle shared replays will automatically be ended by the server after 30 minutes.

<br />
