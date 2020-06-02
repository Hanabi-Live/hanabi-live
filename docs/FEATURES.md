# List of Features

[Hanabi Live](https://hanabi.live/) was released on October 2017 as an attempt to improve upon [Keldon Jones'](http://keldon.net/) Hanabi site (which is now deleted). Much of the client code was originally borrowed from his implementation. Nearly all of the server code was written by Zamiel. Several community members have contributed to the project.

<br />

## Table of Contents

1. [Basic How-To](#basic-how-to)
2. [Major Features](#major-features)
3. [Notes](#notes)
4. [Custom Game Options](#custom-game-options)
5. [Other Options](#other-options)
6. [Sounds](#sounds)
7. [Keyboard Shortcuts](#keyboard-shortcuts)
8. [Similar Deals and Competitive Play](#similar-deals-and-competitive-play)
9. [Chat](#chat)
10. [Friends](#friends)
11. [Tags](#tags)
12. [Research & Bots](#research--bots)

<br />

## Basic How-To

* If you don't know how to play Hanabi already, you can read [the official rules](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Rules.md) or [watch Zamiel's video explanation](https://www.youtube.com/watch?v=jR9i1qCbHXQ).
* Getting a game going should be self-explanatory, but just in case:
  * Once logged in, use the "Create Game" button on the top navigation bar and then click "Create".
  * For everyone else, the game will now appear in the list of games. To join it, they need to click on ▶️.
  * Then, the creator of the table needs to click on the "Start Game" button on the top navigation bar.
* Once inside a game, the UI elements are as follows:
  * The play stacks are on the left (one for each suit).
  * The player hands are on the right. Drawn cards are added to the left side of the hand.
  * You can tell whose turn it is by looking to see if a player's name is bolded.
  * In the top-right-hand corner is a clue log that will track every clue given over the course of the game.
  * In the middle-right is some statistics about how well the game is going.
  * In the bottom-left-hand corner is the deck, which shows how many cards are left in it.
  * In the bottom-right-hand corner is the discard pile.
  * To the left of the discard pile is the turn count, score, clue count, and strike count.
* To perform an action:
  * Play a card by clicking and dragging it to the play stacks.
  * Discard a card by clicking and dragging it to the discard pile.
  * Give a clue by:
    * Click on the button corresponding to the clue recipient.
    * Click on the button corresponding to the rank or the color.
    * Click on the "Give Clue" button.
* Once the game is over, use the "Lobby" button in the bottom-left-hand corner.

<br />

## Major Features

#### Clue Indication

* Arrows indicate the cards that are touched by a clue.
  * A circle on the arrow shows the type of clue that was given.
  * Arrows with a white border indicate that they are touching a "brand new" card (e.g. a card that has not been touched by any positive clues yet).
  * Arrows with a gray border indicate that they are re-touching a card that has been previously touched by one or more positive clues.
* Black borders around a card signify that it has been "touched" by one or more positive clues.
* The game will keep track of the clues that accumulate on cards, "filling them in" when appropriate.
* You can hold down the left mouse button on someone else's hand to see how it appears to them. (This is referred to as "empathy".)

#### Pips

* Suit pips (that represent the possible suits) and black boxes (that represent the possible ranks) will appear on cards in a player's hand.
* The pips and boxes will automatically disappear as positive clues and negative clues "touch" the card.
* The pips and boxes will automatically be crossed out if all the particular cards for that suit/rank are visible.

#### Critical Indicator

A "❗" icon will appear on cards that are "critical". (Critical cards are cards that have not been played yet and have only one copy remaining.)

#### Clue Log

* A clue log is shown in the top-right-hand corner.
* When the cursor is hovering over a card, the positive clues that have touched the card will turn white and the negative clues that have touched the card will turn red.
* You can click on an entry in the clue log to go to the turn when the clue was given.

#### Spectators

* All games have the ability to be spectated by others.
* Spectators will see all of the hands.
* The list of current spectators can be seen by hovering over the "👀" icon in the bottom-right-hand corner.
* Spectators can right-click on a player's name to view the game from their perspective.

#### In-Game Replay

* In the middle of a game, players can click on the arrow button in the bottom-left-hand corner to open the in-game replay feature.
* Using this feature, players can go back in time to see the exact game state at a specific turn.
* There are some helpful shortcuts for going to a specific turn:
  * You can Alt + click on a card to go to the turn it was drawn.
  * You can middle-click on a card go to the turn it was first positively clued.
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
* Players can "break free" of what the leader is showing by clicking the "Pause Shared Turns" button, or by manually navigating to a different turn. To resyncronize with the team, they need to click on the "Use Shared Turns Button". (The up arrow and down arrow are also shortcuts for clicking on this button.)
* The leader can right-click on a card to highlight it with a red arrow (to point out things to the other players).
* The current leader can be seen by hovering over the "👑" icon in the bottom right-hand corner.
* The leader role can be transfered by right-clicking the crown.

#### Hypotheticals

* In a shared replay, the leader has the option to begin a hypothetical.
* In a hypothetical, the leader can perform actions for all of the players, playing the game forward for as long as desired.
* Hypotheticals are useful to show what would happen if a player decided to do a different move than they really did in the game.
* When a hypothetical is active, other players cannot "break free" or return to previous turns.
* The leader can Alt + right-click on a card to morph it into an arbitrary card. This can be useful for showing how players have to account for different kinds of situations or to create specific game states.

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
  * Efficiency is calculated with the following formula: `(number of cards played + number of unplayed cards with one or more clues "on" them) / number of clues given`
  * The numerator (first number) shows the efficiency of the current game.
  * The denominator (second number) shows the minimum possible efficiency needed to win with the current number of players and the current variant. (This number is statically calculated at the beginning of the game - it will not adjust if the maximum achievable score lowers.)
  * Note that this measure of efficiency assumes *Good Touch Principle* - that all clued cards will eventually be played. If your team does not play with *Good Touch Principle*, then these numbers won't be useful.
  * Even known useless cards with a clue on them will be counted.

#### 6-Player Games

* Hanabi is supposed to be played with 2-5 players. But nobody can tell me what to do.

<br />

## Notes

#### Basic Description

* When in the middle of an ongoing game, players can right-click on any card to add a note to it. Afterward, by hovering over a card, a tooltip will appear with the written note.
* This is useful for storing contextual information about a card for later.
* Notes can also be written during an in-game replay as a way to track the card as it moves throughout your hand.
* Since notes are tracked by the server, players can switch computers mid-game and keep any notes written.
* Notes are saved in the database and will persist into the replay.
* Everyone's notes are combined and shown to spectators, which is fun to see.

#### Card Identity Notes

* If the note matches the name of a card (e.g. "red 1", "r1", etc.), the card face will change to match. (The card face will automatically be deactivated if a clue is received that falsifies the note.) If this is undesired, append a question mark to the end of your note (e.g. "r1?").
  * Black is abbreviated as "k".
  * Rainbow, muddy rainbow, and cocoa rainbow are abbreviated as "m".
  * Pink, light pink, and gray pink are abbreviated as "i".
  * Brown is abbreviated as "n".
  * The "dark" suits are abbreviated the same as their normal counterparts.
  * Gray is abbreviated as "a".

#### Special Note Borders

* A note of "f" can be written to indicate that the card is "Finessed". This will draw a special border around the card.
* A note of "cm" can be written to indicate that the card is "Chop Moved". This will draw a special border around the card.

#### Other Special Notes

* A note of "kt", "trash", "stale", or "bad" can be written to indicate that the card is "Trash". This will draw a special image on the card.
* A note of "fixme" can be be written to indicate that the card needs to be given a "fix clue" at some point in the future. This will draw a special image on the card.
* A note of "blank" can be written on a card to make it look like the deck back.
* A note of "unclued" can be written to manually remove the border that normally appears around a card when it is touched by one or more clues.

#### Note Shortcuts

* There are also some keyboard shortcuts for making notes:
  * Shift + Right-click --> f
    * "f" is a common abbreviation for "this card is *Finessed*".
    * This will also draw a special border around the card.
  * Alt + Right-click --> cm
    * "cm" is a common abbreviation for "this card is *Chop Moved*".
    * This will also draw a special border around the card.
  * Ctrl + Shift + Right-click --> [previously entered note]
    * If you need to put the same note on multiple cards, enter the note on the first card, and then use this hotkey on the rest of the cards.

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

* Each game has the option to be created as a speedrun. In speedruns, players attempt to beat the game as fast as possible (as a special challenge). The best speedrun times are tracked on the [Speedrun.com leaderboards](https://www.speedrun.com/hanabi).
* In a speedrun, the controls work differently and are optimized for faster play:
  * Left-clicking on a card in your hand will play it.
  * Right-clicking on a card in your hand hand will discard it.
  * Left-clicking on a card in your teammate's hand will give it a color clue.
  * Right-clicking on a card in your teammate's hand will give it a rank clue.
  * Empathy can still be used by Ctrl + Left-clicking.
* Speedrunning games will not count towards your statistics.
* If this mode is enabled, then the "Timed" option will be disabled.

#### Card Cycling

* Each game has the option to enable algorithmical card cycling.
* If enabled, whenever a player gives a clue, their oldest unclued card will be moved to their newest slot.
* This is a way to play Hanabi that is used by <a href="https://sites.google.com/view/iraci">Alessandro Iraci's</a> group from the <a href="https://www.sns.it/en">Scuola Normale Superiore di Pisa</a>.

#### Bottom Deck Blind Plays

* Each game has the option to allow a special "house" rule.
* If enabled, when there is 1 card left in the deck, players are allowed to blind play it.
* This is done by dragging the deck on to the play area.
* A golden border will appear around the deck when there is 1 card left in order to signify that this is possible.
* This feature can prevent losses that occur from being "bottom decked" by a 3 or a 4 that was impossible to save in the early or mid-game.

#### Empty Clues

* By default, it is not possible to give an "empty" clue, which is a clue that touches 0 cards.
* Each game has the option to allow empty clues.
* More information on the history of empty clues can be found in the [Hyphen-ated conventions repository](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Empty_Clues.md#history).

#### All or Nothing

* Each game has the option to play it as "All or Nothing", which changes the rules.
* In this mode, the game does not end when the final card is drawn, allowing players to continue playing as normal until all of the stacks are completed.
* The game immediately ends with a score of 0 if the team gets 3 strikes, as per normal.
* The game immediately ends with a score of 0 if a "critical" card is discarded. (Critical cards are cards that have not been played yet and have only one copy remaining.)
* The game immediately ends with a score of 0 if a player has no cards in their hand and no clue tokens are available.
* (This is the fourth [official variant](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Rules.md#multicolor-variants).)

#### Detrimental Character Assignments

* Each game has the option to enable "Detrimental Character Assignments". When enabled, it will restrict players in additional ways beyond the normal rules.
* The characters are loosly based on [this post](https://boardgamegeek.com/thread/1688194/hanabi-characters-variant) from Sean McCarthy on the Board Game Geek forums.
* More information on the characters are listed on [a separate page](https://github.com/Zamiell/hanabi-live/tree/master/docs/CHARACTERS.md).

#### Password-Protected Games

* Each game has the option to be created with a password.
* This allows private tables to be created.

<br />

## Other Options

#### Keldon Mode

* By default, the interface will look similar to the  [Board Game Arena](https://en.boardgamearena.com/) implementation of Hanabi, in which all of the hands are grouped together in rows.
* In Keldon mode, the hands are distributed around the table, similar to how it would look if you were playing Hanabi in real-life.

#### Color-Blind Mode

* Each player has the option to toggle a color-blind mode that will add a letter to each card that signifies which suit it is.

#### Real-Life Mode

* In real-life mode, cards will no longer be filled in with positive and negative clues.
* Furthermore, extra UI elements are turned off (8 clue warning, etc.).

#### Reverse Hand Direction

* Each player has the option to toggle a "reverse hand direction" option, in which the user interface will display the hand from right-to-left instead of from left-to-right.
* This is useful for players that are used to drawing cards from the right side instead of from the left.

#### Pre-Playing

* Each player has the option to enable the ability to pre-play cards, which is similar to "pre-moves" in Chess.
* Players can pre-play or pre-discard by clicking and dragging a card to the respective location and releasing the mouse button. Once done, the card will hover over the location until their turn has arrived, and then the action will be automatically performed.
* Once a card is pre-played or pre-discarded, it cannot be undone unless they go back to the lobby (or refresh the page).

#### Hyphen-ated Conventions

If you are playing with the <a href="https://github.com/Zamiell/hanabi-conventions">Hyphen-ated group</a>, some additional UI elements are enabled:

* Double discard situation notification
* Special sound effect when discarding in a double discard situation (not implemented yet)
* Special sound effect when discarding a clued card (not implemented yet)
* Special sound effect when playing a 1 out of order (not implemented yet)

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
  * Join the first game: `Alt + j`
  * Create a table: `Alt + c`
  * Show history: `Alt + h`
  * Watch a specific replay: `Alt + a`
  * Sign out: `Alt + o`
* In a pre-game:
  * Start a game: `Alt + s`
  * Return to the lobby: `Alt + r` or `Escape`
  * Leave the game: `Alt + l`
* In a game:
  * Play a card: `a` or `+` (will prompt for the slot number)
  * Discard a card: `d` or `-` (will prompt for the slot number)
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
* In a shared replay:
  * Toggle shared turns: `Up` or `Down`

<br />

## Similar Deals and Competitive Play

* Normally, when a game is started, the server will find a deal in the database (based on a seed) that none of the players have played before.
* If there were no old deals that matched this criteria, the server will generate a new random deal.
* After the game is completed, the "Other Scores" button on the game history screen will show other players who played the same deal, if any. You can even view the replay of other people's games to see how they played the deal.
* If two groups of Hanabi players want to compete against each other, then there are a few ways to play a non-randomly generated deal:
  * Start a game with a name of `!seed [seed]` to play a deal generated by that specific seed. For example: `!seed showmatch-jan-2050-game-1`
  * Start a game with a name of `!deal [deal]` to play a deal specified by a text file. The text file must already be present on the server in the `specific-deals` directory. If necessary, you can contact an administrator to upload a new text file. For example: `!deal showmatch-jan-2050-game-1`
  * Start a game with a name of `!replay [id] [turn]` to replay an existing game that is already located in the database. (Specifying the turn number is optional.)

<br />

## Chat

* The website offers a public lobby chat and a private per-game chat. When chatting with other players, please follow [the community guidelines](COMMUNITY_GUIDELINES.md).
* You can also send private messages to other players with the `/pm` command.
* You can type any emoji into chat using the [standard emoji shortcode](https://raw.githubusercontent.com/Zamiell/hanabi-live/master/public/js/src/data/emojis.json). For example, `:thinking:` will turn into 🤔.
* You can type any [Twitch emote](https://raw.githubusercontent.com/Zamiell/hanabi-live/master/public/js/src/data/emotes.json) into chat. For example, `Kappa` will turn into <img src="https://github.com/Zamiell/hanabi-live/raw/master/public/img/emotes/twitch/Kappa.png">. (Many BetterTwitchTV and FrankerFaceZ emotes are also supported.)
* There are various chat commands. The full list can be found [here](CHAT_COMMANDS.md).
* All lobby chat will be replicated to (and from) the [Hanabi Discord server](https://discord.gg/FADvkJp).

<br />

## Friends

* When there are a lot of users online and a lot of games going on, it can be cumbersome to find the people you care about. The website supports adding specific people to your friends list with the `/friend` command.
* Your friends will be listed alphabetically at the top of the user list.
* Games that contain one or more of your friends will be sorted at the top of the games list.
* If you have one or more friends, a "Show History of Friends" button will appear on the history screen.

<br />

## Tags

* Attaching notes to cards is useful for keeping track of things in the middle of a game. But what if you want to put a note on an entire game? That's where tags come in.
* By using the `/tag [tag]` command, you can attach arbitrary notes to a specific game so that you can more-easily find it later.
* For example, if you performed a massive *Quadruple Finesse*, then you could do a `/tag Quadruple Finesse`.
* You can have an unlimited amount of tags per game. Anyone can add a tag to a game, regardless of whether they played in it or not. Everyone's tags are shared.
* You can add tags during an ongoing game. The server will not reveal what the tag is to the other players (in order to avoid leaking information about the game).
* Tags added during a replay will echo the everyone in the replay.
* You can use the `/tagsearch [tag]` command to search through all games for a specific tag.

<br />

## Research & Bots

* The game of Hanabi has relevance to researchers in artificial intelligence:
  * In 1997, an artifical intelligence named [Deep Blue](https://en.wikipedia.org/wiki/Deep_Blue_(chess_computer)) defeated world-champion [Gary Kasparov](https://en.wikipedia.org/wiki/Garry_Kasparov) in [chess](https://en.wikipedia.org/wiki/Chess).
  * In 2011, an artificial intelligence named [Watson](https://en.wikipedia.org/wiki/Watson_(computer)) defeated world-champions [Brad Rutter](https://en.wikipedia.org/wiki/Brad_Rutter) and [Ken Jennings](https://en.wikipedia.org/wiki/Ken_Jennings) in [Jeopardy!](https://en.wikipedia.org/wiki/Jeopardy!)
  * In 2016, an artificial intelligence named [AlphaGo](https://en.wikipedia.org/wiki/AlphaGo) defeated world-champion [Lee Sedol](https://en.wikipedia.org/wiki/Lee_Sedol) in [Go](https://en.wikipedia.org/wiki/Go_(game)).
  * In 2019, [AI researchers proposed](https://arxiv.org/pdf/1902.00506.pdf) that the next challenge for the AI community should be Hanabi. If bots could successfully cooperate with one another (and cooperate with humans) by demonstrating a [theory of mind](https://en.wikipedia.org/wiki/Theory_of_mind), it would be an important leap forward.
* A game of Hanabi can be stored as a [JSON](https://www.json.org/json-en.html) object. The Hanabi community uses [the following format](https://raw.githubusercontent.com/Zamiell/hanabi-live/master/misc/example_game_with_comments.json) to specify a game.
* Hanabi Live supports watching arbitrary games from JSON files. Simply select "Watch Specific Replay" from the menu, select "JSON Data" as the source, and then paste in the JSON data.
* This is useful for researchers and bot-makers because you can take one of the games that your bot plays and then plug it into Hanabi Live in order to more-easily see what kinds of strategies that it is doing.
* It is also possible to program a bot to play on the website with other players. Unlike other websites such as [lichess.org](https://lichess.org/), there is no bot-specific API. Bots must connect to the WebSocket server and send messages in exactly the same way that a real player would. A reference bot implementation can be found [here](https://github.com/Zamiell/hanabi-live-bot).

### JSON Endpoints

* `/history/[username]?api` - Provides the history for Alice.
* `/seed/[seed]?api` - Provides all games played on the specified seed.
* `/export/[game ID]` - Provides the data for an arbitrary game from the database.

<br />
