# Variants

Hanabi Live is programmed by Hanabi enthusiasts who have played thousands of games. In order to keep the game fresh, the server allows you to create games using the variants mentioned in the [rules that come with the game](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Rules.md#multicolor-variants) as well as many other non-official custom variants. Players also have the ability to further custom a game by using a number of [custom game options](https://github.com/Zamiell/hanabi-live/blob/master/docs/FEATURES.md#custom-game-options).

The variant field on the "Create Game" tooltip is a search box; clear it of all text if you want to search for all variants.

<br />

## A Quick Overview of Special Suits

Normal amount of cards per suit (e.g. 10 in total):

| Touched by         | No color clues | Own color clue | All color clues |
| ------------------ | -------------- | -------------- | --------------- |
| No rank clues      | Null           | Brown          | Muddy Rainbow   |
| Own rank clue      | White          | No Variant     | Rainbow         |
| All rank clues     | Light Pink     | Pink           | Omni            |

One of each card per suit (e.g. 5 in total):

| Touched by         |  No color clues  | Own color clue | All color clues |
| ------------------ | ---------------- | -------------- | --------------- |
| No rank clues      | Dark Null        | Dark Brown     | Cocoa Rainbow   |
| Own rank clue      | Gray             | Black          | Dark Rainbow    |
| All rank clues     | Gray Pink        | Dark Pink      | Dark Omni       |

Special:

| Touched by        | Variant               |
| ----------------- | --------------------- |
| No clues          | Totally Blind         |
| No color clues    | Color Blind           |
| No rank clue      | Number Blind          |
| Suits share color | Ambiguous             |
| Colors share suit | Dual color            |

<br />

## Detailed Rules per Variant

### No Variant

* This is the "normal" game, with 5 suits. Unlike some real-life versions of the game, Hanabi Live uses the following five suit colors:
  * Blue
  * Green
  * Yellow
  * Red
  * Purple

### 6 Suits

* A teal suit is added.
* It works identical to the other suits in that you can clue teal cards with teal clues.
* (This is the first [official variant](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Rules.md#multicolor-variants).)

### 4 Suits

* The purple suit is removed.

### 3 Suits

* The yellow and purple suits are removed.

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

### Dark Rainbow / Dark Pink / Gray / Dark Brown / Dark Omni / Dark Null

* One of the suits is replaced with a "dark" version of a special suit. (Grey is the "dark" version of white.)
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

### Gray Pink

* One of the suits is replaced with a gray pink suit.
* All rank clues will "touch" the gray pink suit.
* No color clues will "touch" the gray pink suit.
* There is only one of each gray pink card in the deck, which means that every gray pink card is "critical".

### Ambiguous

* Two suits share a color. There is no way to disambiguate between them with color clues.

### Very Ambiguous

* Three suits share a color. There is no way to disambiguate between them with color clues.

### Extremely Ambiguous

* Four, five, or six suits share a color. There is no way to disambiguate between them with color clues.

### Dual-Color

* Each suit is touched by two separate colors.

### Rainbow-Ones, Pink-Ones, White-Ones, etc.

* Ones have the property of the suit prefix. For example, rainbow-ones are "touched" by all colors.

### Rainbow-Fives, Pink-Fives, White-Fives, etc.

* Fives have the property of the suit prefix. For example, rainbow-fives are "touched" by all colors.

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
  * 6 Suits
  * 4 Suits
  * 3 Suits
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
* Black & Muddy Rainbow
  * Black & Muddy Rainbow (6 Suit)
  * Black & Muddy Rainbow (5 Suit)
* Black & Light Pink
  * Black & Light Pink (6 Suits)
  * Black & Light Pink (5 Suits)
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
* Rainbow & Light Pink
  * Rainbow & Light Pink (6 Suits)
  * Rainbow & Light Pink (5 Suits)
  * Rainbow & Light Pink (4 Suits)
  * Rainbow & Light Pink (3 Suits)
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
* Pink & Muddy Rainbow
  * Pink & Muddy Rainbow (6 Suit)
  * Pink & Muddy Rainbow (5 Suit)
  * Pink & Muddy Rainbow (4 Suit)
  * Pink & Muddy Rainbow (3 Suit)
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
* White & Muddy Rainbow
  * White & Muddy Rainbow (6 Suit)
  * White & Muddy Rainbow (5 Suit)
  * White & Muddy Rainbow (4 Suit)
  * White & Muddy Rainbow (3 Suit)
* White & Light Pink
  * White & Light Pink (6 Suits)
  * White & Light Pink (5 Suits)
  * White & Light Pink (4 Suits)
  * White & Light Pink (3 Suits)
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
* Brown & Muddy Rainbow
  * Brown & Muddy Rainbow (6 Suit)
  * Brown & Muddy Rainbow (5 Suit)
  * Brown & Muddy Rainbow (4 Suit)
  * Brown & Muddy Rainbow (3 Suit)
* Brown & Light Pink
  * Brown & Light Pink (6 Suits)
  * Brown & Light Pink (5 Suits)
  * Brown & Light Pink (4 Suits)
  * Brown & Light Pink (3 Suits)
* Omni & Null
  * Omni & Null (6 Suits)
  * Omni & Null (5 Suits)
  * Omni & Null (4 Suits)
  * Omni & Null (3 Suits)
* Omni & Muddy Rainbow
  * Omni & Muddy Rainbow (6 Suit)
  * Omni & Muddy Rainbow (5 Suit)
  * Omni & Muddy Rainbow (4 Suit)
  * Omni & Muddy Rainbow (3 Suit)
* Omni & Light Pink
  * Omni & Light Pink (6 Suits)
  * Omni & Light Pink (5 Suits)
  * Omni & Light Pink (4 Suits)
  * Omni & Light Pink (3 Suits)
* Null & Muddy Rainbow
  * Null & Muddy Rainbow (6 Suit)
  * Null & Muddy Rainbow (5 Suit)
  * Null & Muddy Rainbow (4 Suit)
  * Null & Muddy Rainbow (3 Suit)
* Null & Light Pink
  * Null & Light Pink (6 Suits)
  * Null & Light Pink (5 Suits)
  * Null & Light Pink (4 Suits)
  * Null & Light Pink (3 Suits)
* Muddy Rainbow & Light Pink
  * Muddy Rainbow & Light Pink (6 Suits)
  * Muddy Rainbow & Light Pink (5 Suits)
  * Muddy Rainbow & Light Pink (4 Suits)
  * Muddy Rainbow & Light Pink (3 Suits)
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
  * Light Pink & Dark Rainbow (6 Suits)
  * Light Pink & Dark Rainbow (5 Suits)
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
  * Muddy Rainbow & Dark Pink (6 Suits)
  * Muddy Rainbow & Dark Pink (5 Suits)
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
  * Muddy Rainbow & Gray (6 Suits)
  * Muddy Rainbow & Gray (5 Suits)
  * Light Pink & Gray (6 Suits)
  * Light Pink & Gray (5 Suits)
* Dark Brown
  * Dark Brown (6 Suits)
  * Dark Brown (5 Suits)
  * Black & Dark Brown (6 Suits)
  * Rainbow & Dark Brown (6 Suits)
  * Rainbow & Dark Brown (5 Suits)
  * Pink & Dark Brown (6 Suits)
  * Pink & Dark Brown (5 Suits)
  * White & Dark Brown (6 Suits)
  * White & Dark Brown (5 Suits)
  * Omni & Dark Brown (6 Suits)
  * Omni & Dark Brown (5 Suits)
  * Null & Dark Brown (6 Suits)
  * Null & Dark Brown (5 Suits)
  * Muddy Rainbow & Dark Brown (6 Suits)
  * Muddy Rainbow & Dark Brown (5 Suits)
  * Light Pink & Dark Brown (6 Suits)
  * Light Pink & Dark Brown (5 Suits)
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
  * Muddy Rainbow & Dark Omni (6 Suits)
  * Muddy Rainbow & Dark Omni (5 Suits)
  * Light Pink & Dark Omni (6 Suits)
  * Light Pink & Dark Omni (5 Suits)
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
  * Muddy Rainbow & Dark Null (6 Suits)
  * Muddy Rainbow & Dark Null (5 Suits)
  * Light Pink & Dark Null (6 Suits)
  * Light Pink & Dark Null (5 Suits)
* Cocoa Rainbow
  * Cocoa Rainbow (6 Suits)
  * Cocoa Rainbow (5 Suits)
  * Pink & Cocoa Rainbow (6 Suits)
  * Pink & Cocoa Rainbow (5 Suits)
  * White & Cocoa Rainbow (6 Suits)
  * White & Cocoa Rainbow (5 Suits)
  * Brown & Cocoa Rainbow (6 Suits)
  * Brown & Cocoa Rainbow (5 Suits)
  * Omni & Cocoa Rainbow (6 Suits)
  * Omni & Cocoa Rainbow (5 Suits)
  * Null & Cocoa Rainbow (6 Suits)
  * Null & Cocoa Rainbow (5 Suits)
  * Light Pink & Cocoa Rainbow (6 Suits)
  * Light Pink & Cocoa Rainbow (5 Suits)
* Gray Pink
  * Gray Pink (6 Suits)
  * Gray Pink (5 Suits)
  * Rainbow & Gray Pink (6 Suits)
  * Rainbow & Gray Pink (5 Suits)
  * White & Gray Pink (6 Suits)
  * White & Gray Pink (5 Suits)
  * Brown & Gray Pink (6 Suits)
  * Brown & Gray Pink (5 Suits)
  * Omni & Gray Pink (6 Suits)
  * Omni & Gray Pink (5 Suits)
  * Null & Gray Pink (6 Suits)
  * Null & Gray Pink (5 Suits)
  * Muddy Rainbow & Gray Pink (6 Suits)
  * Muddy Rainbow & Gray Pink (5 Suits)
* Dark Mixes
  * Dark Rainbow & Dark Pink (6 Suits)
  * Dark Rainbow & Gray (6 Suits)
  * Dark Rainbow & Dark Brown (6 Suits)
  * Dark Rainbow & Dark Omni (6 Suits)
  * Dark Rainbow & Dark Null (6 Suits)
  * Dark Rainbow & Gray Pink (6 Suits)
  * Dark Pink & Gray (6 Suits)
  * Dark Pink & Dark Brown (6 Suits)
  * Dark Pink & Dark Omni (6 Suits)
  * Dark Pink & Dark Null (6 Suits)
  * Dark Pink & Cocoa Rainbow (6 Suits)
  * Gray & Dark Brown (6 Suits)
  * Gray & Dark Omni (6 Suits)
  * Gray & Dark Null (6 Suits)
  * Gray & Cocoa Rainbow (6 Suits)
  * Gray & Gray Pink (6 Suits)
  * Dark Brown & Dark Omni (6 Suits)
  * Dark Brown & Dark Null (6 Suits)
  * Dark Brown & Cocoa Rainbow (6 Suits)
  * Dark Brown & Gray Pink (6 Suits)
  * Dark Omni & Dark Null (6 Suits)
  * Dark Omni & Cocoa Rainbow (6 Suits)
  * Dark Omni & Gray Pink (6 Suits)
  * Dark Null & Cocoa Rainbow (6 Suits)
  * Dark Null & Gray Pink (6 Suits)
  * Cocoa Rainbow & Gray Pink (6 Suits)
* Rainbow-Ones
  * Rainbow-Ones (6 Suits)
  * Rainbow-Ones (5 Suits)
  * Rainbow-Ones (4 Suits)
  * Rainbow-Ones (3 Suits)
* Rainbow-Ones & Rainbow
  * Rainbow-Ones & Rainbow (6 Suits)
  * Rainbow-Ones & Rainbow (5 Suits)
  * Rainbow-Ones & Rainbow (4 Suits)
  * Rainbow-Ones & Rainbow (3 Suits)
* Rainbow-Ones & Pink
  * Rainbow-Ones & Pink (6 Suits)
  * Rainbow-Ones & Pink (5 Suits)
  * Rainbow-Ones & Pink (4 Suits)
  * Rainbow-Ones & Pink (3 Suits)
* Rainbow-Ones & White
  * Rainbow-Ones & White (6 Suits)
  * Rainbow-Ones & White (5 Suits)
  * Rainbow-Ones & White (4 Suits)
  * Rainbow-Ones & White (3 Suits)
* Rainbow-Ones & Brown
  * Rainbow-Ones & Brown (6 Suits)
  * Rainbow-Ones & Brown (5 Suits)
  * Rainbow-Ones & Brown (4 Suits)
  * Rainbow-Ones & Brown (3 Suits)
* Rainbow-Ones & Omni
  * Rainbow-Ones & Omni (6 Suits)
  * Rainbow-Ones & Omni (5 Suits)
  * Rainbow-Ones & Omni (4 Suits)
  * Rainbow-Ones & Omni (3 Suits)
* Rainbow-Ones & Null
  * Rainbow-Ones & Null (6 Suits)
  * Rainbow-Ones & Null (5 Suits)
  * Rainbow-Ones & Null (4 Suits)
  * Rainbow-Ones & Null (3 Suits)
* Rainbow-Ones & Muddy Rainbow
  * Rainbow-Ones & Muddy Rainbow (6 Suits)
  * Rainbow-Ones & Muddy Rainbow (5 Suits)
  * Rainbow-Ones & Muddy Rainbow (4 Suits)
  * Rainbow-Ones & Muddy Rainbow (3 Suits)
* Rainbow-Ones & Light Pink
  * Rainbow-Ones & Light Pink (6 Suits)
  * Rainbow-Ones & Light Pink (5 Suits)
  * Rainbow-Ones & Light Pink (4 Suits)
  * Rainbow-Ones & Light Pink (3 Suits)
* Rainbow-Ones & Dark Suits
  * Rainbow-Ones & Dark Rainbow (6 Suits)
  * Rainbow-Ones & Dark Rainbow (5 Suits)
  * Rainbow-Ones & Dark Pink (6 Suits)
  * Rainbow-Ones & Dark Pink (5 Suits)
  * Rainbow-Ones & Gray (6 Suits)
  * Rainbow-Ones & Gray (5 Suits)
  * Rainbow-Ones & Dark Brown (6 Suits)
  * Rainbow-Ones & Dark Brown (5 Suits)
  * Rainbow-Ones & Dark Omni (6 Suits)
  * Rainbow-Ones & Dark Omni (5 Suits)
  * Rainbow-Ones & Dark Null (6 Suits)
  * Rainbow-Ones & Dark Null (5 Suits)
  * Rainbow-Ones & Cocoa Rainbow (6 Suits)
  * Rainbow-Ones & Cocoa Rainbow (5 Suits)
  * Rainbow-Ones & Gray Pink (6 Suits)
  * Rainbow-Ones & Gray Pink (5 Suits)
* Pink-Ones
  * Pink-Ones (6 Suits)
  * Pink-Ones (5 Suits)
  * Pink-Ones (4 Suits)
  * Pink-Ones (3 Suits)
* Pink-Ones & Rainbow
  * Pink-Ones & Rainbow (6 Suits)
  * Pink-Ones & Rainbow (5 Suits)
  * Pink-Ones & Rainbow (4 Suits)
  * Pink-Ones & Rainbow (3 Suits)
* Pink-Ones & Pink
  * Pink-Ones & Pink (6 Suits)
  * Pink-Ones & Pink (5 Suits)
  * Pink-Ones & Pink (4 Suits)
  * Pink-Ones & Pink (3 Suits)
* Pink-Ones & White
  * Pink-Ones & White (6 Suits)
  * Pink-Ones & White (5 Suits)
  * Pink-Ones & White (4 Suits)
  * Pink-Ones & White (3 Suits)
* Pink-Ones & Brown
  * Pink-Ones & Brown (6 Suits)
  * Pink-Ones & Brown (5 Suits)
  * Pink-Ones & Brown (4 Suits)
  * Pink-Ones & Brown (3 Suits)
* Pink-Ones & Omni
  * Pink-Ones & Omni (6 Suits)
  * Pink-Ones & Omni (5 Suits)
  * Pink-Ones & Omni (4 Suits)
  * Pink-Ones & Omni (3 Suits)
* Pink-Ones & Null
  * Pink-Ones & Null (6 Suits)
  * Pink-Ones & Null (5 Suits)
  * Pink-Ones & Null (4 Suits)
  * Pink-Ones & Null (3 Suits)
* Pink-Ones & Muddy Rainbow
  * Pink-Ones & Muddy Rainbow (6 Suits)
  * Pink-Ones & Muddy Rainbow (5 Suits)
  * Pink-Ones & Muddy Rainbow (4 Suits)
  * Pink-Ones & Muddy Rainbow (3 Suits)
* Pink-Ones & Light Pink
  * Pink-Ones & Light Pink (6 Suits)
  * Pink-Ones & Light Pink (5 Suits)
  * Pink-Ones & Light Pink (4 Suits)
  * Pink-Ones & Light Pink (3 Suits)
* Pink-Ones & Dark Suits
  * Pink-Ones & Dark Rainbow (6 Suits)
  * Pink-Ones & Dark Rainbow (5 Suits)
  * Pink-Ones & Dark Pink (6 Suits)
  * Pink-Ones & Dark Pink (5 Suits)
  * Pink-Ones & Gray (6 Suits)
  * Pink-Ones & Gray (5 Suits)
  * Pink-Ones & Dark Brown (6 Suits)
  * Pink-Ones & Dark Brown (5 Suits)
  * Pink-Ones & Dark Omni (6 Suits)
  * Pink-Ones & Dark Omni (5 Suits)
  * Pink-Ones & Dark Null (6 Suits)
  * Pink-Ones & Dark Null (5 Suits)
  * Pink-Ones & Cocoa Rainbow (6 Suits)
  * Pink-Ones & Cocoa Rainbow (5 Suits)
  * Pink-Ones & Gray Pink (6 Suits)
  * Pink-Ones & Gray Pink (5 Suits)
* White-Ones
  * White-Ones (6 Suits)
  * White-Ones (5 Suits)
  * White-Ones (4 Suits)
  * White-Ones (3 Suits)
* White-Ones & Rainbow
  * White-Ones & Rainbow (6 Suits)
  * White-Ones & Rainbow (5 Suits)
  * White-Ones & Rainbow (4 Suits)
  * White-Ones & Rainbow (3 Suits)
* White-Ones & Pink
  * White-Ones & Pink (6 Suits)
  * White-Ones & Pink (5 Suits)
  * White-Ones & Pink (4 Suits)
  * White-Ones & Pink (3 Suits)
* White-Ones & White
  * White-Ones & White (6 Suits)
  * White-Ones & White (5 Suits)
  * White-Ones & White (4 Suits)
  * White-Ones & White (3 Suits)
* White-Ones & Brown
  * White-Ones & Brown (6 Suits)
  * White-Ones & Brown (5 Suits)
  * White-Ones & Brown (4 Suits)
  * White-Ones & Brown (3 Suits)
* White-Ones & Omni
  * White-Ones & Omni (6 Suits)
  * White-Ones & Omni (5 Suits)
  * White-Ones & Omni (4 Suits)
  * White-Ones & Omni (3 Suits)
* White-Ones & Null
  * White-Ones & Null (6 Suits)
  * White-Ones & Null (5 Suits)
  * White-Ones & Null (4 Suits)
  * White-Ones & Null (3 Suits)
* White-Ones & Muddy Rainbow
  * White-Ones & Muddy Rainbow (6 Suits)
  * White-Ones & Muddy Rainbow (5 Suits)
  * White-Ones & Muddy Rainbow (4 Suits)
  * White-Ones & Muddy Rainbow (3 Suits)
* White-Ones & Light Pink
  * White-Ones & Light Pink (6 Suits)
  * White-Ones & Light Pink (5 Suits)
  * White-Ones & Light Pink (4 Suits)
  * White-Ones & Light Pink (3 Suits)
* White-Ones & Dark Suits
  * White-Ones & Dark Rainbow (6 Suits)
  * White-Ones & Dark Rainbow (5 Suits)
  * White-Ones & Dark Pink (6 Suits)
  * White-Ones & Dark Pink (5 Suits)
  * White-Ones & Gray (6 Suits)
  * White-Ones & Gray (5 Suits)
  * White-Ones & Dark Brown (6 Suits)
  * White-Ones & Dark Brown (5 Suits)
  * White-Ones & Dark Omni (6 Suits)
  * White-Ones & Dark Omni (5 Suits)
  * White-Ones & Dark Null (6 Suits)
  * White-Ones & Dark Null (5 Suits)
  * White-Ones & Cocoa Rainbow (6 Suits)
  * White-Ones & Cocoa Rainbow (5 Suits)
  * White-Ones & Gray Pink (6 Suits)
  * White-Ones & Gray Pink (5 Suits)
* Brown-Ones
  * Brown-Ones (6 Suits)
  * Brown-Ones (5 Suits)
  * Brown-Ones (4 Suits)
  * Brown-Ones (3 Suits)
* Brown-Ones & Rainbow
  * Brown-Ones & Rainbow (6 Suits)
  * Brown-Ones & Rainbow (5 Suits)
  * Brown-Ones & Rainbow (4 Suits)
  * Brown-Ones & Rainbow (3 Suits)
* Brown-Ones & Pink
  * Brown-Ones & Pink (6 Suits)
  * Brown-Ones & Pink (5 Suits)
  * Brown-Ones & Pink (4 Suits)
  * Brown-Ones & Pink (3 Suits)
* Brown-Ones & White
  * Brown-Ones & White (6 Suits)
  * Brown-Ones & White (5 Suits)
  * Brown-Ones & White (4 Suits)
  * Brown-Ones & White (3 Suits)
* Brown-Ones & Brown
  * Brown-Ones & Brown (6 Suits)
  * Brown-Ones & Brown (5 Suits)
  * Brown-Ones & Brown (4 Suits)
  * Brown-Ones & Brown (3 Suits)
* Brown-Ones & Omni
  * Brown-Ones & Omni (6 Suits)
  * Brown-Ones & Omni (5 Suits)
  * Brown-Ones & Omni (4 Suits)
  * Brown-Ones & Omni (3 Suits)
* Brown-Ones & Null
  * Brown-Ones & Null (6 Suits)
  * Brown-Ones & Null (5 Suits)
  * Brown-Ones & Null (4 Suits)
  * Brown-Ones & Null (3 Suits)
* Brown-Ones & Muddy Rainbow
  * Brown-Ones & Muddy Rainbow (6 Suits)
  * Brown-Ones & Muddy Rainbow (5 Suits)
  * Brown-Ones & Muddy Rainbow (4 Suits)
  * Brown-Ones & Muddy Rainbow (3 Suits)
* Brown-Ones & Light Pink
  * Brown-Ones & Light Pink (6 Suits)
  * Brown-Ones & Light Pink (5 Suits)
  * Brown-Ones & Light Pink (4 Suits)
  * Brown-Ones & Light Pink (3 Suits)
* Brown-Ones & Dark Suits
  * Brown-Ones & Dark Rainbow (6 Suits)
  * Brown-Ones & Dark Rainbow (5 Suits)
  * Brown-Ones & Dark Pink (6 Suits)
  * Brown-Ones & Dark Pink (5 Suits)
  * Brown-Ones & Gray (6 Suits)
  * Brown-Ones & Gray (5 Suits)
  * Brown-Ones & Dark Brown (6 Suits)
  * Brown-Ones & Dark Brown (5 Suits)
  * Brown-Ones & Dark Omni (6 Suits)
  * Brown-Ones & Dark Omni (5 Suits)
  * Brown-Ones & Dark Null (6 Suits)
  * Brown-Ones & Dark Null (5 Suits)
  * Brown-Ones & Cocoa Rainbow (6 Suits)
  * Brown-Ones & Cocoa Rainbow (5 Suits)
  * Brown-Ones & Gray Pink (6 Suits)
  * Brown-Ones & Gray Pink (5 Suits)
* Omni-Ones
  * Omni-Ones (6 Suits)
  * Omni-Ones (5 Suits)
  * Omni-Ones (4 Suits)
  * Omni-Ones (3 Suits)
* Omni-Ones & Rainbow
  * Omni-Ones & Rainbow (6 Suits)
  * Omni-Ones & Rainbow (5 Suits)
  * Omni-Ones & Rainbow (4 Suits)
  * Omni-Ones & Rainbow (3 Suits)
* Omni-Ones & Pink
  * Omni-Ones & Pink (6 Suits)
  * Omni-Ones & Pink (5 Suits)
  * Omni-Ones & Pink (4 Suits)
  * Omni-Ones & Pink (3 Suits)
* Omni-Ones & White
  * Omni-Ones & White (6 Suits)
  * Omni-Ones & White (5 Suits)
  * Omni-Ones & White (4 Suits)
  * Omni-Ones & White (3 Suits)
* Omni-Ones & Brown
  * Omni-Ones & Brown (6 Suits)
  * Omni-Ones & Brown (5 Suits)
  * Omni-Ones & Brown (4 Suits)
  * Omni-Ones & Brown (3 Suits)
* Omni-Ones & Omni
  * Omni-Ones & Omni (6 Suits)
  * Omni-Ones & Omni (5 Suits)
  * Omni-Ones & Omni (4 Suits)
  * Omni-Ones & Omni (3 Suits)
* Omni-Ones & Null
  * Omni-Ones & Null (6 Suits)
  * Omni-Ones & Null (5 Suits)
  * Omni-Ones & Null (4 Suits)
  * Omni-Ones & Null (3 Suits)
* Omni-Ones & Muddy Rainbow
  * Omni-Ones & Muddy Rainbow (6 Suits)
  * Omni-Ones & Muddy Rainbow (5 Suits)
  * Omni-Ones & Muddy Rainbow (4 Suits)
  * Omni-Ones & Muddy Rainbow (3 Suits)
* Omni-Ones & Light Pink
  * Omni-Ones & Light Pink (6 Suits)
  * Omni-Ones & Light Pink (5 Suits)
  * Omni-Ones & Light Pink (4 Suits)
  * Omni-Ones & Light Pink (3 Suits)
* Omni-Ones & Dark Suits
  * Omni-Ones & Dark Rainbow (6 Suits)
  * Omni-Ones & Dark Rainbow (5 Suits)
  * Omni-Ones & Dark Pink (6 Suits)
  * Omni-Ones & Dark Pink (5 Suits)
  * Omni-Ones & Gray (6 Suits)
  * Omni-Ones & Gray (5 Suits)
  * Omni-Ones & Dark Brown (6 Suits)
  * Omni-Ones & Dark Brown (5 Suits)
  * Omni-Ones & Dark Omni (6 Suits)
  * Omni-Ones & Dark Omni (5 Suits)
  * Omni-Ones & Dark Null (6 Suits)
  * Omni-Ones & Dark Null (5 Suits)
  * Omni-Ones & Cocoa Rainbow (6 Suits)
  * Omni-Ones & Cocoa Rainbow (5 Suits)
  * Omni-Ones & Gray Pink (6 Suits)
  * Omni-Ones & Gray Pink (5 Suits)
* Null-Ones
  * Null-Ones (6 Suits)
  * Null-Ones (5 Suits)
  * Null-Ones (4 Suits)
  * Null-Ones (3 Suits)
* Null-Ones & Rainbow
  * Null-Ones & Rainbow (6 Suits)
  * Null-Ones & Rainbow (5 Suits)
  * Null-Ones & Rainbow (4 Suits)
  * Null-Ones & Rainbow (3 Suits)
* Null-Ones & Pink
  * Null-Ones & Pink (6 Suits)
  * Null-Ones & Pink (5 Suits)
  * Null-Ones & Pink (4 Suits)
  * Null-Ones & Pink (3 Suits)
* Null-Ones & White
  * Null-Ones & White (6 Suits)
  * Null-Ones & White (5 Suits)
  * Null-Ones & White (4 Suits)
  * Null-Ones & White (3 Suits)
* Null-Ones & Brown
  * Null-Ones & Brown (6 Suits)
  * Null-Ones & Brown (5 Suits)
  * Null-Ones & Brown (4 Suits)
  * Null-Ones & Brown (3 Suits)
* Null-Ones & Omni
  * Null-Ones & Omni (6 Suits)
  * Null-Ones & Omni (5 Suits)
  * Null-Ones & Omni (4 Suits)
  * Null-Ones & Omni (3 Suits)
* Null-Ones & Null
  * Null-Ones & Null (6 Suits)
  * Null-Ones & Null (5 Suits)
  * Null-Ones & Null (4 Suits)
  * Null-Ones & Null (3 Suits)
* Null-Ones & Muddy Rainbow
  * Null-Ones & Muddy Rainbow (6 Suits)
  * Null-Ones & Muddy Rainbow (5 Suits)
  * Null-Ones & Muddy Rainbow (4 Suits)
  * Null-Ones & Muddy Rainbow (3 Suits)
* Null-Ones & Light Pink
  * Null-Ones & Light Pink (6 Suits)
  * Null-Ones & Light Pink (5 Suits)
  * Null-Ones & Light Pink (4 Suits)
  * Null-Ones & Light Pink (3 Suits)
* Null-Ones & Dark Suits
  * Null-Ones & Dark Rainbow (6 Suits)
  * Null-Ones & Dark Rainbow (5 Suits)
  * Null-Ones & Dark Pink (6 Suits)
  * Null-Ones & Dark Pink (5 Suits)
  * Null-Ones & Gray (6 Suits)
  * Null-Ones & Gray (5 Suits)
  * Null-Ones & Dark Brown (6 Suits)
  * Null-Ones & Dark Brown (5 Suits)
  * Null-Ones & Dark Omni (6 Suits)
  * Null-Ones & Dark Omni (5 Suits)
  * Null-Ones & Dark Null (6 Suits)
  * Null-Ones & Dark Null (5 Suits)
  * Null-Ones & Cocoa Rainbow (6 Suits)
  * Null-Ones & Cocoa Rainbow (5 Suits)
  * Null-Ones & Gray Pink (6 Suits)
  * Null-Ones & Gray Pink (5 Suits)
* Muddy-Rainbow-Ones
  * Muddy-Rainbow-Ones (6 Suits)
  * Muddy-Rainbow-Ones (5 Suits)
  * Muddy-Rainbow-Ones (4 Suits)
  * Muddy-Rainbow-Ones (3 Suits)
* Muddy-Rainbow-Ones & Rainbow
  * Muddy-Rainbow-Ones & Rainbow (6 Suits)
  * Muddy-Rainbow-Ones & Rainbow (5 Suits)
  * Muddy-Rainbow-Ones & Rainbow (4 Suits)
  * Muddy-Rainbow-Ones & Rainbow (3 Suits)
* Muddy-Rainbow-Ones & Pink
  * Muddy-Rainbow-Ones & Pink (6 Suits)
  * Muddy-Rainbow-Ones & Pink (5 Suits)
  * Muddy-Rainbow-Ones & Pink (4 Suits)
  * Muddy-Rainbow-Ones & Pink (3 Suits)
* Muddy-Rainbow-Ones & White
  * Muddy-Rainbow-Ones & White (6 Suits)
  * Muddy-Rainbow-Ones & White (5 Suits)
  * Muddy-Rainbow-Ones & White (4 Suits)
  * Muddy-Rainbow-Ones & White (3 Suits)
* Muddy-Rainbow-Ones & Brown
  * Muddy-Rainbow-Ones & Brown (6 Suits)
  * Muddy-Rainbow-Ones & Brown (5 Suits)
  * Muddy-Rainbow-Ones & Brown (4 Suits)
  * Muddy-Rainbow-Ones & Brown (3 Suits)
* Muddy-Rainbow-Ones & Omni
  * Muddy-Rainbow-Ones & Omni (6 Suits)
  * Muddy-Rainbow-Ones & Omni (5 Suits)
  * Muddy-Rainbow-Ones & Omni (4 Suits)
  * Muddy-Rainbow-Ones & Omni (3 Suits)
* Muddy-Rainbow-Ones & Null
  * Muddy-Rainbow-Ones & Null (6 Suits)
  * Muddy-Rainbow-Ones & Null (5 Suits)
  * Muddy-Rainbow-Ones & Null (4 Suits)
  * Muddy-Rainbow-Ones & Null (3 Suits)
* Muddy-Rainbow-Ones & Muddy Rainbow
  * Muddy-Rainbow-Ones & Muddy Rainbow (6 Suits)
  * Muddy-Rainbow-Ones & Muddy Rainbow (5 Suits)
  * Muddy-Rainbow-Ones & Muddy Rainbow (4 Suits)
  * Muddy-Rainbow-Ones & Muddy Rainbow (3 Suits)
* Muddy-Rainbow-Ones & Light Pink
  * Muddy-Rainbow-Ones & Light Pink (6 Suits)
  * Muddy-Rainbow-Ones & Light Pink (5 Suits)
  * Muddy-Rainbow-Ones & Light Pink (4 Suits)
  * Muddy-Rainbow-Ones & Light Pink (3 Suits)
* Muddy-Rainbow-Ones & Dark Suits
  * Muddy-Rainbow-Ones & Dark Rainbow (6 Suits)
  * Muddy-Rainbow-Ones & Dark Rainbow (5 Suits)
  * Muddy-Rainbow-Ones & Dark Pink (6 Suits)
  * Muddy-Rainbow-Ones & Dark Pink (5 Suits)
  * Muddy-Rainbow-Ones & Gray (6 Suits)
  * Muddy-Rainbow-Ones & Gray (5 Suits)
  * Muddy-Rainbow-Ones & Dark Brown (6 Suits)
  * Muddy-Rainbow-Ones & Dark Brown (5 Suits)
  * Muddy-Rainbow-Ones & Dark Omni (6 Suits)
  * Muddy-Rainbow-Ones & Dark Omni (5 Suits)
  * Muddy-Rainbow-Ones & Dark Null (6 Suits)
  * Muddy-Rainbow-Ones & Dark Null (5 Suits)
  * Muddy-Rainbow-Ones & Cocoa Rainbow (6 Suits)
  * Muddy-Rainbow-Ones & Cocoa Rainbow (5 Suits)
  * Muddy-Rainbow-Ones & Gray Pink (6 Suits)
  * Muddy-Rainbow-Ones & Gray Pink (5 Suits)
* Light-Pink-Ones
  * Light-Pink-Ones (6 Suits)
  * Light-Pink-Ones (5 Suits)
  * Light-Pink-Ones (4 Suits)
  * Light-Pink-Ones (3 Suits)
* Light-Pink-Ones & Rainbow
  * Light-Pink-Ones & Rainbow (6 Suits)
  * Light-Pink-Ones & Rainbow (5 Suits)
  * Light-Pink-Ones & Rainbow (4 Suits)
  * Light-Pink-Ones & Rainbow (3 Suits)
* Light-Pink-Ones & Pink
  * Light-Pink-Ones & Pink (6 Suits)
  * Light-Pink-Ones & Pink (5 Suits)
  * Light-Pink-Ones & Pink (4 Suits)
  * Light-Pink-Ones & Pink (3 Suits)
* Light-Pink-Ones & White
  * Light-Pink-Ones & White (6 Suits)
  * Light-Pink-Ones & White (5 Suits)
  * Light-Pink-Ones & White (4 Suits)
  * Light-Pink-Ones & White (3 Suits)
* Light-Pink-Ones & Brown
  * Light-Pink-Ones & Brown (6 Suits)
  * Light-Pink-Ones & Brown (5 Suits)
  * Light-Pink-Ones & Brown (4 Suits)
  * Light-Pink-Ones & Brown (3 Suits)
* Light-Pink-Ones & Omni
  * Light-Pink-Ones & Omni (6 Suits)
  * Light-Pink-Ones & Omni (5 Suits)
  * Light-Pink-Ones & Omni (4 Suits)
  * Light-Pink-Ones & Omni (3 Suits)
* Light-Pink-Ones & Null
  * Light-Pink-Ones & Null (6 Suits)
  * Light-Pink-Ones & Null (5 Suits)
  * Light-Pink-Ones & Null (4 Suits)
  * Light-Pink-Ones & Null (3 Suits)
* Light-Pink-Ones & Muddy Rainbow
  * Light-Pink-Ones & Muddy Rainbow (6 Suits)
  * Light-Pink-Ones & Muddy Rainbow (5 Suits)
  * Light-Pink-Ones & Muddy Rainbow (4 Suits)
  * Light-Pink-Ones & Muddy Rainbow (3 Suits)
* Light-Pink-Ones & Light Pink
  * Light-Pink-Ones & Light Pink (6 Suits)
  * Light-Pink-Ones & Light Pink (5 Suits)
  * Light-Pink-Ones & Light Pink (4 Suits)
  * Light-Pink-Ones & Light Pink (3 Suits)
* Light-Pink-Ones & Dark Suits
  * Light-Pink-Ones & Dark Rainbow (6 Suits)
  * Light-Pink-Ones & Dark Rainbow (5 Suits)
  * Light-Pink-Ones & Dark Pink (6 Suits)
  * Light-Pink-Ones & Dark Pink (5 Suits)
  * Light-Pink-Ones & Gray (6 Suits)
  * Light-Pink-Ones & Gray (5 Suits)
  * Light-Pink-Ones & Dark Brown (6 Suits)
  * Light-Pink-Ones & Dark Brown (5 Suits)
  * Light-Pink-Ones & Dark Omni (6 Suits)
  * Light-Pink-Ones & Dark Omni (5 Suits)
  * Light-Pink-Ones & Dark Null (6 Suits)
  * Light-Pink-Ones & Dark Null (5 Suits)
  * Light-Pink-Ones & Cocoa Rainbow (6 Suits)
  * Light-Pink-Ones & Cocoa Rainbow (5 Suits)
  * Light-Pink-Ones & Gray Pink (6 Suits)
  * Light-Pink-Ones & Gray Pink (5 Suits)
* Rainbow-Fives
  * Rainbow-Fives (6 Suits)
  * Rainbow-Fives (5 Suits)
  * Rainbow-Fives (4 Suits)
  * Rainbow-Fives (3 Suits)
* Rainbow-Fives & Rainbow
  * Rainbow-Fives & Rainbow (6 Suits)
  * Rainbow-Fives & Rainbow (5 Suits)
  * Rainbow-Fives & Rainbow (4 Suits)
  * Rainbow-Fives & Rainbow (3 Suits)
* Rainbow-Fives & Pink
  * Rainbow-Fives & Pink (6 Suits)
  * Rainbow-Fives & Pink (5 Suits)
  * Rainbow-Fives & Pink (4 Suits)
  * Rainbow-Fives & Pink (3 Suits)
* Rainbow-Fives & White
  * Rainbow-Fives & White (6 Suits)
  * Rainbow-Fives & White (5 Suits)
  * Rainbow-Fives & White (4 Suits)
  * Rainbow-Fives & White (3 Suits)
* Rainbow-Fives & Brown
  * Rainbow-Fives & Brown (6 Suits)
  * Rainbow-Fives & Brown (5 Suits)
  * Rainbow-Fives & Brown (4 Suits)
  * Rainbow-Fives & Brown (3 Suits)
* Rainbow-Fives & Omni
  * Rainbow-Fives & Omni (6 Suits)
  * Rainbow-Fives & Omni (5 Suits)
  * Rainbow-Fives & Omni (4 Suits)
  * Rainbow-Fives & Omni (3 Suits)
* Rainbow-Fives & Null
  * Rainbow-Fives & Null (6 Suits)
  * Rainbow-Fives & Null (5 Suits)
  * Rainbow-Fives & Null (4 Suits)
  * Rainbow-Fives & Null (3 Suits)
* Rainbow-Fives & Muddy Rainbow
  * Rainbow-Fives & Muddy Rainbow (6 Suits)
  * Rainbow-Fives & Muddy Rainbow (5 Suits)
  * Rainbow-Fives & Muddy Rainbow (4 Suits)
  * Rainbow-Fives & Muddy Rainbow (3 Suits)
* Rainbow-Fives & Light Pink
  * Rainbow-Fives & Light Pink (6 Suits)
  * Rainbow-Fives & Light Pink (5 Suits)
  * Rainbow-Fives & Light Pink (4 Suits)
  * Rainbow-Fives & Light Pink (3 Suits)
* Rainbow-Fives & Dark Suits
  * Rainbow-Fives & Dark Rainbow (6 Suits)
  * Rainbow-Fives & Dark Rainbow (5 Suits)
  * Rainbow-Fives & Dark Pink (6 Suits)
  * Rainbow-Fives & Dark Pink (5 Suits)
  * Rainbow-Fives & Gray (6 Suits)
  * Rainbow-Fives & Gray (5 Suits)
  * Rainbow-Fives & Dark Brown (6 Suits)
  * Rainbow-Fives & Dark Brown (5 Suits)
  * Rainbow-Fives & Dark Omni (6 Suits)
  * Rainbow-Fives & Dark Omni (5 Suits)
  * Rainbow-Fives & Dark Null (6 Suits)
  * Rainbow-Fives & Dark Null (5 Suits)
  * Rainbow-Fives & Cocoa Rainbow (6 Suits)
  * Rainbow-Fives & Cocoa Rainbow (5 Suits)
  * Rainbow-Fives & Gray Pink (6 Suits)
  * Rainbow-Fives & Gray Pink (5 Suits)
* Pink-Fives
  * Pink-Fives (6 Suits)
  * Pink-Fives (5 Suits)
  * Pink-Fives (4 Suits)
  * Pink-Fives (3 Suits)
* Pink-Fives & Rainbow
  * Pink-Fives & Rainbow (6 Suits)
  * Pink-Fives & Rainbow (5 Suits)
  * Pink-Fives & Rainbow (4 Suits)
  * Pink-Fives & Rainbow (3 Suits)
* Pink-Fives & Pink
  * Pink-Fives & Pink (6 Suits)
  * Pink-Fives & Pink (5 Suits)
  * Pink-Fives & Pink (4 Suits)
  * Pink-Fives & Pink (3 Suits)
* Pink-Fives & White
  * Pink-Fives & White (6 Suits)
  * Pink-Fives & White (5 Suits)
  * Pink-Fives & White (4 Suits)
  * Pink-Fives & White (3 Suits)
* Pink-Fives & Brown
  * Pink-Fives & Brown (6 Suits)
  * Pink-Fives & Brown (5 Suits)
  * Pink-Fives & Brown (4 Suits)
  * Pink-Fives & Brown (3 Suits)
* Pink-Fives & Omni
  * Pink-Fives & Omni (6 Suits)
  * Pink-Fives & Omni (5 Suits)
  * Pink-Fives & Omni (4 Suits)
  * Pink-Fives & Omni (3 Suits)
* Pink-Fives & Null
  * Pink-Fives & Null (6 Suits)
  * Pink-Fives & Null (5 Suits)
  * Pink-Fives & Null (4 Suits)
  * Pink-Fives & Null (3 Suits)
* Pink-Fives & Muddy Rainbow
  * Pink-Fives & Muddy Rainbow (6 Suits)
  * Pink-Fives & Muddy Rainbow (5 Suits)
  * Pink-Fives & Muddy Rainbow (4 Suits)
  * Pink-Fives & Muddy Rainbow (3 Suits)
* Pink-Fives & Light Pink
  * Pink-Fives & Light Pink (6 Suits)
  * Pink-Fives & Light Pink (5 Suits)
  * Pink-Fives & Light Pink (4 Suits)
  * Pink-Fives & Light Pink (3 Suits)
* Pink-Fives & Dark Suits
  * Pink-Fives & Dark Rainbow (6 Suits)
  * Pink-Fives & Dark Rainbow (5 Suits)
  * Pink-Fives & Dark Pink (6 Suits)
  * Pink-Fives & Dark Pink (5 Suits)
  * Pink-Fives & Gray (6 Suits)
  * Pink-Fives & Gray (5 Suits)
  * Pink-Fives & Dark Brown (6 Suits)
  * Pink-Fives & Dark Brown (5 Suits)
  * Pink-Fives & Dark Omni (6 Suits)
  * Pink-Fives & Dark Omni (5 Suits)
  * Pink-Fives & Dark Null (6 Suits)
  * Pink-Fives & Dark Null (5 Suits)
  * Pink-Fives & Cocoa Rainbow (6 Suits)
  * Pink-Fives & Cocoa Rainbow (5 Suits)
  * Pink-Fives & Gray Pink (6 Suits)
  * Pink-Fives & Gray Pink (5 Suits)
* White-Fives
  * White-Fives (6 Suits)
  * White-Fives (5 Suits)
  * White-Fives (4 Suits)
  * White-Fives (3 Suits)
* White-Fives & Rainbow
  * White-Fives & Rainbow (6 Suits)
  * White-Fives & Rainbow (5 Suits)
  * White-Fives & Rainbow (4 Suits)
  * White-Fives & Rainbow (3 Suits)
* White-Fives & Pink
  * White-Fives & Pink (6 Suits)
  * White-Fives & Pink (5 Suits)
  * White-Fives & Pink (4 Suits)
  * White-Fives & Pink (3 Suits)
* White-Fives & White
  * White-Fives & White (6 Suits)
  * White-Fives & White (5 Suits)
  * White-Fives & White (4 Suits)
  * White-Fives & White (3 Suits)
* White-Fives & Brown
  * White-Fives & Brown (6 Suits)
  * White-Fives & Brown (5 Suits)
  * White-Fives & Brown (4 Suits)
  * White-Fives & Brown (3 Suits)
* White-Fives & Omni
  * White-Fives & Omni (6 Suits)
  * White-Fives & Omni (5 Suits)
  * White-Fives & Omni (4 Suits)
  * White-Fives & Omni (3 Suits)
* White-Fives & Null
  * White-Fives & Null (6 Suits)
  * White-Fives & Null (5 Suits)
  * White-Fives & Null (4 Suits)
  * White-Fives & Null (3 Suits)
* White-Fives & Muddy Rainbow
  * White-Fives & Muddy Rainbow (6 Suits)
  * White-Fives & Muddy Rainbow (5 Suits)
  * White-Fives & Muddy Rainbow (4 Suits)
  * White-Fives & Muddy Rainbow (3 Suits)
* White-Fives & Light Pink
  * White-Fives & Light Pink (6 Suits)
  * White-Fives & Light Pink (5 Suits)
  * White-Fives & Light Pink (4 Suits)
  * White-Fives & Light Pink (3 Suits)
* White-Fives & Dark Suits
  * White-Fives & Dark Rainbow (6 Suits)
  * White-Fives & Dark Rainbow (5 Suits)
  * White-Fives & Dark Pink (6 Suits)
  * White-Fives & Dark Pink (5 Suits)
  * White-Fives & Gray (6 Suits)
  * White-Fives & Gray (5 Suits)
  * White-Fives & Dark Brown (6 Suits)
  * White-Fives & Dark Brown (5 Suits)
  * White-Fives & Dark Omni (6 Suits)
  * White-Fives & Dark Omni (5 Suits)
  * White-Fives & Dark Null (6 Suits)
  * White-Fives & Dark Null (5 Suits)
  * White-Fives & Cocoa Rainbow (6 Suits)
  * White-Fives & Cocoa Rainbow (5 Suits)
  * White-Fives & Gray Pink (6 Suits)
  * White-Fives & Gray Pink (5 Suits)
* Brown-Fives
  * Brown-Fives (6 Suits)
  * Brown-Fives (5 Suits)
  * Brown-Fives (4 Suits)
  * Brown-Fives (3 Suits)
* Brown-Fives & Rainbow
  * Brown-Fives & Rainbow (6 Suits)
  * Brown-Fives & Rainbow (5 Suits)
  * Brown-Fives & Rainbow (4 Suits)
  * Brown-Fives & Rainbow (3 Suits)
* Brown-Fives & Pink
  * Brown-Fives & Pink (6 Suits)
  * Brown-Fives & Pink (5 Suits)
  * Brown-Fives & Pink (4 Suits)
  * Brown-Fives & Pink (3 Suits)
* Brown-Fives & White
  * Brown-Fives & White (6 Suits)
  * Brown-Fives & White (5 Suits)
  * Brown-Fives & White (4 Suits)
  * Brown-Fives & White (3 Suits)
* Brown-Fives & Brown
  * Brown-Fives & Brown (6 Suits)
  * Brown-Fives & Brown (5 Suits)
  * Brown-Fives & Brown (4 Suits)
  * Brown-Fives & Brown (3 Suits)
* Brown-Fives & Omni
  * Brown-Fives & Omni (6 Suits)
  * Brown-Fives & Omni (5 Suits)
  * Brown-Fives & Omni (4 Suits)
  * Brown-Fives & Omni (3 Suits)
* Brown-Fives & Null
  * Brown-Fives & Null (6 Suits)
  * Brown-Fives & Null (5 Suits)
  * Brown-Fives & Null (4 Suits)
  * Brown-Fives & Null (3 Suits)
* Brown-Fives & Muddy Rainbow
  * Brown-Fives & Muddy Rainbow (6 Suits)
  * Brown-Fives & Muddy Rainbow (5 Suits)
  * Brown-Fives & Muddy Rainbow (4 Suits)
  * Brown-Fives & Muddy Rainbow (3 Suits)
* Brown-Fives & Light Pink
  * Brown-Fives & Light Pink (6 Suits)
  * Brown-Fives & Light Pink (5 Suits)
  * Brown-Fives & Light Pink (4 Suits)
  * Brown-Fives & Light Pink (3 Suits)
* Brown-Fives & Dark Suits
  * Brown-Fives & Dark Rainbow (6 Suits)
  * Brown-Fives & Dark Rainbow (5 Suits)
  * Brown-Fives & Dark Pink (6 Suits)
  * Brown-Fives & Dark Pink (5 Suits)
  * Brown-Fives & Gray (6 Suits)
  * Brown-Fives & Gray (5 Suits)
  * Brown-Fives & Dark Brown (6 Suits)
  * Brown-Fives & Dark Brown (5 Suits)
  * Brown-Fives & Dark Omni (6 Suits)
  * Brown-Fives & Dark Omni (5 Suits)
  * Brown-Fives & Dark Null (6 Suits)
  * Brown-Fives & Dark Null (5 Suits)
  * Brown-Fives & Cocoa Rainbow (6 Suits)
  * Brown-Fives & Cocoa Rainbow (5 Suits)
  * Brown-Fives & Gray Pink (6 Suits)
  * Brown-Fives & Gray Pink (5 Suits)
* Omni-Fives
  * Omni-Fives (6 Suits)
  * Omni-Fives (5 Suits)
  * Omni-Fives (4 Suits)
  * Omni-Fives (3 Suits)
* Omni-Fives & Rainbow
  * Omni-Fives & Rainbow (6 Suits)
  * Omni-Fives & Rainbow (5 Suits)
  * Omni-Fives & Rainbow (4 Suits)
  * Omni-Fives & Rainbow (3 Suits)
* Omni-Fives & Pink
  * Omni-Fives & Pink (6 Suits)
  * Omni-Fives & Pink (5 Suits)
  * Omni-Fives & Pink (4 Suits)
  * Omni-Fives & Pink (3 Suits)
* Omni-Fives & White
  * Omni-Fives & White (6 Suits)
  * Omni-Fives & White (5 Suits)
  * Omni-Fives & White (4 Suits)
  * Omni-Fives & White (3 Suits)
* Omni-Fives & Brown
  * Omni-Fives & Brown (6 Suits)
  * Omni-Fives & Brown (5 Suits)
  * Omni-Fives & Brown (4 Suits)
  * Omni-Fives & Brown (3 Suits)
* Omni-Fives & Omni
  * Omni-Fives & Omni (6 Suits)
  * Omni-Fives & Omni (5 Suits)
  * Omni-Fives & Omni (4 Suits)
  * Omni-Fives & Omni (3 Suits)
* Omni-Fives & Null
  * Omni-Fives & Null (6 Suits)
  * Omni-Fives & Null (5 Suits)
  * Omni-Fives & Null (4 Suits)
  * Omni-Fives & Null (3 Suits)
* Omni-Fives & Muddy Rainbow
  * Omni-Fives & Muddy Rainbow (6 Suits)
  * Omni-Fives & Muddy Rainbow (5 Suits)
  * Omni-Fives & Muddy Rainbow (4 Suits)
  * Omni-Fives & Muddy Rainbow (3 Suits)
* Omni-Fives & Light Pink
  * Omni-Fives & Light Pink (6 Suits)
  * Omni-Fives & Light Pink (5 Suits)
  * Omni-Fives & Light Pink (4 Suits)
  * Omni-Fives & Light Pink (3 Suits)
* Omni-Fives & Dark Suits
  * Omni-Fives & Dark Rainbow (6 Suits)
  * Omni-Fives & Dark Rainbow (5 Suits)
  * Omni-Fives & Dark Pink (6 Suits)
  * Omni-Fives & Dark Pink (5 Suits)
  * Omni-Fives & Gray (6 Suits)
  * Omni-Fives & Gray (5 Suits)
  * Omni-Fives & Dark Brown (6 Suits)
  * Omni-Fives & Dark Brown (5 Suits)
  * Omni-Fives & Dark Omni (6 Suits)
  * Omni-Fives & Dark Omni (5 Suits)
  * Omni-Fives & Dark Null (6 Suits)
  * Omni-Fives & Dark Null (5 Suits)
  * Omni-Fives & Cocoa Rainbow (6 Suits)
  * Omni-Fives & Cocoa Rainbow (5 Suits)
  * Omni-Fives & Gray Pink (6 Suits)
  * Omni-Fives & Gray Pink (5 Suits)
* Null-Fives
  * Null-Fives (6 Suits)
  * Null-Fives (5 Suits)
  * Null-Fives (4 Suits)
  * Null-Fives (3 Suits)
* Null-Fives & Rainbow
  * Null-Fives & Rainbow (6 Suits)
  * Null-Fives & Rainbow (5 Suits)
  * Null-Fives & Rainbow (4 Suits)
  * Null-Fives & Rainbow (3 Suits)
* Null-Fives & Pink
  * Null-Fives & Pink (6 Suits)
  * Null-Fives & Pink (5 Suits)
  * Null-Fives & Pink (4 Suits)
  * Null-Fives & Pink (3 Suits)
* Null-Fives & White
  * Null-Fives & White (6 Suits)
  * Null-Fives & White (5 Suits)
  * Null-Fives & White (4 Suits)
  * Null-Fives & White (3 Suits)
* Null-Fives & Brown
  * Null-Fives & Brown (6 Suits)
  * Null-Fives & Brown (5 Suits)
  * Null-Fives & Brown (4 Suits)
  * Null-Fives & Brown (3 Suits)
* Null-Fives & Omni
  * Null-Fives & Omni (6 Suits)
  * Null-Fives & Omni (5 Suits)
  * Null-Fives & Omni (4 Suits)
  * Null-Fives & Omni (3 Suits)
* Null-Fives & Null
  * Null-Fives & Null (6 Suits)
  * Null-Fives & Null (5 Suits)
  * Null-Fives & Null (4 Suits)
  * Null-Fives & Null (3 Suits)
* Null-Fives & Muddy Rainbow
  * Null-Fives & Muddy Rainbow (6 Suits)
  * Null-Fives & Muddy Rainbow (5 Suits)
  * Null-Fives & Muddy Rainbow (4 Suits)
  * Null-Fives & Muddy Rainbow (3 Suits)
* Null-Fives & Light Pink
  * Null-Fives & Light Pink (6 Suits)
  * Null-Fives & Light Pink (5 Suits)
  * Null-Fives & Light Pink (4 Suits)
  * Null-Fives & Light Pink (3 Suits)
* Null-Fives & Dark Suits
  * Null-Fives & Dark Rainbow (6 Suits)
  * Null-Fives & Dark Rainbow (5 Suits)
  * Null-Fives & Dark Pink (6 Suits)
  * Null-Fives & Dark Pink (5 Suits)
  * Null-Fives & Gray (6 Suits)
  * Null-Fives & Gray (5 Suits)
  * Null-Fives & Dark Brown (6 Suits)
  * Null-Fives & Dark Brown (5 Suits)
  * Null-Fives & Dark Omni (6 Suits)
  * Null-Fives & Dark Omni (5 Suits)
  * Null-Fives & Dark Null (6 Suits)
  * Null-Fives & Dark Null (5 Suits)
  * Null-Fives & Cocoa Rainbow (6 Suits)
  * Null-Fives & Cocoa Rainbow (5 Suits)
  * Null-Fives & Gray Pink (6 Suits)
  * Null-Fives & Gray Pink (5 Suits)
* Muddy-Rainbow-Fives
  * Muddy-Rainbow-Fives (6 Suits)
  * Muddy-Rainbow-Fives (5 Suits)
  * Muddy-Rainbow-Fives (4 Suits)
  * Muddy-Rainbow-Fives (3 Suits)
* Muddy-Rainbow-Fives & Rainbow
  * Muddy-Rainbow-Fives & Rainbow (6 Suits)
  * Muddy-Rainbow-Fives & Rainbow (5 Suits)
  * Muddy-Rainbow-Fives & Rainbow (4 Suits)
  * Muddy-Rainbow-Fives & Rainbow (3 Suits)
* Muddy-Rainbow-Fives & Pink
  * Muddy-Rainbow-Fives & Pink (6 Suits)
  * Muddy-Rainbow-Fives & Pink (5 Suits)
  * Muddy-Rainbow-Fives & Pink (4 Suits)
  * Muddy-Rainbow-Fives & Pink (3 Suits)
* Muddy-Rainbow-Fives & White
  * Muddy-Rainbow-Fives & White (6 Suits)
  * Muddy-Rainbow-Fives & White (5 Suits)
  * Muddy-Rainbow-Fives & White (4 Suits)
  * Muddy-Rainbow-Fives & White (3 Suits)
* Muddy-Rainbow-Fives & Brown
  * Muddy-Rainbow-Fives & Brown (6 Suits)
  * Muddy-Rainbow-Fives & Brown (5 Suits)
  * Muddy-Rainbow-Fives & Brown (4 Suits)
  * Muddy-Rainbow-Fives & Brown (3 Suits)
* Muddy-Rainbow-Fives & Omni
  * Muddy-Rainbow-Fives & Omni (6 Suits)
  * Muddy-Rainbow-Fives & Omni (5 Suits)
  * Muddy-Rainbow-Fives & Omni (4 Suits)
  * Muddy-Rainbow-Fives & Omni (3 Suits)
* Muddy-Rainbow-Fives & Null
  * Muddy-Rainbow-Fives & Null (6 Suits)
  * Muddy-Rainbow-Fives & Null (5 Suits)
  * Muddy-Rainbow-Fives & Null (4 Suits)
  * Muddy-Rainbow-Fives & Null (3 Suits)
* Muddy-Rainbow-Fives & Muddy Rainbow
  * Muddy-Rainbow-Fives & Muddy Rainbow (6 Suits)
  * Muddy-Rainbow-Fives & Muddy Rainbow (5 Suits)
  * Muddy-Rainbow-Fives & Muddy Rainbow (4 Suits)
  * Muddy-Rainbow-Fives & Muddy Rainbow (3 Suits)
* Muddy-Rainbow-Fives & Light Pink
  * Muddy-Rainbow-Fives & Light Pink (6 Suits)
  * Muddy-Rainbow-Fives & Light Pink (5 Suits)
  * Muddy-Rainbow-Fives & Light Pink (4 Suits)
  * Muddy-Rainbow-Fives & Light Pink (3 Suits)
* Muddy-Rainbow-Fives & Dark Suits
  * Muddy-Rainbow-Fives & Dark Rainbow (6 Suits)
  * Muddy-Rainbow-Fives & Dark Rainbow (5 Suits)
  * Muddy-Rainbow-Fives & Dark Pink (6 Suits)
  * Muddy-Rainbow-Fives & Dark Pink (5 Suits)
  * Muddy-Rainbow-Fives & Gray (6 Suits)
  * Muddy-Rainbow-Fives & Gray (5 Suits)
  * Muddy-Rainbow-Fives & Dark Brown (6 Suits)
  * Muddy-Rainbow-Fives & Dark Brown (5 Suits)
  * Muddy-Rainbow-Fives & Dark Omni (6 Suits)
  * Muddy-Rainbow-Fives & Dark Omni (5 Suits)
  * Muddy-Rainbow-Fives & Dark Null (6 Suits)
  * Muddy-Rainbow-Fives & Dark Null (5 Suits)
  * Muddy-Rainbow-Fives & Cocoa Rainbow (6 Suits)
  * Muddy-Rainbow-Fives & Cocoa Rainbow (5 Suits)
  * Muddy-Rainbow-Fives & Gray Pink (6 Suits)
  * Muddy-Rainbow-Fives & Gray Pink (5 Suits)
* Light-Pink-Fives
  * Light-Pink-Fives (6 Suits)
  * Light-Pink-Fives (5 Suits)
  * Light-Pink-Fives (4 Suits)
  * Light-Pink-Fives (3 Suits)
* Light-Pink-Fives & Rainbow
  * Light-Pink-Fives & Rainbow (6 Suits)
  * Light-Pink-Fives & Rainbow (5 Suits)
  * Light-Pink-Fives & Rainbow (4 Suits)
  * Light-Pink-Fives & Rainbow (3 Suits)
* Light-Pink-Fives & Pink
  * Light-Pink-Fives & Pink (6 Suits)
  * Light-Pink-Fives & Pink (5 Suits)
  * Light-Pink-Fives & Pink (4 Suits)
  * Light-Pink-Fives & Pink (3 Suits)
* Light-Pink-Fives & White
  * Light-Pink-Fives & White (6 Suits)
  * Light-Pink-Fives & White (5 Suits)
  * Light-Pink-Fives & White (4 Suits)
  * Light-Pink-Fives & White (3 Suits)
* Light-Pink-Fives & Brown
  * Light-Pink-Fives & Brown (6 Suits)
  * Light-Pink-Fives & Brown (5 Suits)
  * Light-Pink-Fives & Brown (4 Suits)
  * Light-Pink-Fives & Brown (3 Suits)
* Light-Pink-Fives & Omni
  * Light-Pink-Fives & Omni (6 Suits)
  * Light-Pink-Fives & Omni (5 Suits)
  * Light-Pink-Fives & Omni (4 Suits)
  * Light-Pink-Fives & Omni (3 Suits)
* Light-Pink-Fives & Null
  * Light-Pink-Fives & Null (6 Suits)
  * Light-Pink-Fives & Null (5 Suits)
  * Light-Pink-Fives & Null (4 Suits)
  * Light-Pink-Fives & Null (3 Suits)
* Light-Pink-Fives & Muddy Rainbow
  * Light-Pink-Fives & Muddy Rainbow (6 Suits)
  * Light-Pink-Fives & Muddy Rainbow (5 Suits)
  * Light-Pink-Fives & Muddy Rainbow (4 Suits)
  * Light-Pink-Fives & Muddy Rainbow (3 Suits)
* Light-Pink-Fives & Light Pink
  * Light-Pink-Fives & Light Pink (6 Suits)
  * Light-Pink-Fives & Light Pink (5 Suits)
  * Light-Pink-Fives & Light Pink (4 Suits)
  * Light-Pink-Fives & Light Pink (3 Suits)
* Light-Pink-Fives & Dark Suits
  * Light-Pink-Fives & Dark Rainbow (6 Suits)
  * Light-Pink-Fives & Dark Rainbow (5 Suits)
  * Light-Pink-Fives & Dark Pink (6 Suits)
  * Light-Pink-Fives & Dark Pink (5 Suits)
  * Light-Pink-Fives & Gray (6 Suits)
  * Light-Pink-Fives & Gray (5 Suits)
  * Light-Pink-Fives & Dark Brown (6 Suits)
  * Light-Pink-Fives & Dark Brown (5 Suits)
  * Light-Pink-Fives & Dark Omni (6 Suits)
  * Light-Pink-Fives & Dark Omni (5 Suits)
  * Light-Pink-Fives & Dark Null (6 Suits)
  * Light-Pink-Fives & Dark Null (5 Suits)
  * Light-Pink-Fives & Cocoa Rainbow (6 Suits)
  * Light-Pink-Fives & Cocoa Rainbow (5 Suits)
  * Light-Pink-Fives & Gray Pink (6 Suits)
  * Light-Pink-Fives & Gray Pink (5 Suits)
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
* Alternating Clues
  * Alternating Clues (6 Suits)
  * Alternating Clues (5 Suits)
  * Alternating Clues (4 Suits)
  * Alternating Clues (3 Suits)
  * Alternating Clues & Black (6 Suits)
  * Alternating Clues & Black (5 Suits)
  * Alternating Clues & Rainbow (6 Suits)
  * Alternating Clues & Rainbow (5 Suits)
  * Alternating Clues & Rainbow (4 Suits)
  * Alternating Clues & Rainbow (3 Suits)
  * Alternating Clues & Pink (6 Suits)
  * Alternating Clues & Pink (5 Suits)
  * Alternating Clues & Pink (4 Suits)
  * Alternating Clues & Pink (3 Suits)
  * Alternating Clues & White (6 Suits)
  * Alternating Clues & White (5 Suits)
  * Alternating Clues & White (4 Suits)
  * Alternating Clues & White (3 Suits)
  * Alternating Clues & Brown (6 Suits)
  * Alternating Clues & Brown (5 Suits)
  * Alternating Clues & Brown (4 Suits)
  * Alternating Clues & Brown (3 Suits)
  * Alternating Clues & Omni (6 Suits)
  * Alternating Clues & Omni (5 Suits)
  * Alternating Clues & Omni (4 Suits)
  * Alternating Clues & Omni (3 Suits)
  * Alternating Clues & Null (6 Suits)
  * Alternating Clues & Null (5 Suits)
  * Alternating Clues & Null (4 Suits)
  * Alternating Clues & Null (3 Suits)
  * Alternating Clues & Muddy Rainbow (6 Suits)
  * Alternating Clues & Muddy Rainbow (5 Suits)
  * Alternating Clues & Muddy Rainbow (4 Suits)
  * Alternating Clues & Muddy Rainbow (3 Suits)
  * Alternating Clues & Light Pink (6 Suits)
  * Alternating Clues & Light Pink (5 Suits)
  * Alternating Clues & Light Pink (4 Suits)
  * Alternating Clues & Light Pink (3 Suits)
* Clue Starved
  * Clue Starved (6 Suits)
  * Clue Starved (5 Suits)
  * Clue Starved & Rainbow (6 Suits)
  * Clue Starved & Rainbow (5 Suits)
  * Clue Starved & Pink (6 Suits)
  * Clue Starved & Pink (5 Suits)
  * Clue Starved & White (6 Suits)
  * Clue Starved & White (5 Suits)
  * Clue Starved & Brown (6 Suits)
  * Clue Starved & Brown (5 Suits)
  * Clue Starved & Omni (6 Suits)
  * Clue Starved & Omni (5 Suits)
  * Clue Starved & Null (6 Suits)
  * Clue Starved & Null (5 Suits)
  * Clue Starved & Muddy Rainbow (6 Suits)
  * Clue Starved & Muddy Rainbow (5 Suits)
  * Clue Starved & Light Pink (6 Suits)
  * Clue Starved & Light Pink (5 Suits)
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
  * Up or Down & Muddy Rainbow (6 Suits)
  * Up or Down & Muddy Rainbow (5 Suits)
  * Up or Down & Light Pink (6 Suits)
  * Up or Down & Light Pink (5 Suits)
* Throw It in a Hole
  * Throw It in a Hole (6 Suits)
  * Throw It in a Hole (5 Suits)
  * Throw It in a Hole (4 Suits)
  * Throw It in a Hole (3 Suits)
  * Throw It in a Hole & Black (6 Suits)
  * Throw It in a Hole & Rainbow (6 Suits)
  * Throw It in a Hole & Rainbow (5 Suits)
  * Throw It in a Hole & Rainbow (4 Suits)
  * Throw It in a Hole & Pink (6 Suits)
  * Throw It in a Hole & Pink (5 Suits)
  * Throw It in a Hole & Pink (4 Suits)
  * Throw It in a Hole & White (6 Suits)
  * Throw It in a Hole & White (5 Suits)
  * Throw It in a Hole & White (4 Suits)
  * Throw It in a Hole & Brown (6 Suits)
  * Throw It in a Hole & Brown (5 Suits)
  * Throw It in a Hole & Brown (4 Suits)
  * Throw It in a Hole & Omni (6 Suits)
  * Throw It in a Hole & Omni (5 Suits)
  * Throw It in a Hole & Omni (4 Suits)
  * Throw It in a Hole & Null (6 Suits)
  * Throw It in a Hole & Null (5 Suits)
  * Throw It in a Hole & Null (4 Suits)
  * Throw It in a Hole & Muddy Rainbow (6 Suits)
  * Throw It in a Hole & Muddy Rainbow (5 Suits)
  * Throw It in a Hole & Muddy Rainbow (4 Suits)
  * Throw It in a Hole & Light Pink (6 Suits)
  * Throw It in a Hole & Light Pink (5 Suits)
  * Throw It in a Hole & Light Pink (4 Suits)
