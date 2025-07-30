# The Hanab Live Manual & List of Features

This is the manual for [Hanab Live](https://hanab.live/).

Read through this page (or use [`Ctrl + f`](https://www.google.com/search?q=ctrl+%2B+f) on your keyboard) before asking any questions in the chat.

<br />

## Table of Contents

1. [Basic How-To](#basic-how-to)
1. [Major Features](#major-features)
1. [Custom Game Options](#custom-game-options)
1. [Other Options](#other-options)
1. [Notes](#notes)
1. [Sounds](#sounds)
1. [Pace & Efficiency](#pace--efficiency)
1. [Keyboard Shortcuts](#keyboard-shortcuts)
1. [Similar Deals and Competitive Play](#similar-deals-and-competitive-play)
1. [Chat](#chat)
1. [Friends](#friends)
1. [Linked Accounts](#linked-accounts)
1. [Tags](#tags)
1. [Website Endpoints](#website-endpoints)
1. [Research & Bots](#research--bots)
1. [Password Reset](#password-reset)
1. [Project History](#project-history)

<br />

## Basic How-To

- If you do not know how to play the game already, read [the rules](rules.md). For visual learners, you can also try watching [this video explanation](https://www.youtube.com/watch?v=VrFCekQb4nY).
- Getting a game going should be self-explanatory, but just in case:
  - Once logged in, click on the "Create Game" button on the top navigation bar and then click "Create".
  - For everyone else, the game will now appear in the list of games. To join it, they need to click on row corresponding to the game.
  - Then, the creator of the table needs to click on the "Start Game" button on the top navigation bar.
- Once inside a game, the UI elements are as follows:
  - The play stacks are on the left (one for each suit).
  - The player hands are on the right. Drawn cards are added to the left side of the hand.
  - You can tell whose turn it is by looking to see if a player's name is bolded.
  - In the top-right-hand corner is a clue log that will track every clue given over the course of the game.
  - In the middle-right is some statistics about how well the game is going.
  - In the bottom-left-hand corner is the deck, which shows how many cards are left in it.
  - In the bottom-right-hand corner is the discard pile.
  - To the left of the discard pile is the turn count, score, clue count, and strike count.
- To perform an action:
  - Play a card by clicking and dragging it to the play stacks.
  - Discard a card by clicking and dragging it to the discard pile.
  - Give a clue by:
    - Clicking on the button corresponding to the clue recipient.
    - Clicking on the button corresponding to the rank or the color.
    - Clicking on the "Give Clue" button.
- Once the game is over, use the "Lobby" button in the bottom-left-hand corner.

<br />

## Major Features

### Clue Indication

- Arrows indicate the cards that are touched by a clue.
  - A circle on the arrow shows the type of clue that was given.
  - Arrows with a white fill indicate that they are touching a "brand new" card (e.g. a card that has not been touched by any positive clues yet).
  - Arrows with a gray fill indicate that they are re-touching a card that has been previously touched by one or more positive clues.
- An orange border around a card signifies that it has been "touched" by one or more positive clues. The card will also be raised slightly.
- The game will keep track of the clues that accumulate on cards, "filling them in" when appropriate.
- You can hold down the left mouse button or tap and hold on someone else's hand to see how it appears to them. (This is referred to as "empathy".)

### Pips

- Suit pips (that represent the possible suits) and white numbers (that represent the possible ranks) will appear on cards in a player's hand.
- The pips and numbers will automatically disappear as positive clues and negative clues "touch" the card.
- The pips and numbers will automatically be crossed out if all the particular cards for that suit/rank are visible.

### Critical Indicator

A "❗" icon will appear on cards that are "critical". (Critical cards are cards that have not been played yet and have only one copy remaining.)

### Clue Log

- A clue log is shown in the top-right-hand corner.
- When the cursor is hovering over a card, the positive clues that have touched the card will turn white and the negative clues that have touched the card will turn red.
- You can click on an entry in the clue log to go to the turn when the clue was given.

### Termination

- Games will be automatically terminated by the server if no move is performed in 30 minutes. (This helps to clean the lobby of games that will never be finished.)
- Players can vote to terminate a game by clicking on the X button where the strike indicators are (near the bottom of the screen).

### Spectators

- All games have the ability to be spectated by others.
- Spectators will see all of the hands.
- The list of current spectators can be seen by hovering over the "👀" icon in the bottom-right-hand corner.
- Spectators can right-click on a player's name to view the game from their perspective. In ongoing games, this is indicated with a "🕵️" icon.

### In-Game Replay

- In the middle of a game, players can click on the arrow button in the bottom-left-hand corner to open the in-game replay feature.
- Using this feature, players can go back in time to see the exact game state at a specific turn.
- There are some helpful shortcuts for going to a specific turn:
  - You can Alt + click on a card to go to the turn it was drawn.
  - You can middle-click on a card go to the turn it was first positively clued.
  - You can click on a card in the play stacks to go to the turn before the card was played.
  - You can click on a card in the discard pile to go to the turn before the card was discarded.
  - You can click on an entry in the clue log to go to the turn when the clue was given.
  - You can click on the three strike squares to go to the turn before the strike happened, if any.
  - You can right-click on the "Turn" label to go to an arbitrary turn.

### Game History and Profiles

- After a game is completed, it will be recorded in the database.
- Players will be able to see their past games in the "Show History" screen.
- You can click on a player's name in the lobby to view their profile, which will show all of their past games and some extra statistics.

### Replays

- Any past game can be viewed as a replay or a shared replay.
- Similar to an in-game replay, in a post-game replay, you can review the game turn by turn.

### Shared Replays

- A shared replay is similar to a normal replay, but others can join to have a coordinated review session.
- At the end of each game, you will automatically be put into a shared replay with everyone who played the game.
- The leader controls what turn is being shown. By default, the leader will be the person who created the game or created the shared replay.
- Players can "break free" of what the leader is showing by clicking the "Pause Shared Turns" button, or by manually navigating to a different turn. To resynchronize with the team, they need to click on the "Use Shared Turns Button". (The up arrow and down arrow are also shortcuts for clicking on this button.)
- The leader can right-click on a card to highlight it with an arrow (to point out things to the other players).
  - Other players can create "local" arrows by Ctrl + right-clicking. These arrows won't be shown to anyone else.
- The current leader can be seen by hovering over the "👑" icon in the bottom right-hand corner.
- The leader role can be transferred by clicking or double-tapping the crown.

### Hypotheticals

- In a shared replay, the leader has the option to begin a hypothetical.
- In a hypothetical, the leader can perform actions for all of the players, playing the game forward for as long as desired.
- Hypotheticals are useful to show what would happen if a player decided to do a different move than they really did in the game.
- When a hypothetical is active, other players cannot "break free" or return to previous turns.
- The leader can Alt + right-click on a card to morph it into an arbitrary card. This can be useful for showing how players have to account for different kinds of situations or to create specific game states.

### In-Game Statistics

- Some statistics are shown on the right-hand side of the screen to show how well the game is going.
- More information about the stats can be found in [the Pace & Efficiency section](#pace--efficiency) below.

### 6-Player Games

- In 6-player games, only three cards are dealt to each player.

<br />

## Custom Game Options

- In a pre-game, the custom game options (if any) can be seen on the left side of the screen.
- In a game, the custom game (if any) can be seen by hovering over the deck.

<br />

### Variants

- The server implements several variants, which are listed on [a separate page](https://github.com/Hanabi-Live/hanabi-live/tree/main/docs/variants.md).

### Timed Games

- Each game has the option to be created with as a "Timed Game".
- Similar to chess, each player has a bank of time that decreases only during their turn.
- By default, each player starts with 2 minutes and adds 20 seconds to their clock after performing each move.
- If time runs out for any player, the game immediately ends and a score of 0 will be given.
- The player who goes first will be refunded the amount of time that it took for them to load the page.
- Players can pause (or queue a pause) by right-clicking on their timer.

### Speedruns

- Each game has the option to be created as a speedrun. In speedruns, players attempt to beat the game as fast as possible (as a special challenge). The best speedrun times are tracked on the [Speedrun.com leaderboards](https://www.speedrun.com/hanabi).
- In a speedrun, the controls work differently and are optimized for faster play:
  - Left-clicking on a card in your hand will play it.
  - Right-clicking on a card in your hand will discard it.
  - Left-clicking on a card in your teammate's hand will give it a color clue.
  - Right-clicking on a card in your teammate's hand will give it a rank clue.
  - Ctrl + right-clicking on a card in your hand opens a note on the card.
  - Empathy can still be used by holding down the space bar.
- Speedrunning games will not count towards your statistics.
- If this mode is enabled, then the "Timed" option will be disabled.

### Card Cycling

- Each game has the option to enable algorithmic card cycling.
- If enabled, whenever a player gives a clue, their oldest unclued card will be moved to their newest slot.
- This is a way to play that is used by [Alessandro Iraci's](https://sites.google.com/view/iraci) group from the [Scuola Normale Superiore di Pisa](https://www.sns.it/en).

### Bottom Deck Blind Plays

- Each game has the option to allow a special "house" rule.
- If enabled, when there is 1 card left in the deck, players are allowed to blind play it.
- This is done by dragging the deck on to the play area.
- A golden border will appear around the deck when there is 1 card left in order to signify that this is possible.
- This feature can prevent losses that occur from being "bottom decked" by a 3 or a 4 that was impossible to save in the early or mid-game.

### Empty Clues

- By default, it is not possible to give an "empty" clue, which is a clue that touches 0 cards.
- Each game has the option to allow empty clues.
- More information on the history of empty clues can be found in the [H-Group conventions repository](https://github.com/hanabi/hanabi.github.io/blob/main/misc/empty-clues.md#history).

### One Extra Card

- Each game has the option to play with one extra card dealt to each player at the start of the game.
- This can make the game easier with a low amount of players, but make the game harder with a high amount of players.

### One Less Card

- Each game has the option to play with one less card dealt to each player at the start of the game.
- This can make the game easier with a high amount of players, but make the game harder with a low amount of players.

### All or Nothing

- Each game has the option to play it as "All or Nothing", which changes the rules.
- In this mode, the game does not end when the final card is drawn, allowing players to continue playing as normal until all of the stacks are completed.
- The game immediately ends with a score of 0 if the team gets 3 strikes, as per normal.
- The game immediately ends with a score of 0 if a "critical" card is discarded. (Critical cards are cards that have not been played yet and have only one copy remaining.)
- The game immediately ends with a score of 0 if a player has no cards in their hand and no clue tokens are available.
- (This is the fourth [official variant](https://github.com/hanabi/hanabi.github.io/blob/main/misc/rules.md#multicolor-variants).)

### Detrimental Character Assignments

- Each game has the option to enable "Detrimental Character Assignments". When enabled, it will restrict players in additional ways beyond the normal rules.
- The characters are loosely based on [this post](https://boardgamegeek.com/thread/1688194/hanabi-characters-variant) from Sean McCarthy on the Board Game Geek forums.
- More information on the characters are listed on [a separate page](https://github.com/Hanabi-Live/hanabi-live/tree/main/docs/characters.md).

### Password-Protected Games

- Each game has the option to be created with a password.
- This allows private tables to be created.

<br />

## Other Options

### Keldon Mode

- By default, the interface will group all of the hands together in rows.
- In Keldon mode, the hands are distributed around the table, similar to how it would look if you were playing a card game in real-life.
- (This is named after [Keldon Jones](http://www.keldon.net/), since he is the person who originally created this mode and the UI more generally.)

### Color-Blind Mode

- Each player has the option to toggle a color-blind mode that will add a letter to each card that signifies which suit it is.

### Real-Life Mode

- In real-life mode, cards will no longer be filled in with positive and negative clues.
- Furthermore, extra UI elements are turned off (8 clue warning, etc.).

### Reverse Hand Direction

- Each player has the option to toggle a "reverse hand direction" option, in which the user interface will display the hand from right-to-left instead of from left-to-right.
- This is useful for players that are used to drawing cards from the right side instead of from the left.

### Pre-Playing

- Each player has the option to enable the ability to pre-play cards, which is similar to "pre-moves" in Chess.
- Players can pre-play or pre-discard by clicking and dragging a card to the respective location and releasing the mouse button. Once done, the card will hover over the location until their turn has arrived, and then the action will be automatically performed.

### H-Group Conventions

If you are playing with the [H-Group](https://hanabi.github.io/), some additional UI elements are enabled:

- an "H" indicator next to the username in the "Online Users" section.
- double discard situation notification (as a border around the discard pile and in the "Current Player" area)
- a blue question mark drawn on cards potentially in a double discard situation based on the empathy of the card
- locked hand notification (in the "Current Player" area)
- _Low Score Phase_ notification (via the score being cyan)
- a [special sound effect when discarding a clued card](../public/sounds/turn-discard-clued.mp3)
- a [special sound effect when discarding to enter a double discard situation](../public/sounds/turn-double_discard-cause.mp3)
- a [special sound effect when discarding in a double discard situation](../public/sounds/turn-double-discard.mp3)
- a [special sound effect when playing a 1 out of order](../public/sounds/turn-order-chop-move.mp3)

<br />

## Notes

### Basic Description

- When in the middle of an ongoing game, players can right-click or double-tap on any card to add a note to it. Afterward, by hovering over a card, a tooltip will appear with the written note.
- This is useful for storing contextual information about a card for later. (e.g. "they should know that this card is exactly red 2 from the clue on turn 3")
- Notes can also be written during an in-game replay as a way to track a card as it moves throughout your hand.
- Since notes are tracked by the server, players can switch computers mid-game and keep any notes written.
- Notes are saved in the database and will persist into the replay.
- Everyone's notes are combined and shown to spectators, which is fun to see.

### Card Identity Notes

- If the note matches the name of a card (e.g. "red 1", "r1", etc.), the card face will change to match.
  - The new card face will automatically be deactivated if a clue is received that falsifies the note.
- If this behavior is undesired, append a question mark to the end of your note. (e.g. "r1?")

| Suit Name       | Abbreviation                                   |
| --------------- | ---------------------------------------------- |
| Black           | K                                              |
| Rainbow         | M                                              |
| Muddy Rainbow   | M                                              |
| Pink            | I                                              |
| Light Pink      | I                                              |
| Brown           | N                                              |
| Omni            | O                                              |
| Null            | U                                              |
| Prism           | I                                              |
| [any dark suit] | [the same as the "normal" version of the suit] |
| Gray            | A                                              |
| Forest          | R                                              |

- If there are two suits with the same abbreviation, the second suit abbreviation will be changed to be the left-most unused letter.
  - For example, in "Rainbow & Muddy Rainbow (6 Suits)", muddy rainbow will have an abbreviation of "U".

### Card Partial Identity Notes

- If you do not know the exact identity of a card, but you do have it narrowed it down to a few possibilities, then you can also express that as a note on the card.
- List all the possibilities separated by commas.
- For example, a note of "r2, r3" on a red card will tell the game that "even though this card only has a red clue and nothing else, represent it as having a negative 1 clue, a negative 4 clue, and a negative 5 clue".
- You can also remove card possibilities with an exclamation point.
- For example, a note of "!r2" will remove the possibility of that card being the red 2.

### Special Note Borders

- A note of "f" can be written to indicate that the card is _Finessed_. This will draw a special border around the card.
- A note of "cm" can be written to indicate that the card is _Chop Moved_. This will draw a special border around the card.

### Other Special Notes

- A note of "kt", "trash", "stale", or "bad" can be written to indicate that the card is "Trash". This will draw a special image on the card.
- A note of "fix", "fixme", or "needs fix" can be written to indicate that the card needs to be given a "Fix Clue" at some point in the future. This will draw a special image on the card.
- A note of "?" can be written to indicate that the card have uncertain information written on it. This will draw a special image on the card.
- A note of "!" can be written to indicate that the card have certain information written on it. This will draw a special image on the card.
- A note of "blank" can be written on a card to make it look like the deck back.
- A note of "unclued" or "x" can be written to manually remove the border that normally appears around a card when it is touched by one or more clues.
- A note of "clued" can be written to manually raise a card and add the border that normally appear on a card when it is touched by one or more clues.

### Adding Context to Special Notes

- If you want to keep the behavior of a special note but write additional text on the note, place the special note in square brackets. (e.g. "[r2] known from turn 3")
- This feature can also be used to stack multiple effects on top of each other. (e.g. "[r1] [f]" will mark a card as both a red 1 and having the _Finesse_ border)

### Note Shortcuts

There are also some keyboard shortcuts for making notes:

- Shift + right-click --> [f]
- Alt + right-click --> [cm]
- Ctrl + alt + right-click --> Insert turn count
- Ctrl + shift + right-click --> Repeat the previously entered note
  - If you need to put the same note on multiple cards, enter the note on the first card, and then use this hotkey on the rest of the cards.
- Ctrl + shift + alt + right-click --> [kt]
- Hover + delete --> Deletes the note on the card cursor is pointed at

<br />

## Sounds

There are different sounds for:

- [when a player takes an action](../public/sounds/turn-other.mp3)
- [when it reaches your turn](../public/sounds/turn-us.mp3)
- [when a card fails to play](../public/sounds/turn-fail1.mp3)
- [when two cards fail to play in a row](../public/sounds/turn-fail2.mp3)
- [when a card blind-plays](../public/sounds/turn-blind1.mp3)
- [when multiple cards blind-play in a row (up to 6)](../public/sounds/turn-blind2.mp3)
- [discarding a "critical" card](../public/sounds/turn-sad.mp3)
- [finishing the game with a score of 0](../public/sounds/turn-finished-fail.mp3)
- [finishing the game with a non-perfect score](../public/sounds/turn-finished-success.mp3)
- [finishing the game with a perfect score](../public/sounds/turn-finished-perfect.mp3)

<br />

## Pace & Efficiency

In-game, the right side of the screen shows the _Pace_ and the _Efficiency_ for the current game. Good players will often use these numbers to make the best move for the current situation.

### Pace

- You can think of the game as a race to play all of the cards before the deck runs out. It is useful to track how close to the end of the race you are.
- Pace is a measure of the amount of discards that can happen while still having a chance to get the maximum score.
- Pace is calculated with the following formula:
  - `current score + cards in deck + number of players - maximum score`.
- If you discard all copies of a card (so that the maximum achievable score lowers), pace will adjust accordingly.
- At pace 0, the only way to get the maximum score is if every player plays a card in the last round of the game.

### Efficiency

- Since the game only gives you a limited amount of clues, you should be as efficient as possible with them. It is useful to track how well the team is doing with regards to this.
- In general, efficiency is calculated with the following formula:
  - `cards gotten / number of clues given or lost`
  - `cards gotten` is simply `cards that are already played + cards that are touched by a clue`.
- A clue is considered to be lost when:
  - a card misplays (because it could have been discarded instead)
  - a stack is completed when the team already has 8 clues in the bank
- Note that this efficiency calculation assumes that players are playing with _Good Touch Principle_ - that all clued cards will eventually be played. If your team does not play with _Good Touch Principle_, then this efficiency calculation won't be very useful.
- Note that the calculation will automatically account for clued cards that are globally known to be trash. Such cards will not be included in the `cards gotten` term.
- In-game, Hanabi Live shows you two different efficiency numbers.

#### 1) Future Required Efficiency

- The left number shows the efficiency needed to get the maximum score based on how well things are going so far. This is calculated with the following formula:
  - `cards not gotten yet / maximum clues that it is possible to give before the game ends`
  - `cards not gotten yet` is simply `maximum possible score - cards gotten`.
- Players can mouse over the _Future Required Efficiency_ number in order to see how it is being calculated.

#### 2) Minimum Required Efficiency

- The right number shows the minimum possible efficiency needed to get a maximum score from the very beginning of the game.
- This is simply the _Future Required Efficiency_ before anyone on the team has taken any actions.
- Note that _Minimum Required Efficiency_ is calculated at the beginning of the game and will not change in the middle of the game if the maximum achievable score lowers.

#### Manually Modifying Efficiency

- Players can manually modify the "cards gotten" term by doing an `alt + right-click` on the _Future Required Efficiency_.
- This is useful to account for cards that are _Finessed_, cards that are known to be trash, and so forth.

#### A Guide to Using Efficiency in General

- If the _Future Required Efficiency_ is below the _Minimum Required Efficiency_, then:
  - The team is on track to get a perfect score.
  - Future clues do not necessarily have to be as efficient as the ones previously given.
  - The team can probably afford to give mediocre clues and play conservatively.
- If the _Future Required Efficiency_ is above the _Minimum Required Efficiency_, then:
  - The team is not on track to get a perfect score.
  - If a perfect score is desired, the team must start giving more efficient clues than the ones that have already been given.
  - If a perfect score is desired, the team should start to discard more aggressively, take more risks, etc.

#### A Guide to Using Efficiency as a Threshold

- Commonly, a player will have to choose between doing a 1-for-1 clue and discarding. (A "1-for-1" clue is defined as a clue that "gets" 1 card.)
- If _Future Required Efficiency_ is below 1.00:
  - That means everyone on the team can simply give "1-for-1" clues for the rest of the game and the team will still get the max score.
  - Thus, a player in this situation should probably give a 1-for-1 clue and let someone else discard (if the other person has a known-safe discard).
- If _Future Required Efficiency_ is above 1.00:
  - That means that if everyone on the team gave 1-for-1 clues for the rest of the game, the clues would run out before all of the cards could be played, and a max score would not be achieved.
  - Thus, a player in this situation should probably discard and in that hopes that a teammate can perform a 2-for-1 clue.

<br />

## Keyboard Shortcuts

- In the lobby:
  - Join the first game: `Alt + j`
  - Create a table: `Alt + c`
  - Show history: `Alt + h`
  - Watch a specific replay: `Alt + a`
  - Sign out: `Alt + o`
- In a pre-game:
  - Start a game: `Alt + s`
  - Return to the lobby: `Alt + r` or `Escape`
  - Leave the game: `Alt + l`
- In a game:
  - Play a card: `a` or `+` (will prompt for the slot number)
  - Discard a card: `d` or `-` (will prompt for the slot number)
  - Clue:
    - `Tab` to select a player
    - `1`, `2`, `3`, `4`, `5` for a rank clue
    - Or `q`, `w`, `e`, `r`, `t` for a color clue
    - Then `Ctrl + Enter` to submit
- In a replay:
  - Rewind back one turn: `Left`
  - Fast-forward one turn: `Right`
  - Rewind one full rotation: `[`
  - Fast-forward one full rotation: `]`
  - Go to the beginning: `Home`
  - Go to the end: `End`
- In a shared replay:
  - Toggle shared turns: `Up` or `Down`
  - Suggest turn to leader: `/suggest [turn #]`
- In a game or replay:
  - Open/close chat window: `Alt + c` 



<br />

## Similar Deals and Competitive Play

- A "deal" is defined as the order that the cards are dealt to all of the players.
- Normally, when a game is started, the server will find a deal in the database (based on a seed) that none of the players have played before.
- If there were no old deals that matched these criteria, the server will generate a new random deal.
- After the game is completed, the "Other Scores" button on the game history screen will show other players who played the same deal, if any. You can even view the replay of other people's games to see how they played the deal.
- When inside of a replay, you can mouse over the deck to get a popup that contains the seed that the deal was based on. For example, the seed might be: `p3v2070s5`
- The seed that is assigned to a game is based on the number of players in the game and the variant. For example, in the seed `p3v2070s5`:
  - The "p3" part means that it is a 3-player game.
  - The "v2070" part means that it is variant number 2070, which in this case is "Valentine Mix (6 Suit)". (Variant number 0 would be equal to no variant.)
  - The "s5" part means that it is seed 5. In other words, it is the 5th generated deal for this player number and variant combination.
- You can force the server to give you a specific deal by entering a specific game name. This is useful for competitive play (e.g. if two groups of players want to compete against each other).
- The first way to guarantee a specific deal is by starting the game with a name of: `!seed [seed]`
  - For example, say that a group wanted to play a deal that another group had already played. So, they went into the replay for the existing game, and moused over the deck, and saw that the seed was `p3v0s123`. Thus, they knew that this game was the 123rd seed for this player and variant combination. So, they created a game with the appropriate player count & variant, using a name of `!seed 123`.
  - For example, say that two groups wanted to play a brand new deal that had never been played before. So, they each created a game with the same player count & variant, using a name of `!seed showmatch-jan-2050-game-1`. (In this case, they were playing a 3-player game of no variant, so resulting full seed for the game was `p3v0sshowmatch-jan-2050-game-1`.)
- Additionally, you can start a game that will be a partial replay of an existing game. For example, this is useful if you want to see how a game would play out if a different move was taken. The format for this is to use a name of `!replay [id] [turn]`. Specifying the turn number is optional; if omitted, the game will start on the first turn.

<br />

## Chat

- The website offers a public lobby chat and a private per-game chat. When chatting with other players, please follow [the community guidelines](community-guidelines.md).
- You can also send private messages to other players with the `/pm` command.
- You can type any emoji into chat using the [standard emoji short-code](https://raw.githubusercontent.com/Hanabi-Live/hanabi-live/main/packages/client/src/json/emojis.json). For example, `:thinking:` will turn into 🤔.
- You can type any [Twitch emote](https://raw.githubusercontent.com/Hanabi-Live/hanabi-live/main/packages/client/src/json/emotes.json) into chat. For example, `Kappa` will turn into <img alt="Kappa" src="https://github.com/Hanabi-Live/hanabi-live/raw/main/public/img/emotes/twitch/Kappa.png">. (Many BetterTwitchTV and FrankerFaceZ emotes are also supported.)
- There are various chat commands. The full list can be found [here](chat-commands.md).
- All lobby chat will be replicated to (and from) the [Discord server](https://discord.gg/FADvkJp).
- During an ongoing game, right-clicking the chat button will mute notifications from chat and hide the spectator count ("zen mode", indicated by ☯️). Right-clicking again reverts this.

<br />

## Friends

- When there are a lot of users online and a lot of games going on, it can be cumbersome to find the people you care about. The website supports adding specific people to your friends list with the `/friend` command. (e.g. `/friend Alice` to add Alice)
- Your friends will be listed alphabetically at the top of the user list.
- Games that contain one or more of your friends will be sorted at the top of the games list.
- If you have one or more friends, a "Show History of Friends" button will appear on the history screen.

## Linked Accounts

- If you play on multiple accounts, then you might see the same deals (e.g. seeds), since deals are only unique per user. If this is not desired, the website supports linking accounts by using the `/link` command. For example, if Alice had an alternate account of Alice1, then she would type `/link Alice1` while logged into Alice.
- When determining a deal for a new game, the server will ensure that a deal is unique for all of the players at the table and all of the linked accounts of those players.
- Linking is not necessarily for accounts that you own. For example, if you spectate someone's else game and want to ensure that you never see that seed, then you can also link yourself to one of the player's in that group, which would prevent you from ever getting that seed in your own games.
- Linking is asymmetric. In other words, if Alice links to Bob, she will not receive any of Bob's seeds, but Bob might still receive seeds that Alice has played. This way, each user is in control of their own seed selection.

<br />

## Tags

- Attaching notes to cards is useful for keeping track of things in the middle of a game. But what if you want to put a note on an entire game? That's where tags come in.
- By using the `/tag [tag]` command, you can attach arbitrary notes to a specific game so that you can more-easily find it later.
- For example, if you performed a massive _Quadruple Finesse_, then you could do a `/tag Quadruple Finesse`.
- You can have an unlimited amount of tags per game. Anyone can add a tag to a game, regardless of whether they played in it or not. Everyone's tags are shared.
- You can add tags during an ongoing game. The server will not reveal what the tag is to the other players (in order to avoid leaking information about the game).
- Tags added during a replay will echo to everyone in the replay.
- You can use the `/tagdelete [tag]` command to delete an existing tag, or `/tagsdeleteall` to delete all your tags in that game.
- You can use the `/tagsearch [tag]` command to search through all games for a specific tag.

<br />

## Website Endpoints

- As mentioned previously, the website offers pages to show statistics on specific players, variants, and so forth.

| URL                                                | Description                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/scores/[username]`                               | Lists the player's profile and best scores.                                                     |
| `/history/[username]`                              | Lists the player's past games.                                                                  |
| `/history/[username1]/[username2]`                 | Lists the past games that 2 players were in together. (You can specify up to 6 players.)        |
| `/missing-scores/[username]`                       | Lists the player's remaining non-max scores.                                                    |
| `/shared-missing-scores/2/[username1]/[username2]` | Lists the remaining non-max scores that 2 players both need. (You can specify up to 6 players.) |
| `/tags/[username]`                                 | Lists the player's tagged games.                                                                |
| `/seed/[seed]`                                     | Lists the games played on a specific seed.                                                      |
| `/stats`                                           | Lists stats for the entire website.                                                             |
| `/variant/[id]`                                    | Lists stats for a specific variant.                                                             |
| `/tag/[tag]`                                       | Lists all the games that match the specified tag.                                               |

<br />

## Research & Bots

- A game can be stored as a [JSON](https://www.json.org/json-en.html) object. The community uses [the following format](https://raw.githubusercontent.com/Hanabi-Live/hanabi-live/main/misc/example_game_with_comments.jsonc) to specify a game.
- The website supports watching arbitrary games from JSON files. Simply select "Watch Specific Replay" from the menu, select "JSON Data" as the source, and then paste in the JSON data.
- This is useful for researchers and bot-makers because you can take one of the games that your bot plays and then plug it into the website in order to more-easily see what kinds of strategies that it is doing.
- It is also possible to program a bot to play on the website with other players. Unlike other websites such as [lichess.org](https://lichess.org/), there is no bot-specific API. Bots must connect to the WebSocket server and send messages in exactly the same way that a real player would. A reference bot implementation can be found [here](https://github.com/Hanabi-Live/hanabi-live-bot).

### JSON Endpoints

| URL                                           | Description                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/export/[game ID]`                           | Provides the data for an arbitrary game from the database.                                                  |
| `/api/v1/variants`                            | Displays a list of variants and their IDs.                                                                  |
| `/api/v1/variants-full`                       | Displays a list of variants information and their IDs.                                                      |
| `/api/v1/variants/[variant ID]`               | Displays a paginated list of games played in that specific variant.                                         |
| `/api/v1/history/[username]`                  | Lists a paginated list of the player's past games.                                                          |
| `/api/v1/history/[username]/[username2]`      | Lists a paginated list of past games where the players were in together. (You can specify up to 6 players.) |
| `/api/v1/history-full/[username]`             | Lists all the player's past games.                                                                          |
| `/api/v1/history-full/[username]/[username2]` | Lists all the past games that 2 players were in together. (You can specify up to 6 players.)                |
| `/api/v1/seed/[seed]`                         | Lists paginated games played on a specific seed.                                                            |
| `/api/v1/seed-full/[seed]`                    | Lists all the games played on a specific seed.                                                              |

Notes:
The following query parameters can be used by adding a `?` at the end of the URL (e.g. `/api/v1/variants/1?size=50&page=2`):

| Group | Parameter | Type    | Explanation                             | Values                    |
| ----- | --------- | ------- | --------------------------------------- | ------------------------- |
| 1     | size      | integer | controls the number of results          | 0 to 100                  |
| 1     | page      | integer | displays a specific page of the results | 0 to ...                  |
| 1     | col[x]    | integer | sorts by column x (0, 1, ...)           | 0 ascending, 1 descending |
| 1     | fcol[x]   | string  | filters by column x (0, 1, ...)         | filter value              |
| 2     | start     | integer | sets the starting ID of the data        | ...                       |
| 2     | end       | integer | sets the ending ID of the data          | ...                       |

<br />

## Password Reset

If you need to reset your password, visit [this page](https://hanab.live/password-reset) to learn more.

<br />

## Project History

The Hanab Live website was released in October 2017 by Zamiel as an attempt to emulate [Keldon Jones'](http://keldon.net/) excellent implementation of the game (which is now deleted). Since then, many new features have been added and the code is vastly different.

Development on the site continues to the present day. There have been many helpful contributions from various community members. If you can code, [you are welcome to help us](https://github.com/Hanabi-Live/hanabi-live/blob/main/CONTRIBUTING.md).

<br />
