# Variants

Hanabi Live is programmed by Hanabi enthusiasts who have played thousands of games. In order to keep the game fresh, the server allows you to create games using the variants mentioned in the [rules that come with the game](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Rules.md#multicolor-variants) as well as many other non-official custom variants. Players also have the ability to further custom a game by using a number of [custom game options](https://github.com/Zamiell/hanabi-live/blob/master/docs/FEATURES.md#custom-game-options).

The variant field on the "Create Game" tooltip is a search box; clear it of all text if you want to search for all variants.

<br />

## Quick Overview

Normal amount of cards per suit (e.g. 10 in total):

| *Touched by*       | No color clues | Own color clue | All color clues |
| ------------------ | -------------- | -------------- | --------------- |
| **No rank clues**  | Null           | Brown          | Muddy Rainbow   |
| **Own rank clue**  | White          | No Variant     | Rainbow         |
| **All rank clues** | Light Pink     | Pink           | Omni            |

One of each card per suit (e.g. 5 in total):

| *Touched by*       |  No color clues  | Own color clue | All color clues |
| ------------------ | ---------------- | -------------- | --------------- |
| **No rank clues**  | Dark Null        | Chocolate      | Cocoa Rainbow   |
| **Own rank clue**  | Gray             | Black          | Dark Rainbow    |
| **All rank clues** | Chiaroscuro Pink | Dark Pink      | Dark Omni       |

Special:

| Touched by        | Variant               |
| ----------------- | --------------------- |
| No clues          | Totally Blind         |
| No color clues    | Color Blind           |
| No rank clue      | Number Blind          |
| Suits share color | Ambiguous             |
| Colors share suit | Dual color            |
| All color clues   | Prism 1s (1s only)    |
| All rank clues    | Multi-Fives (5s only) |

<br />

## Detailed Rules per Variant

### No Variant

* This is the "base" game, with 5 suits. Unlike some real-life versions of the game, Hanabi Live uses the following five suit colors:
  * Blue
  * Green
  * Yellow
  * Red
  * Purple

### Six Suits

* A teal suit is added.
* It works identical to the other suits in that you can clue teal cards with teal clues.
* (This is the first [official variant](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Rules.md#multicolor-variants).)

### Four Suits

* The purple suit is removed.

### Three Suits

* The red and purple suits are removed.

### Black

* One of the suits is replaced with a black suit.
* It works similar to the other suits in that you can clue black cards with black clues.
* There is only one of each black card in the deck, which means that every black card is "critical".
* (This is the second [official variant](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Rules.md#multicolor-variants).)

### Rainbow

* One of the suits is replaced with a rainbow suit.
* All color clues will "touch" the rainbow suit.
* (This is the third [official variant](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Rules.md#multicolor-variants).)

### Pink

* One of the suits is replaced with a pink suit.
* All rank clues "touch" the pink suit.

### White

* One of the suits is replaced with a white suit.
* No color clues "touch" the white suit. (It is a colorless suit.)

### Brown

* One of the suits is replaced with a brown suit.
* No rank clues "touch" the brown suit.

### Omni

* One of the suits is replaced with an omni suit.
* All color clues and all rank clues "touch" the omni suit.

### Null

* One of the suits is replaced with a null suit.
* No clues "touch" the null suit.

### Dark Rainbow / Dark Pink / Gray / Chocolate / Dark Omni / Dark Null

* One of the suits is replaced with a "dark" version of a special suit. (Grey is the "dark" version of white and chocolate is the "dark" version of brown.)
* There is only one of each dark card in the deck, which means that every dark card is "critical".

### Muddy Rainbow

* One of the suits is replaced with a muddy rainbow suit.
* All color clues will "touch" the muddy rainbow suit.
* No rank clues will "touch" the muddy rainbow suit.

### Light Pink

* One of the suits is replaced with a light pink suit.
* All rank clues will "touch" the light pink suit.
* No color clues will "touch" the light pink suit.

### Cocoa Rainbow

* One of the suits is replaced with a cocoa rainbow suit.
* All color clues will "touch" the cocoa rainbow suit.
* No rank clues will "touch" the cocoa rainbow suit.
* There is only one of each cocoa rainbow card in the deck, which means that every cocoa rainbow card is "critical".

### Chiaroscuro Pink

* One of the suits is replaced with a chiaroscuro pink suit.
* All rank clues will "touch" the chiaroscuro pink suit.
* No color clues will "touch" the chiaroscuro pink suit.
* There is only one of each chiaroscuro pink card in the deck, which means that every chiaroscuro pink card is "critical".

### Ambiguous

* Two suits share a color. There is no way to disambiguate between them with color clues.

### Very Ambiguous

* Three suits share a color. There is no way to disambiguate between them with color clues.

### Extremely Ambiguous

* Four, five, or six suits share a color. There is no way to disambiguate between them with color clues.

### Dual-Color

* Each suit is touched by two separate colors.

### Prism-Ones

* Ones are "touched" by all color clues.

### Multi-Fives

* Fives are "touched" by all rank clues.
* Players cannot clue rank 5.

### Special Mix (5 Suits)

* This is a mix of several variants. The suits are as follows:
  1. Black (one of each)
  2. Rainbow (all colors)
  3. Pink (all ranks)
  4. White (colorless)
  5. Brown (rankless)

### Special Mix (6 Suits)

* This is a mix of several variants. The suits are as follows:
  1. Black (one of each)
  2. Rainbow (all colors)
  3. Pink (all ranks)
  4. White (colorless)
  5. Brown (rankless)
  6. Null (clueless)

### Ambiguous Mix

* This is a mix of several variants. The suits are as follows:
  1. Tomato (red)
  2. Mahogany (red)
  3. Sky (blue)
  4. Navy (blue)
  5. Black (one of each)
  6. White (colorless)

### Dual-Color Mix

* This is a mix of several variants. The suits are as follows:
  1. Green (blue / yellow)
  2. Purple (blue / red)
  3. Orange (yellow / red)
  4. Black (one of each)
  5. Rainbow (all colors)
  6. White (colorless)

### Ambiguous & Dual-Color Mix

* This is a mix of several variants. The suits are as follows:
  1. Lime (blue / yellow)
  2. Forest (blue / yellow)
  3. Orchid (blue / red)
  4. Violet (blue / red)
  5. Tangelo (yellow / red)
  6. Peach (yellow / red)

### Color Blind

* Color clues touch no suits. (Empty color clues are always allowed.)

### Number Blind

* Rank clues touch no suits. (Empty rank clues are always allowed.)

### Totally Blind

* Color clues and rank clues touch no suits. (Empty clues are always allowed.)

### Color Mute

* Color clues cannot be given.

### Number Mute

* Rank clues cannot be given.

### Alternating Clues

* The first clue of the game has no restrictions. After that, each successive clue must be the opposite type as the one prior.
* For example, if the first clue of the game is a color clue, then the second clue must be a number clue, the third clue must be a color clue, and so forth.
* This variant was invented by Jake Stiles.

### Clue Starved

* Each discard only generates 0.5 clues. (The team still starts with 8 clues.)

### Up or Down

* Two 1's are removed from each suit.
* One "START" card is added to each suit.
* When a stack is empty, you can play either a 1, a 5, or a START card on it.
* When a stack has a START card on it, you can play either a 2 or a 4 on it.
* If a stack was started with a 1 (or a START + 2), then it works as a normal stack.
* If a stack was started with a 5 (or a START + 4), then it must be completed in reverse.
* A clue token is given when a stack is completed, regardless of whether it is a normal stack or a reversed stack.
* This variant was invented by [Sean McCarthy on the BoardGameGeek forums](https://boardgamegeek.com/article/30863162).

### Cow & Pig

* When players give a clue, they point at the cards clued, but say "moo" if it a color clue and "oink" if it is a rank clue.

### Duck

* When players give a clue, they point at the cards clued, but say "quack" instead of a color or number.
* This variant was invented by Jack Gurev's group.

### Throw It in a Hole

* When players play a card, they do not flip it over like normal but instead place it face down in the center of the table.
* The score of the game is not revealed until the game is over.
* Players do not get a clue back for successfully playing a 5.
* The game will automatically end if 3 strikes are accumulated.
* This variant was invented by Jack Gurev's group.

<br />

## Full Variant Listing

* Normal
  * No Variant
  * Six Suits
  * Four Suits
  * Three Suits
* Black
  * Black (6 Suits)
  * Black (5 Suits)
* Rainbow
  * Rainbow (6 Suits)
  * Rainbow (5 Suits)
  * Rainbow (4 Suits)
  * Rainbow (3 Suits)
* Pink
  * Pink (6 Suits)
  * Pink (5 Suits)
  * Pink (4 Suits)
  * Pink (3 Suits)
* White
  * White (6 Suits)
  * White (5 Suits)
  * White (4 Suits)
  * White (3 Suits)
* Brown
  * Brown (6 Suits)
  * Brown (5 Suits)
  * Brown (4 Suits)
  * Brown (3 Suits)
* Omni
  * Omni (6 Suits)
  * Omni (5 Suits)
  * Omni (4 Suits)
  * Omni (3 Suits)
* Null
  * Null (6 Suits)
  * Null (5 Suits)
  * Null (4 Suits)
  * Null (3 Suits)
* Black & Rainbow
  * Black & Rainbow (6 Suits)
  * Black & Rainbow (5 Suits)
* Black & Pink
  * Black & Pink (6 Suits)
  * Black & Pink (5 Suits)
* Black & White
  * Black & White (6 Suits)
  * Black & White (5 Suits)
* Black & Brown
  * Black & Brown (6 Suits)
  * Black & Brown (5 Suits)
* Black & Omni
  * Black & Omni (6 Suits)
  * Black & Omni (5 Suits)
* Black & Null
  * Black & Null (6 Suits)
  * Black & Null (5 Suits)
* Rainbow & Pink
  * Rainbow & Pink (6 Suits)
  * Rainbow & Pink (5 Suits)
  * Rainbow & Pink (4 Suits)
  * Rainbow & Pink (3 Suits)
* Rainbow & White
  * Rainbow & White (6 Suits)
  * Rainbow & White (5 Suits)
  * Rainbow & White (4 Suits)
  * Rainbow & White (3 Suits)
* Rainbow & Brown
  * Rainbow & Brown (6 Suits)
  * Rainbow & Brown (5 Suits)
  * Rainbow & Brown (4 Suits)
  * Rainbow & Brown (3 Suits)
* Rainbow & Omni
  * Rainbow & Omni (6 Suits)
  * Rainbow & Omni (5 Suits)
  * Rainbow & Omni (4 Suits)
  * Rainbow & Omni (3 Suits)
* Rainbow & Null
  * Rainbow & Null (6 Suits)
  * Rainbow & Null (5 Suits)
  * Rainbow & Null (4 Suits)
  * Rainbow & Null (3 Suits)
* Pink & White
  * Pink & White (6 Suits)
  * Pink & White (5 Suits)
  * Pink & White (4 Suits)
  * Pink & White (3 Suits)
* Pink & Brown
  * Pink & Brown (6 Suits)
  * Pink & Brown (5 Suits)
  * Pink & Brown (4 Suits)
  * Pink & Brown (3 Suits)
* Pink & Omni
  * Pink & Omni (6 Suits)
  * Pink & Omni (5 Suits)
  * Pink & Omni (4 Suits)
  * Pink & Omni (3 Suits)
* Pink & Null
  * Pink & Null (6 Suits)
  * Pink & Null (5 Suits)
  * Pink & Null (4 Suits)
  * Pink & Null (3 Suits)
* White & Brown
  * White & Brown (6 Suits)
  * White & Brown (5 Suits)
  * White & Brown (4 Suits)
  * White & Brown (3 Suits)
* White & Omni
  * White & Omni (6 Suits)
  * White & Omni (5 Suits)
  * White & Omni (4 Suits)
  * White & Omni (3 Suits)
* White & Null
  * White & Null (6 Suits)
  * White & Null (5 Suits)
  * White & Null (4 Suits)
  * White & Null (3 Suits)
* Brown & Omni
  * Brown & Omni (6 Suits)
  * Brown & Omni (5 Suits)
  * Brown & Omni (4 Suits)
  * Brown & Omni (3 Suits)
* Brown & Null
  * Brown & Null (6 Suits)
  * Brown & Null (5 Suits)
  * Brown & Null (4 Suits)
  * Brown & Null (3 Suits)
* Omni & Null
  * Omni & Null (6 Suits)
  * Omni & Null (5 Suits)
  * Omni & Null (4 Suits)
  * Omni & Null (3 Suits)
* Dark Rainbow
  * Dark Rainbow (6 Suits)
  * Dark Rainbow (5 Suits)
  * Black & Dark Rainbow (6 Suits)
  * Pink & Dark Rainbow (6 Suits)
  * Pink & Dark Rainbow (5 Suits)
  * White & Dark Rainbow (6 Suits)
  * White & Dark Rainbow (5 Suits)
  * Brown & Dark Rainbow (6 Suits)
  * Brown & Dark Rainbow (5 Suits)
  * Omni & Dark Rainbow (6 Suits)
  * Omni & Dark Rainbow (5 Suits)
  * Null & Dark Rainbow (6 Suits)
  * Null & Dark Rainbow (5 Suits)
* Dark Pink
  * Dark Pink (6 Suits)
  * Dark Pink (5 Suits)
  * Black & Dark Pink (6 Suits)
  * Rainbow & Dark Pink (6 Suits)
  * Rainbow & Dark Pink (5 Suits)
  * White & Dark Pink (6 Suits)
  * White & Dark Pink (5 Suits)
  * Brown & Dark Pink (6 Suits)
  * Brown & Dark Pink (5 Suits)
  * Omni & Dark Pink (6 Suits)
  * Omni & Dark Pink (5 Suits)
  * Null & Dark Pink (6 Suits)
  * Null & Dark Pink (5 Suits)
* Gray
  * Gray (6 Suits)
  * Gray (5 Suits)
  * Black & Gray (6 Suits)
  * Rainbow & Gray (6 Suits)
  * Rainbow & Gray (5 Suits)
  * Pink & Gray (6 Suits)
  * Pink & Gray (5 Suits)
  * Brown & Gray (6 Suits)
  * Brown & Gray (5 Suits)
  * Omni & Gray (6 Suits)
  * Omni & Gray (5 Suits)
  * Null & Gray (6 Suits)
  * Null & Gray (5 Suits)
* Chocolate
  * Chocolate (6 Suits)
  * Chocolate (5 Suits)
  * Black & Chocolate (6 Suits)
  * Rainbow & Chocolate (6 Suits)
  * Rainbow & Chocolate (5 Suits)
  * Pink & Chocolate (6 Suits)
  * Pink & Chocolate (5 Suits)
  * White & Chocolate (6 Suits)
  * White & Chocolate (5 Suits)
  * Omni & Chocolate (6 Suits)
  * Omni & Chocolate (5 Suits)
  * Null & Chocolate (6 Suits)
  * Null & Chocolate (5 Suits)
* Dark Omni
  * Dark Omni (6 Suits)
  * Dark Omni (5 Suits)
  * Black & Dark Omni (6 Suits)
  * Rainbow & Dark Omni (6 Suits)
  * Rainbow & Dark Omni (5 Suits)
  * Pink & Dark Omni (6 Suits)
  * Pink & Dark Omni (5 Suits)
  * White & Dark Omni (6 Suits)
  * White & Dark Omni (5 Suits)
  * Brown & Dark Omni (6 Suits)
  * Brown & Dark Omni (5 Suits)
  * Null & Dark Omni (6 Suits)
  * Null & Dark Omni (5 Suits)
* Dark Null
  * Dark Null (6 Suits)
  * Dark Null (5 Suits)
  * Black & Dark Null (6 Suits)
  * Rainbow & Dark Null (6 Suits)
  * Rainbow & Dark Null (5 Suits)
  * Pink & Dark Null (6 Suits)
  * Pink & Dark Null (5 Suits)
  * White & Dark Null (6 Suits)
  * White & Dark Null (5 Suits)
  * Brown & Dark Null (6 Suits)
  * Brown & Dark Null (5 Suits)
  * Omni & Dark Null (6 Suits)
  * Omni & Dark Null (5 Suits)
* Dark Mixes
  * Dark Rainbow & Dark Pink (6 Suits)
  * Dark Rainbow & Gray (6 Suits)
  * Dark Rainbow & Chocolate (6 Suits)
  * Dark Rainbow & Dark Omni (6 Suits)
  * Dark Rainbow & Dark Null (6 Suits)
  * Dark Pink & Gray (6 Suits)
  * Dark Pink & Chocolate (6 Suits)
  * Dark Pink & Dark Omni (6 Suits)
  * Dark Pink & Dark Null (6 Suits)
  * Gray & Chocolate (6 Suits)
  * Gray & Dark Omni (6 Suits)
  * Gray & Dark Null (6 Suits)
  * Chocolate & Dark Omni (6 Suits)
  * Chocolate & Dark Null (6 Suits)
  * Dark Omni & Dark Null (6 Suits)
* Muddy Rainbow
  * Muddy Rainbow (6 Suits)
  * Muddy Rainbow (5 Suits)
  * Muddy Rainbow (4 Suits)
  * Muddy Rainbow (3 Suits)
* Light Pink
  * Light Pink (6 Suits)
  * Light Pink (5 Suits)
  * Light Pink (4 Suits)
  * Light Pink (3 Suits)
* Cocoa Rainbow
  * Cocoa Rainbow (6 Suits)
  * Cocoa Rainbow (5 Suits)
* Chiaroscuro Pink
  * Chiaroscuro Pink (6 Suits)
  * Chiaroscuro Pink (5 Suits)
* Ambiguous
  * Ambiguous (6 Suits)
  * Ambiguous (4 Suits)
  * Ambiguous & White (5 Suits)
  * Ambiguous & Rainbow (5 Suits)
  * Very Ambiguous (6 Suits)
  * Very Ambiguous (3 Suits)
  * Extremely Ambiguous (6 Suits)
  * Extremely Ambiguous (5 Suits)
  * Extremely Ambiguous (4 Suits)
* Dual-Color
  * Dual-Color (6 Suits)
  * Dual-Color (5 Suits)
  * Dual-Color (3 Suits)
  * Dual-Color & Rainbow (6 Suits)
  * Dual-Color & Rainbow (4 Suits)
* Mixed
  * Special Mix (5 Suits)
  * Special Mix (6 Suits)
  * Ambiguous Mix
  * Dual-Color Mix
  * Ambiguous & Dual-Color
* Prism-Ones
  * Prism-Ones (6 Suits)
  * Prism-Ones (5 Suits)
  * Prism-Ones (4 Suits)
  * Prism-Ones (3 Suits)
  * Prism-Ones & Pink (6 Suits)
  * Prism-Ones & Pink (5 Suits)
  * Prism-Ones & Pink (4 Suits)
  * Prism-Ones & Pink (3 Suits)
* Multi-Fives
  * Multi-Fives (6 Suits)
  * Multi-Fives (5 Suits)
  * Multi-Fives (4 Suits)
  * Multi-Fives (3 Suits)
  * Multi-Fives & Rainbow (6 Suits)
  * Multi-Fives & Rainbow (5 Suits)
  * Multi-Fives & Rainbow (4 Suits)
  * Multi-Fives & Rainbow (3 Suits)
* Prism-Ones & Multi-Fives
  * Prism-Ones & Multi-Fives (6 Suits)
  * Prism-Ones & Multi-Fives (5 Suits)
  * Prism-Ones & Multi-Fives (4 Suits)
  * Prism-Ones & Multi-Fives (3 Suits)
* Color Blind
  * Color Blind (6 Suits)
  * Color Blind (5 Suits)
  * Color Blind (4 Suits)
  * Color Blind (3 Suits)
* Number Blind
  * Number Blind (6 Suits)
  * Number Blind (5 Suits)
  * Number Blind (4 Suits)
  * Number Blind (3 Suits)
* Totally Blind
  * Totally Blind (6 Suits)
  * Totally Blind (5 Suits)
  * Totally Blind (4 Suits)
  * Totally Blind (3 Suits)
* Color Mute
  * Color Mute (6 Suits)
  * Color Mute (5 Suits)
  * Color Mute (4 Suits)
  * Color Mute (3 Suits)
* Number Mute
  * Number Mute (6 Suits)
  * Number Mute (5 Suits)
  * Number Mute (4 Suits)
  * Number Mute (3 Suits)
* Alternating Clues
  * Alternating Clues (6 Suits)
  * Alternating Clues (5 Suits)
  * Alternating Clues (4 Suits)
  * Alternating Clues (3 Suits)
* Clue Starved
  * Clue Starved (6 Suits)
  * Clue Starved (5 Suits)
  * Clue Starved (4 Suits)
* Up or Down
  * Up or Down (6 Suits)
  * Up or Down (5 Suits)
  * Up or Down & Rainbow (6 Suits)
  * Up or Down & Rainbow (5 Suits)
  * Up or Down & Pink (6 Suits)
  * Up or Down & Pink (5 Suits)
  * Up or Down & White (6 Suits)
  * Up or Down & White (5 Suits)
  * Up or Down & Brown (6 Suits)
  * Up or Down & Brown (5 Suits)
  * Up or Down & Omni (6 Suits)
  * Up or Down & Omni (5 Suits)
  * Up or Down & Null (6 Suits)
  * Up or Down & Null (5 Suits)
* Cow & Pig
  * Cow & Pig (6 Suits)
  * Cow & Pig (5 Suits)
  * Cow & Pig (4 Suits)
  * Cow & Pig (3 Suits)
* Duck
  * Duck (6 Suits)
  * Duck (5 Suits)
  * Duck (4 Suits)
  * Duck (3 Suits)
* Throw It in a Hole
  * Throw It in a Hole (6 Suits)
  * Throw It in a Hole (5 Suits)
  * Throw It in a Hole (4 Suits)
  * Throw It in a Hole (3 Suits)
