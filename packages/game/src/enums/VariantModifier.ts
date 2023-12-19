/* eslint-disable isaacscript/consistent-enum-values */

import { ReadonlySet } from "isaacscript-common-ts";

/**
 * These correspond to values in the database. We want them to be as short as possible in order to
 * save hard drive space.
 */
export enum VariantModifier {
  RainbowOnes = "R1",
  RainbowTwos = "R2",
  RainbowThrees = "R3",
  RainbowFours = "R4",
  RainbowFives = "R5",

  PinkOnes = "P1",
  PinkTwos = "P2",
  PinkThrees = "P3",
  PinkFours = "P4",
  PinkFives = "P5",

  WhiteOnes = "W1",
  WhiteTwos = "W2",
  WhiteThrees = "W3",
  WhiteFours = "W4",
  WhiteFives = "W5",

  BrownOnes = "B1",
  BrownTwos = "B2",
  BrownThrees = "B3",
  BrownFours = "B4",
  BrownFives = "B5",

  OmniOnes = "O1",
  OmniTwos = "O2",
  OmniThrees = "O3",
  OmniFours = "O4",
  OmniFives = "O5",

  NullOnes = "N1",
  NullTwos = "N2",
  NullThrees = "N3",
  NullFours = "N4",
  NullFives = "N5",

  MuddyRainbowOnes = "M1",
  MuddyRainbowTwos = "M2",
  MuddyRainbowThrees = "M3",
  MuddyRainbowFours = "M4",
  MuddyRainbowFives = "M5",

  LightPinkOnes = "L1",
  LightPinkTwos = "L2",
  LightPinkThrees = "L3",
  LightPinkFours = "L4",
  LightPinkFives = "L5",

  DeceptiveOnes = "D1",
  DeceptiveTwos = "D2",
  DeceptiveThrees = "D3",
  DeceptiveFours = "D4",
  DeceptiveFives = "D5",

  CriticalOnes = "C1",
  CriticalTwos = "C2",
  CriticalThrees = "C3",
  CriticalFours = "C4",
  CriticalFives = "C5",

  ClueStarved = "CS",
  ColorBlind = "CB",
  NumberBlind = "NB",
  TotallyBlind = "TB",
  ColorMute = "CM",
  NumberMute = "NM",

  AlternatingClues = "AC",
  CowAndPig = "CP",
  Duck = "Du",
  OddsAndEvens = "OE",
  Synesthesia = "Sy",
  UpOrDown = "UD",
  ThrowItInAHole = "TH",
  Funnels = "Fu",
  Chimneys = "Ch",
  Sudoku = "Su",
}

export const VARIANT_MODIFIER_SET = new ReadonlySet(
  Object.values(VariantModifier),
);
