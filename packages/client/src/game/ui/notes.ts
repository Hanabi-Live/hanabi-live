// Users can right-click cards to record information on them.

import type { CardOrder } from "@hanabi-live/game";
import { ReadonlySet } from "complete-common";
import type Konva from "konva";
import * as chat from "../../chat";
import * as tooltips from "../../tooltips";
import { escapeHtml } from "../../utils";
import type { NoteSection } from "../noteSections";
import {
  composeNoteSections,
  getSectionMarker,
  getSectionText,
  getSectionsToEdit,
  normalizeNoteSections,
  normalizeNoteText,
  parseNoteSections,
  serializeNoteSections,
} from "../noteSections";
import { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";
import { getCardOrStackBase } from "./getCardOrStackBase";

const CLOSE_NOTE_KEYS = new ReadonlySet(["Enter", "Escape"]);

/**
 * Returns the "prepared" form of a section's text: HTML-escaped, with emotes and links added. This
 * is the only place where note text becomes HTML, and the input is escaped first, so user text can
 * never inject markup.
 */
function prepareContent(rawNote: string): string {
  const safe = escapeHtml(rawNote);
  return chat.getPreparedMessage(safe);
}

/** Returns the 1-indexed turn number of the state that is currently being viewed. */
export function getCurrentTurnNumber(): number {
  const { visibleState } = globals.state;
  const turnNum =
    visibleState === null
      ? globals.state.ongoingGame.turn.turnNum
      : visibleState.turn.turnNum;

  // The first turn of the game is represented internally as turn 0, but it is shown as turn 1.
  return turnNum + 1;
}

/**
 * Returns the HTML class list for a section cell based on the round it was written in, relative to
 * the round that is currently being viewed. The most recent round that is not in the future is the
 * one to highlight; rounds after the viewed round are faded.
 */
function getSectionCellClasses(
  round: number | null,
  turnNumber: number,
  highlightedRound: number | null,
): string {
  if (round !== null && round > turnNumber) {
    return "note-section note-section-future";
  }

  if (round !== null && round === highlightedRound) {
    return "note-section note-section-current";
  }

  return "note-section";
}

/** Returns the most recent round that is not after the given round, or null if there is none. */
function getHighlightedRound(
  rounds: ReadonlySet<number>,
  turnNumber: number,
): number | null {
  let highlighted: number | null = null;
  for (const round of rounds) {
    if (round <= turnNumber && (highlighted === null || round > highlighted)) {
      highlighted = round;
    }
  }
  return highlighted;
}

interface RenderNoteSectionOptions {
  /** CSS classes for the section cell; defaults to "note-section". */
  readonly cellClasses?: string;
  /** Render an input box for the section text (the note editor) instead of static text. */
  readonly inputId?: string;
  /** Whether to show the round marker inside the section cell; defaults to true. */
  readonly showRoundMarker?: boolean;
}

/**
 * Builds the DOM for one note section: an optional round marker, then the section text (as static
 * text or an input box in the note editor). This is the single rendering path for note sections;
 * both the tooltip and the editor use it.
 */
function renderNoteSection(
  section: NoteSection,
  options: RenderNoteSectionOptions = {},
): HTMLDivElement {
  const sectionCell = document.createElement("div");
  sectionCell.setAttribute("class", options.cellClasses ?? "note-section");

  const showRoundMarker = options.showRoundMarker ?? true;
  if (showRoundMarker && section.round !== null) {
    const roundLabel = document.createElement("div");
    roundLabel.setAttribute("class", "note-section-round");
    roundLabel.textContent = getSectionMarker(section.round);
    sectionCell.append(roundLabel);
  }

  const textElement = document.createElement("div");
  textElement.setAttribute("class", "note-section-text");
  if (options.inputId === undefined) {
    // "prepareContent" escapes the text before any formatting, so assigning the result as HTML is
    // safe; it is also the only HTML-producing step for note text.
    textElement.innerHTML = prepareContent(section.text);
  } else {
    const input = document.createElement("input");
    input.setAttribute("id", options.inputId);
    input.setAttribute("class", "note-input");
    input.setAttribute("type", "text");
    input.setAttribute("value", section.text);
    textElement.append(input);
  }
  sectionCell.append(textElement);

  return sectionCell;
}

/**
 * Renders a note as a series of sections, one for each round in which something was written. The
 * most recent section that is not in the future relative to the current round is highlighted, and
 * sections that were written after the current round are faded.
 */
function getSectionsContent(noteText: string): HTMLElement {
  const container = document.createElement("div");
  container.setAttribute("class", "note-sections");
  const sections = normalizeNoteSections(parseNoteSections(noteText));
  if (sections.length === 0) {
    return container;
  }

  const turnNumber = getCurrentTurnNumber();
  const rounds = new Set(
    sections
      .filter((section) => section.round !== null)
      .map((section) => section.round!),
  );
  const highlightedRound = getHighlightedRound(rounds, turnNumber);

  for (const section of sections) {
    container.append(
      renderNoteSection(section, {
        cellClasses: getSectionCellClasses(
          section.round,
          turnNumber,
          highlightedRound,
        ),
      }),
    );
  }

  return container;
}

// A player's note together with its parsed sections, for rendering the combined tooltip.
interface NoteEntry {
  readonly name: string;
  readonly sections: readonly NoteSection[];
}

/**
 * Renders the combined notes of all players & spectators as a grid: one column per player and one
 * row per round, so that the sections for the same round are aligned horizontally between players.
 */
function getCombinedContent(
  noteObjectArray: ReadonlyArray<{
    name: string;
    text: string;
    isSpectator: boolean;
  }>,
): HTMLElement {
  const turnNumber = getCurrentTurnNumber();
  const allRounds = new Set<number>();
  for (const noteObject of noteObjectArray) {
    if (noteObject.text === "") {
      continue;
    }
    for (const section of parseNoteSections(noteObject.text)) {
      if (section.round !== null) {
        allRounds.add(section.round);
      }
    }
  }
  const highlightedRound = getHighlightedRound(allRounds, turnNumber);

  // Parse each player's note into sections. Players with empty notes are skipped. Players are
  // grouped: players first, then spectators.
  const entries: NoteEntry[] = [];
  const spectators: NoteEntry[] = [];
  for (const noteObject of noteObjectArray) {
    if (noteObject.text === "") {
      continue;
    }

    const sections = normalizeNoteSections(parseNoteSections(noteObject.text));
    const entry = { name: noteObject.name, sections };
    if (noteObject.isSpectator) {
      spectators.push(entry);
    } else {
      entries.push(entry);
    }
  }

  const container = document.createElement("div");
  if (entries.length === 0 && spectators.length === 0) {
    return container;
  }

  function renderGroup(group: readonly NoteEntry[]): HTMLElement {
    const groupDiv = document.createElement("div");
    groupDiv.setAttribute("class", "note-grid");
    groupDiv.style.gridTemplateColumns = `max-content repeat(${group.length}, minmax(0, 1fr))`;

    // Compute the union of all rounds across the players in this group, in ascending order. The
    // legacy (unmarked) section is a shared row at the top.
    const hasLegacy = group.some((entry) =>
      entry.sections.some((section) => section.round === null),
    );
    const rounds = new Set<number>();
    for (const entry of group) {
      for (const section of entry.sections) {
        if (section.round !== null) {
          rounds.add(section.round);
        }
      }
    }
    const sortedRounds = [...rounds].toSorted((r1, r2) => r1 - r2);

    // Header row with the player names.
    const headerRow = document.createElement("div");
    headerRow.setAttribute("class", "note-grid-row note-grid-header");
    const headerCorner = document.createElement("div");
    headerCorner.setAttribute("class", "note-grid-row-header");
    headerRow.append(headerCorner);

    for (const entry of group) {
      const nameCell = document.createElement("div");
      nameCell.setAttribute("class", "note-grid-name");
      nameCell.textContent = entry.name;
      headerRow.append(nameCell);
    }
    groupDiv.append(headerRow);

    function renderCell(entry: NoteEntry, round: number | null): HTMLElement {
      const section =
        round === null
          ? entry.sections.find((s) => s.round === null)
          : entry.sections.find((s) => s.round === round);
      return renderNoteSection(section ?? { round, text: "" }, {
        cellClasses: getSectionCellClasses(round, turnNumber, highlightedRound),
        showRoundMarker: false,
      });
    }

    // One row per round; every player gets a cell in the row (empty if they have no note for it),
    // so the rows are aligned between the players.
    if (hasLegacy) {
      const legacyRow = document.createElement("div");
      legacyRow.setAttribute("class", "note-grid-row");
      const legacyHeader = document.createElement("div");
      legacyHeader.setAttribute("class", "note-grid-row-header");
      legacyRow.append(legacyHeader);
      for (const entry of group) {
        legacyRow.append(renderCell(entry, null));
      }
      groupDiv.append(legacyRow);
    }
    for (const round of sortedRounds) {
      const row = document.createElement("div");
      row.setAttribute("class", "note-grid-row");

      const roundHeader = document.createElement("div");
      const isFuture = round > turnNumber;
      const isCurrent = round === highlightedRound;
      const headerClasses = [
        "note-grid-row-header",
        isFuture ? "note-section-future" : "",
        isCurrent ? "note-grid-row-header-current" : "",
      ]
        .filter(Boolean)
        .join(" ");
      roundHeader.setAttribute("class", headerClasses);
      roundHeader.textContent = getSectionMarker(round);
      row.append(roundHeader);

      for (const entry of group) {
        row.append(renderCell(entry, round));
      }
      groupDiv.append(row);
    }

    return groupDiv;
  }

  // Titles divide the two groups when both are present.
  if (entries.length > 0) {
    if (spectators.length > 0) {
      container.append(renderNoteTitle("Players"));
    }
    container.append(renderGroup(entries));
  }
  if (spectators.length > 0) {
    if (entries.length > 0) {
      container.append(renderNoteTitle("Spectators"));
    }
    container.append(renderGroup(spectators));
  }

  return container;
}

/** Renders the title that separates the player group from the spectator group. */
function renderNoteTitle(title: string): HTMLElement {
  const titleDiv = document.createElement("div");
  titleDiv.setAttribute("class", "noteTitle");
  const span = document.createElement("span");
  span.textContent = title;
  titleDiv.append(span);
  return titleDiv;
}

/** Get the note content to show in the tooltip. */
function get(order: CardOrder, our: boolean): HTMLElement {
  // Show our note if the calling function specifically wants it or we are a player in an ongoing
  // game.
  if (our || globals.state.playing) {
    return getSectionsContent(globals.state.notes.ourNotes[order]?.text ?? "");
  }

  // Show the combined notes from the players & spectators in a round-aligned grid.
  const noteObjectArray = globals.state.notes.allNotes[order]!;
  return getCombinedContent(noteObjectArray);
}

/**
 * A note has been updated, so:
 * 1) Send the new note to the server.
 * 2) Dispatch an event with the updated note.
 * 3) Check for new card identities.
 */
export function set(order: CardOrder, text: string): void {
  // Clean up the note so that the sections are sorted by round and contain no duplicates.
  const normalizedText = normalizeNoteText(text);
  const oldNote = globals.state.notes.ourNotes[order]!.text;

  // The "repeat note" shortcut copies the text that was written for the current round, not the
  // entire note.
  globals.lastNote = getSectionText(normalizedText, getCurrentTurnNumber());

  // Send the note to the server.
  if (!globals.state.finished && normalizedText !== oldNote) {
    globals.lobby.conn!.send("note", {
      tableID: globals.lobby.tableID,
      order,
      note: normalizedText,
    });
  }

  globals.store!.dispatch({
    type: "editNote",
    order,
    text: normalizedText,
  });

  const card = getCardOrStackBase(order);
  if (card) {
    card.checkSpecialNote();
    card.setRaiseAndShadowOffset();
  }
}

export function update(card: HanabiCard, text: string): void {
  // Update the tooltip if it still needs to be shown.
  if (text === "" || globals.activeHover !== card) {
    const tooltip = `#tooltip-${card.tooltipName}`;
    tooltips.close(tooltip);
    globals.editingNote = null;
  } else {
    show(card);
  }

  // Update the card indicator.
  const visibleOld = card.noteIndicator.visible();
  const visibleNew = text !== "";
  if (visibleOld !== visibleNew) {
    card.noteIndicator.visible(visibleNew);
    globals.layers.card.batchDraw();
  }
}

/** Open the tooltip for this card. */
export function show(card: HanabiCard): void {
  const tooltip = `#tooltip-${card.tooltipName}`;

  // We want the tooltip to appear above the card by default.
  const pos = card.getAbsolutePosition();
  const posX = pos.x;
  let posY = pos.y - (card.height() * card.layout.scale().y) / 2;
  tooltips.setInstanceOption(tooltip, "side", "top");

  // Flip the tooltip if it is too close to the top of the screen.
  if (posY < 200) {
    // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout.
    posY = pos.y + (card.height() * card.layout.scale().y) / 2;
    tooltips.setInstanceOption(tooltip, "side", "bottom");
  }

  // Update the tooltip position.
  tooltips.setPosition(tooltip, posX, posY);

  // Update the tooltip content.
  tooltips.setInstanceContent(tooltip, getShownNoteContent(card));
  tooltips.open(tooltip);
}

/** Returns the note content to show in the tooltip for this card. */
function getShownNoteContent(card: HanabiCard): HTMLElement {
  const shownNote = get(card.state.order, false);
  if (card.state.location === "playStack") {
    const stackBaseNote = document.createElement("div");
    stackBaseNote.innerHTML = `<br><br>${card.suitDescriptionNote()}`;
    shownNote.append(stackBaseNote);
  }
  return shownNote;
}

/** Returns true if the given card is currently directly under the mouse pointer. */
function isCardHovered(card: HanabiCard): boolean {
  if (globals.loading || globals.isResizing) {
    return false;
  }
  // Konva clears this when the pointer leaves the stage, although its type declaration only
  // mentions null.
  const { pointerPos: pos } = globals.stage;

  if (!pos) {
    return false;
  }
  let shape: Konva.Node | null = globals.stage.getIntersection(pos);
  while (shape !== null) {
    if (
      shape === (card as unknown as Konva.Node)
      || shape === (card.layout as unknown as Konva.Node)
    ) {
      return true;
    }
    shape = shape.parent;
  }
  return false;
}

/**
 * Re-renders the content of the note tooltip that is currently open, if any. The highlighted note
 * section depends on the turn that is currently being viewed, so this is called when the turn
 * changes, e.g. when moving through a replay.
 */
export function refreshOpenTooltip(): void {
  // Do not interfere with the note editor, which does not show any highlighting and captures the
  // turn at the time that it was opened.
  if (globals.editingNote !== null) {
    return;
  }

  const { activeHover } = globals;
  if (!(activeHover instanceof HanabiCard)) {
    return;
  }

  const tooltip = `#tooltip-${activeHover.tooltipName}`;
  if (!tooltips.getStatus(tooltip).open) {
    return;
  }

  if (!isCardHovered(activeHover)) {
    tooltips.close(tooltip);
    globals.activeHover = null;
    return;
  }

  show(activeHover);
}

/** Returns the ID of the input for the section at the given index of the note editor. */
function getNoteInputId(card: HanabiCard, index: number): string {
  return `tooltip-${card.tooltipName}-input-${index}`;
}

/** Renders the note editor, with one input box for each section. */
function getNoteEditorContent(
  card: HanabiCard,
  rows: readonly NoteSection[],
): HTMLElement {
  const container = document.createElement("div");
  container.setAttribute("class", "note-sections");

  for (const [index, row] of rows.entries()) {
    container.append(
      renderNoteSection(row, { inputId: getNoteInputId(card, index) }),
    );
  }

  return container;
}

export function openEditTooltip(card: HanabiCard, isDesktop = true): void {
  // Do not edit any notes in dedicated replays.
  if (globals.state.finished) {
    return;
  }

  // Disable making notes on the stack bases outside of special variants.
  if (card.isStackBase && !globals.variant.throwItInAHole) {
    return;
  }

  // If a note tooltip is open on a card and we right click on the card again, the "focusout"
  // handler will automatically close the tooltip, but then this code will run and immediately
  // re-open the tooltip. Detect if this is happening and do nothing. The "focusout" event does not
  // fire on mobile, therefore we only check for desktop clients.
  const tooltip = `#tooltip-${card.tooltipName}`;
  const status = tooltips.getStatus(tooltip);
  if (isDesktop && status.state === "disappearing") {
    return;
  }

  show(card);

  globals.editingNote = card.state.order;

  const turnNumber = getCurrentTurnNumber();
  const originalNoteText =
    globals.state.notes.ourNotes[card.state.order]?.text ?? "";
  const rows = getSectionsToEdit(originalNoteText, turnNumber);

  tooltips.setInstanceContent(tooltip, getNoteEditorContent(card, rows));

  const inputIds = new Set(
    rows.map((_row, index) => getNoteInputId(card, index)),
  );

  function getInput(index: number): JQuery {
    return $(`#${getNoteInputId(card, index)}`);
  }

  function focusInput(index: number) {
    if (index < 0 || index >= rows.length) {
      return;
    }

    getInput(index).trigger("focus");
  }

  function getNewNoteText(): string {
    const texts = rows.map((_row, index) => {
      const value = getInput(index).val();
      if (typeof value !== "string") {
        throw new TypeError(
          `The value of the "#${getNoteInputId(card, index)}" element was not a string.`,
        );
      }

      // Convert any emoji tags (e.g. ":joy:") into the actual emoji.
      return chat.fillEmojis(value);
    });

    return serializeNoteSections(
      normalizeNoteSections(composeNoteSections(rows, texts)),
    );
  }

  function setupNoteInput(noteTextbox: JQuery, index: number) {
    noteTextbox.on("keydown", (event) => {
      event.stopPropagation();
      const { key } = event;

      // The up and down arrow keys move between the sections of the note.
      if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        chat.tabResetAutoCompleteList();
        focusInput(index + (key === "ArrowUp" ? -1 : 1));
        return;
      }

      if (key === "Tab") {
        event.preventDefault();
        chat.tab(noteTextbox, event);
        return;
      }

      if (!CLOSE_NOTE_KEYS.has(key)) {
        return;
      }

      globals.editingNote = null;

      let newNote: string;
      if (key === "Escape") {
        // If Escape is pressed, use the existing note, if any.
        newNote = globals.state.notes.ourNotes[card.state.order]?.text ?? "";
      } else {
        // If Enter is pressed, save all of the sections that were edited.
        newNote = getNewNoteText();

        set(card.state.order, newNote);
      }

      // Check to see if an event happened while we were editing this note.
      if (globals.actionOccurred) {
        globals.actionOccurred = false;
        tooltips.close(tooltip);
      }

      update(card, newNote);
    });

    // Reset the tab-complete variables after we have typed a new character.
    noteTextbox.on("keypress", () => {
      chat.tabResetAutoCompleteList();
    });

    noteTextbox.on("input", (event) => {
      const text = noteTextbox.val();
      if (typeof text !== "string") {
        throw new TypeError(
          "The value of the element in the input function is not a string.",
        );
      }

      // Check for emoji substitution.
      const newText = chat.substituteEmoji(text);
      if (newText !== null) {
        noteTextbox.val(newText);
        event.preventDefault();
      }
    });

    // Automatically close the tooltip if we click elsewhere on the screen, but keep it open when
    // moving between the sections of the note with the arrow keys. ("relatedTarget" is the element
    // that is receiving focus, which is synchronous, so this does not rely on a timeout.)
    noteTextbox.on("focusout", (event) => {
      const { relatedTarget } = event;
      const relatedTargetId =
        relatedTarget instanceof Element ? relatedTarget.id : "";
      if (inputIds.has(relatedTargetId)) {
        return;
      }

      globals.editingNote = null;
      chat.tabResetAutoCompleteList();
      tooltips.close(tooltip);
    });

    // Reset the tab-complete variables when an input box is focused.
    noteTextbox.on("focus", () => {
      chat.tabResetAutoCompleteList();
    });
  }

  for (const [index] of rows.entries()) {
    setupNoteInput(getInput(index), index);
  }

  // Automatically focus the input for the round that is currently being viewed. (This will not work
  // properly unless we put it in a callback.)
  const focusIndex = rows.findIndex((row) => row.round === turnNumber);
  setTimeout(() => {
    focusInput(focusIndex);
  }, 1);
}

/**
 * We just got a list of a bunch of notes, so show the note indicator for currently-visible cards.
 */
export function setAllCardIndicators(): void {
  // We iterate through the whole deck instead of using the index of the last drawn card to avoid
  // race conditions where we can get the "noteList" before the "actionList" is finished processing.
  for (const card of globals.deck) {
    card.setNoteIndicator();
  }
  for (const stackBase of globals.stackBases) {
    stackBase.setNoteIndicator();
  }
}
