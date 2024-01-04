import { z } from "zod";
import { VALID_SUIT_INDEXES } from "../constants";

export const suitIndex = z.custom<SuitIndex>((data) =>
  VALID_SUIT_INDEXES.includes(data as SuitIndex),
);

export type SuitIndex = (typeof VALID_SUIT_INDEXES)[number];
