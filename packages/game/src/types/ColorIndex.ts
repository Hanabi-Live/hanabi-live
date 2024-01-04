import { z } from "zod";
import { VALID_CLUE_COLOR_INDEXES } from "../constants";

export const colorIndex = z.custom<ColorIndex>((data) =>
  VALID_CLUE_COLOR_INDEXES.includes(data as ColorIndex),
);

export type ColorIndex = (typeof VALID_CLUE_COLOR_INDEXES)[number];
