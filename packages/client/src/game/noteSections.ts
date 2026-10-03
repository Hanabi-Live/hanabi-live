/**
 * Card notes are stored as a single string, but they are displayed and edited as a series of
 * sections: one for each turn (round) in which the player wrote something about the card.
 *
 * A section is introduced by a marker of the form "#N", where N is the 1-indexed turn number, and
 * everything after it belongs to that round until the next marker.
 *
 * For example, the note "#3 r2" has a single section for turn 3 with the text "r2", and separate
 * sections are joined together with the pipe character when the note is stored.
 *
 * Notes that were written before this feature existed have no marker. They are treated as a single
 * "legacy" section with a round of null, and they keep no marker until their text is edited.
 */

export interface NoteSection {
  /** The 1-indexed turn number that this section belongs to, or null if it is unknown. */
  readonly round: number | null;

  readonly text: string;
}

const SECTION_MARKER_PATTERN = /^#(\d+)(?:\s|$)/;
const SECTION_MARKER_STRIP_PATTERN = /^#\d+\s*/;

/** Removes the section marker from the beginning of a piece of note text, if there is one. */
export function stripSectionMarker(text: string): string {
  return text.replace(SECTION_MARKER_STRIP_PATTERN, "");
}

/** Returns the section marker for a round, e.g. "#5". */
export function getSectionMarker(round: number): string {
  return `#${round}`;
}

/** Parses a note string into a list of sections, in the order that they appear. */
export function parseNoteSections(noteText: string): readonly NoteSection[] {
  const sections: NoteSection[] = [];

  for (const chunk of noteText.split("|")) {
    const trimmedChunk = chunk.trim();
    if (trimmedChunk === "") {
      continue;
    }

    const match = SECTION_MARKER_PATTERN.exec(trimmedChunk);
    if (match === null) {
      // A chunk without a marker belongs to the section that came before it. If this is the first
      // chunk, then it is a legacy note.
      const lastSection = sections.at(-1);
      if (lastSection === undefined) {
        sections.push({ round: null, text: trimmedChunk });
      } else {
        const newText =
          lastSection.text === ""
            ? trimmedChunk
            : `${lastSection.text} | ${trimmedChunk}`;
        sections[sections.length - 1] = {
          round: lastSection.round,
          text: newText,
        };
      }
      continue;
    }

    sections.push({
      round: Number.parseInt(match[1]!, 10),
      text: trimmedChunk.slice(match[0].length).trim(),
    });
  }

  return sections;
}

/** Serializes a list of sections into a note string, skipping any that are empty. */
export function serializeNoteSections(
  sections: readonly NoteSection[],
): string {
  const parts: string[] = [];
  for (const section of sections) {
    const text = section.text.trim();
    if (text === "") {
      continue;
    }
    parts.push(section.round === null ? text : `#${section.round} ${text}`);
  }

  return parts.join(" | ");
}

/**
 * Cleans up a list of sections so that it can be stored: empty sections are removed, sections are
 * sorted by round, and if there are multiple sections for the same round, then the latest one wins.
 * (Legacy sections have no round, so they are kept at the front.)
 */
export function normalizeNoteSections(
  sections: readonly NoteSection[],
): readonly NoteSection[] {
  const legacyTexts: string[] = [];
  const roundToText = new Map<number, string>();

  for (const section of sections) {
    const text = section.text.trim();
    if (text === "") {
      continue;
    }

    if (section.round === null) {
      legacyTexts.push(text);
    } else {
      roundToText.set(section.round, text);
    }
  }

  const normalizedSections: NoteSection[] = [];
  const legacyText = legacyTexts.join(" | ");
  if (legacyText !== "") {
    normalizedSections.push({ round: null, text: legacyText });
  }

  const rounds = [...roundToText.keys()].toSorted(
    (round1, round2) => round1 - round2,
  );
  for (const round of rounds) {
    normalizedSections.push({ round, text: roundToText.get(round)! });
  }

  return normalizedSections;
}

/** Cleans up a note string by parsing it, normalizing the sections, and serializing it again. */
export function normalizeNoteText(noteText: string): string {
  return serializeNoteSections(
    normalizeNoteSections(parseNoteSections(noteText)),
  );
}

/** Returns the text of the section for the given round, or an empty string if there is none. */
export function getSectionText(noteText: string, round: number): string {
  const section = parseNoteSections(noteText).find(
    (noteSection) => noteSection.round === round,
  );
  return section?.text ?? "";
}

/**
 * Returns a new note string where the section for the given round has the specified text, creating
 * the section if it does not already exist.
 */
export function setSectionText(
  noteText: string,
  round: number,
  text: string,
): string {
  const sections = parseNoteSections(noteText).filter(
    (noteSection) => noteSection.round !== round,
  );

  return serializeNoteSections(
    normalizeNoteSections(insertSectionSorted(sections, { round, text })),
  );
}

/**
 * Returns a new note string where the section for the given round has been moved to the new round,
 * keeping its text. A `round` of null targets the legacy (unmarked) section, which adopts the new
 * round when it is moved. If there is no section for the given round, the note is unchanged.
 */
export function moveSectionToRound(
  noteText: string,
  round: number | null,
  newRound: number,
): string {
  const sections = parseNoteSections(noteText);
  const section = sections.find((noteSection) => noteSection.round === round);
  if (section === undefined) {
    return noteText;
  }

  return serializeNoteSections(
    normalizeNoteSections(
      insertSectionSorted(
        sections.filter((noteSection) => noteSection !== section),
        { round: newRound, text: section.text },
      ),
    ),
  );
}

/** Returns a copy of the sections with the new section inserted in sorted position. */
function insertSectionSorted(
  sections: readonly NoteSection[],
  newSection: {
    round: number;
    text: string;
  },
): readonly NoteSection[] {
  const mutableSections = [...sections];
  const insertIndex = mutableSections.findIndex(
    (section) => section.round !== null && section.round > newSection.round,
  );
  if (insertIndex === -1) {
    mutableSections.push(newSection);
  } else {
    mutableSections.splice(insertIndex, 0, newSection);
  }

  return mutableSections;
}

/**
 * Returns the sections to show in the note window: all of the existing sections, plus an empty one
 * for the round that is currently being viewed. (The new section is placed in the position that it
 * will occupy when the note is saved.)
 */
export function getSectionsToEdit(
  noteText: string,
  round: number,
): readonly NoteSection[] {
  const sections = normalizeNoteSections(parseNoteSections(noteText));
  if (sections.some((section) => section.round === round)) {
    return sections;
  }

  return insertSectionSorted(sections, { round, text: "" });
}

/**
 * Combines the edited rows of the note window back into a list of sections. Rows keep their round,
 * including legacy (unmarked) rows, so that editing the text of a legacy note does not falsely
 * re-attribute it to the round that is currently being viewed. A section marker typed at the
 * beginning of a row's text (e.g. "#5 ...") re-attributes that text to the marked round instead.
 */
export function composeNoteSections(
  rows: readonly NoteSection[],
  texts: readonly string[],
): readonly NoteSection[] {
  const sections: NoteSection[] = [];

  for (const [index, row] of rows.entries()) {
    const text = (texts[index] ?? "").trim();
    if (text === "") {
      continue;
    }

    const match = SECTION_MARKER_PATTERN.exec(text);
    const round = match === null ? row.round : Number.parseInt(match[1]!, 10);
    const sectionText =
      match === null ? text : text.slice(match[0].length).trim();
    if (sectionText === "") {
      continue;
    }

    sections.push({ round, text: sectionText });
  }

  return sections;
}
