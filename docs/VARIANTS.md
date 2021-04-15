# Variants

[Hanab Live](https://hanab.live) is programmed by enthusiasts who have played the game thousands of times. In order to keep the game fresh, the server allows you to create games using many different variants. Players also have the ability to further custom a game by using a number of [custom game options](https://github.com/Zamiell/hanabi-live/blob/master/docs/FEATURES.md#custom-game-options).

<br />

## A Quick Overview of Special Suits

Normal amount of cards per suit (e.g. 10 in total):

|                    | No color clues | Own color clue | All color clues |
| ------------------ | -------------- | -------------- | --------------- |
| **No rank clues**  | Null           | Brown          | Muddy Rainbow   |
| **Own rank clue**  | White          | No Variant     | Rainbow         |
| **All rank clues** | Light Pink     | Pink           | Omni            |

One of each card per suit (e.g. 5 in total):

|                    |  No color clues  | Own color clue | All color clues |
| ------------------ | ---------------- | -------------- | --------------- |
| **No rank clues**  | Dark Null        | Dark Brown     | Cocoa Rainbow   |
| **Own rank clue**  | Gray             | Black          | Dark Rainbow    |
| **All rank clues** | Gray Pink        | Dark Pink      | Dark Omni       |

<br />

## Detailed Rules per Variant

### No Variant

- This is the "normal" game, with 5 suits. Unlike some other versions of the game, the website uses the following five suit colors:
  - Blue
  - Green
  - Yellow
  - Red
  - Purple

### 6 Suits

- A teal suit is added.
- It works identical to the other suits in that you can clue teal cards with teal clues.

### 4 Suits

- The purple suit is removed.

### 3 Suits

- The yellow and purple suits are removed.

### Black

- One of the suits is replaced with a black suit.
- It works similar to the other suits in that you can clue black cards with black clues.
- There is only one of each black card in the deck, which means that every black card is "critical".

### Rainbow

- One of the suits is replaced with a rainbow suit.
- All color clues will "touch" the rainbow suit.

### Pink

- One of the suits is replaced with a pink suit.
- All rank clues "touch" the pink suit.

### White

- One of the suits is replaced with a white suit.
- No color clues "touch" the white suit. (It is a colorless suit.)

### Brown

- One of the suits is replaced with a brown suit.
- No rank clues "touch" the brown suit.

### Omni

- One of the suits is replaced with an omni suit.
- All color clues and all rank clues "touch" the omni suit.

### Null

- One of the suits is replaced with a null suit.
- No clues "touch" the null suit.

### Muddy Rainbow

- One of the suits is replaced with a muddy rainbow suit.
- All color clues will "touch" the muddy rainbow suit.
- No rank clues will "touch" the muddy rainbow suit.

### Light Pink

- One of the suits is replaced with a light pink suit.
- All rank clues will "touch" the light pink suit.
- No color clues will "touch" the light pink suit.

### Prism

- One of the suits is replaced with a prism suit.
- The prism 1 is touched by the left-most color, the prism 2 is touched by the second-to-left-most color, and so forth.
- If there are less than 5 colors available in the variant, then the colors used for prism cards will wrap-around.

### Dark [Suit] / Gray / Cocoa Rainbow / Gray Pink

- One of the suits is replaced with a "dark" version of a special suit.
  - Gray is the "dark" version of white.
  - Cocoa rainbow is the "dark" version of muddy rainbow.
  - Gray pink is the "dark" version of light pink.
- There is only one of each dark card in the deck, which means that every dark card is "critical".

### Special Suit Combinations (e.g. Black & Rainbow)

- Two suits are replaced with special suits.

### Suit-Ones (e.g. Rainbow-Ones, Pink-Ones, White-Ones, etc.)

- Ones have the property of the suit prefix. For example, rainbow-ones are "touched" by all colors.

### Suit-Fives (e.g. Rainbow-Fives, Pink-Fives, White-Fives, etc.)

- Fives have the property of the suit prefix. For example, rainbow-fives are "touched" by all colors.

### Deceptive-Ones

- Ones have the property that they are only touched by certain rank clues:
  - The first suit is touched by a rank 2 clue
  - The second suit is touched by a rank 3 clue
  - The third suit is touched by a rank 4 clue,
  - The fourth suit is touched by a rank 5 clue
  - The fifth suit is touched by a rank 2 clue (wrapping around)

### Deceptive-Fives

- Fives have the property that they are only touched by certain rank clues:
  - The first suit is touched by a rank 1 clue
  - The second suit is touched by a rank 2 clue
  - The third suit is touched by a rank 3 clue,
  - The fourth suit is touched by a rank 4 clue
  - The fifth suit is touched by a rank 1 clue (wrapping around)

### Suit-Ones or Suit-Fives with Another Special Suit (e.g. Rainbow-Ones & Pink)

- Suit-Ones or Suit-Fives of a special suit inherit the special suit's properties.
  - For example, consider the "Rainbow-Ones & Pink" variant:
    - The rainbow suit has the property of being touched by all colors.
    - The pink suit has the property of being touched by all ranks.
    - These add together and the pink 1 is touched by all colors and touched by all ranks.
- If a conflict is present, the suit property will override the special property.
  - For example, consider the "Null-Ones & Rainbow" variant:
    - The null suit has the property of being touched by no colors and touched by no ranks.
    - The rainbow suit has the property of being touched by all colors.
    - These add together, but the the color touch property is in conflict. The rainbow property takes precedence, so the rainbow 1 is touched by all colors and touched by no ranks.

### Ambiguous

- Two suits share a color. There is no way to disambiguate between them with color clues.

### Very Ambiguous

- Three suits share a color. There is no way to disambiguate between them with color clues.

### Extremely Ambiguous

- Four, five, or six suits share a color. There is no way to disambiguate between them with color clues.

### Dual-Color

- Each suit is touched by two separate colors.

### Special Mix (5 Suits)

- This is a mix of several variants. The suits are as follows:
  1. Black (one of each)
  2. Rainbow (all colors)
  3. Pink (all ranks)
  4. White (colorless)
  5. Brown (rankless)

### Special Mix (6 Suits)

- This is a mix of several variants. The suits are as follows:
  1. Black (one of each)
  2. Rainbow (all colors)
  3. Pink (all ranks)
  4. White (colorless)
  5. Brown (rankless)
  6. Null (clueless)

### Ambiguous Mix

- This is a mix of several variants. The suits are as follows:
  1. Tomato (red)
  2. Mahogany (red)
  3. Sky (blue)
  4. Navy (blue)
  5. Black (one of each)
  6. White (colorless)

### Dual-Color Mix

- This is a mix of several variants. The suits are as follows:
  1. Green (blue / yellow)
  2. Purple (blue / red)
  3. Orange (yellow / red)
  4. Black (one of each)
  5. Rainbow (all colors)
  6. White (colorless)

### Ambiguous & Dual-Color Mix

- This is a mix of several variants. The suits are as follows:
  1. Lime (blue / yellow)
  2. Forest (blue / yellow)
  3. Orchid (blue / red)
  4. Violet (blue / red)
  5. Tangelo (yellow / red)
  6. Peach (yellow / red)

### Color Blind

- Color clues touch no suits. (Empty color clues are always allowed.)

### Number Blind

- Rank clues touch no suits. (Empty rank clues are always allowed.)

### Totally Blind

- Color clues and rank clues touch no suits. (Empty clues are always allowed.)

### Color Mute

- Color clues cannot be given.

### Number Mute

- Rank clues cannot be given.

### Alternating Clues

- The first clue of the game has no restrictions. After that, each successive clue must be the opposite type as the one prior.
- For example, if the first clue of the game is a color clue, then the second clue must be a number clue, the third clue must be a color clue, and so forth.
- This variant was invented by Jake Stiles.

### Clue Starved

- Each discard only generates 0.5 clues. (The team still starts with 8 clues.)

### Cow & Pig

- When players give a clue, they point at the cards clued, but say "moo" if it a color clue and "oink" if it is a rank clue.

### Duck

- When players give a clue, they point at the cards clued, but say "quack" instead of a color or number.
- This variant was invented by [Jack Gurev's](https://www.facebook.com/jack.gurev) group.

### Throw It in a Hole

- When players play a card, they do not flip it over like normal but instead place it face down in the center of the table.
- The score of the game is not revealed until the game is over.
- Players do not get a clue back for successfully playing a 5.
- The game will automatically end if 3 strikes are accumulated.
- This variant was invented by [Jack Gurev's](https://www.facebook.com/jack.gurev) group.

### Reversed

- One of the suits is replaced with a reversed suit.
- The reversed suit must be played in the opposite order (e.g. 5, 4, 3, 2, 1).
- Two 1's are removed from the reversed suit.
- Two 5's are added to the reversed suit.

### Up or Down

- Two 1's are removed from each suit.
- One "START" card is added to each suit.
- When a stack is empty, you can play either a 1, a 5, or a START card on it.
- When a stack has a START card on it, you can play either a 2 or a 4 on it.
- If a stack was started with a 1 (or a START + 2), then it works as a normal stack.
- If a stack was started with a 5 (or a START + 4), then it must be completed in reverse.
- A clue token is given when a stack is completed, regardless of whether it is a normal stack or a reversed stack.
- This variant was invented by [Sean McCarthy on the BoardGameGeek forums](https://boardgamegeek.com/article/30863162).

### Synesthesia

- Only color clues may be given.
- In addition to their normal color, cards with rank 1 count as the first color, cards with rank 2 count as the second color, and so on.
- If the brown suit is in use, its cards only get clued by brown, and not as the color of their rank.

<br />

## Full Variant Listing

- See [this page](/data/variants.txt).
