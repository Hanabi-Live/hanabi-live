/**
 * The variants that players know to be fun, in groups, which the site features, such as in the
 * "Best scores" tab of a profile. Each is a recipe, which is a variant's identity, with its name in
 * a comment. A recipe that the catalog does not have, such as Critical Twos, is a new variant,
 * which the server creates once a table uses it.
 */
export const CURATED_VARIANT_GROUPS = [
  {
    // The first choice, above the groups.
    label: undefined,
    swatches: false,
    recipes: [
      "r-y-g-b-p", // No Variant
    ],
  },
  {
    label: "Special suits",
    swatches: true,
    recipes: [
      "r-y-g-b-p-bk", // Black (6 Suits)
      "r-y-g-b-ra", // Rainbow (5 Suits)
      "r-y-g-b-pi", // Pink (5 Suits)
      "r-y-g-b-wh", // White (5 Suits)
      "r-y-g-b-br", // Brown (5 Suits)
      "r-y-g-b-om", // Omni (5 Suits)
      "r-y-g-b-nu", // Null (5 Suits)
      "r-y-g-b-brra", // Muddy Rainbow (5 Suits)
      "r-y-g-b-whpi", // Light Pink (5 Suits)
      "r-y-g-b-pr", // Prism (5 Suits)
      "r-y-g-b-or", // Orange (5 Suits)
    ],
  },
  {
    label: "Dark suits",
    swatches: true,
    recipes: [
      "r-y-g-b-p-ra.dark", // Dark Rainbow (6 Suits)
      "r-y-g-b-p-pi.dark", // Dark Pink (6 Suits)
      "r-y-g-b-p-wh.dark", // Gray (6 Suits)
      "r-y-g-b-p-br.dark", // Dark Brown (6 Suits)
      "r-y-g-b-p-om.dark", // Dark Omni (6 Suits)
      "r-y-g-b-p-nu.dark", // Dark Null (6 Suits)
      "r-y-g-b-p-brra.dark", // Cocoa Rainbow (6 Suits)
      "r-y-g-b-p-whpi.dark", // Gray Pink (6 Suits)
      "r-y-g-b-p-pr.dark", // Dark Prism (6 Suits)
      "r-y-g-b-p-or.dark", // Dark Orange (6 Suits)
    ],
  },
  {
    label: "Special 1s",
    swatches: true,
    recipes: [
      "r-y-g-b-p_1ra", // Rainbow-Ones (5 Suits)
      "r-y-g-b-p_1pi", // Pink-Ones (5 Suits)
      "r-y-g-b-p_1wh", // White-Ones (5 Suits)
      "r-y-g-b-p_1br", // Brown-Ones (5 Suits)
      "r-y-g-b-p_1om", // Omni-Ones (5 Suits)
      "r-y-g-b-p_1nu", // Null-Ones (5 Suits)
      "r-y-g-b-p_1brra", // Muddy-Rainbow-Ones (5 Suits)
      "r-y-g-b-p_1whpi", // Light-Pink-Ones (5 Suits)
      "r-y-g-b-p_1de", // Deceptive-Ones (5 Suits)
    ],
  },
  {
    label: "Special 5s",
    swatches: true,
    recipes: [
      "r-y-g-b-p_5ra", // Rainbow-Fives (5 Suits)
      "r-y-g-b-p_5pi", // Pink-Fives (5 Suits)
      "r-y-g-b-p_5wh", // White-Fives (5 Suits)
      "r-y-g-b-p_5br", // Brown-Fives (5 Suits)
      "r-y-g-b-p_5om", // Omni-Fives (5 Suits)
      "r-y-g-b-p_5nu", // Null-Fives (5 Suits)
      "r-y-g-b-p_5brra", // Muddy-Rainbow-Fives (5 Suits)
      "r-y-g-b-p_5whpi", // Light-Pink-Fives (5 Suits)
      "r-y-g-b-p_5de", // Deceptive-Fives (5 Suits)
    ],
  },
  {
    label: "Rules",
    swatches: false,
    recipes: [
      "r-y-g-b-p_2crit", // Critical Twos (5 Suits)
      "r-y-g-b-p_3crit", // Critical Threes (5 Suits)
      "r-y-g-b-p_4crit", // Critical Fours (5 Suits)
      "r-y-g-b-p_1scarce", // Scarce Ones (5 Suits)
      "r-y-g-b-p_starved", // Clue Starved (5 Suits)
      "r-y-g-b-p_cb", // Color Blind (5 Suits)
      "r-y-g-b-p_nb", // Number Blind (5 Suits)
      "r-y-g-b-p_cb_nb", // Totally Blind (5 Suits)
      "r-y-g-b-p_cowpig", // Cow and Pig (5 Suits)
      "r-y-g-b-p_duck", // Duck (5 Suits)
      "r-y-g-b-p_oe", // Odds and Evens (5 Suits)
      "r-y-g-b-p.rev", // Reversed (5 Suits)
      "r-y-g-b-p_updown", // Up or Down (5 Suits)
      "r-y-g-b-p_hole", // Throw It in a Hole (5 Suits)
      "r-y-g-b-p_sudoku", // Sudoku (5 Suits)
    ],
  },
  {
    label: "Themed sets",
    swatches: false,
    recipes: [
      "tomato-mahogany-emerald-olive-berry-navy", // Ambiguous (6 Suits)
      "tomato-mahogany-carrot-berry-navy-sky", // Very Ambiguous (6 Suits)
      "iceea-aquaea-skyea-berryea-navyea-oceanea", // Extremely Ambiguous (6 Suits)
      "ruby-yam-geas-beatnik-plum-taupe", // Matryoshka (6 Suits)
      "tangerine-lime-cyan-indigo-cardinal", // Dual-Color (5 Suits)
      "tangerine-violet-maroon-jade-tan-cobalt", // Dual-Color (6 Suits)
      "r-gold-g-cyan-b-violet", // RGB Mix (6 Suits)
      "peach-tangerine-magenta-violet-lime-jungle", // Ambiguous & Dual-Color Mix
    ],
  },
] as const satisfies ReadonlyArray<{
  readonly label: string | undefined;
  /**
   * Whether a menu of the group shows the color of each variant's suit, such as Pink for Pink-Ones.
   */
  readonly swatches: boolean;
  readonly recipes: readonly string[];
}>;

/** The suit count that most curated variants have, which their short names leave out. */
const USUAL_SUITS_SUFFIX = " (5 Suits)";

/**
 * The name that a list of curated variants shows: without "(5 Suits)", unless another variant of
 * its group has the same name with another suit count, such as Dual-Color (6 Suits).
 */
export function getCuratedLabel(
  name: string,
  groupNames: readonly string[],
): string {
  if (!name.endsWith(USUAL_SUITS_SUFFIX)) {
    return name;
  }
  const short = name.slice(0, -USUAL_SUITS_SUFFIX.length);
  const shared = groupNames.some(
    (other) => other !== name && other.startsWith(`${short} (`),
  );
  return shared ? name : short;
}
