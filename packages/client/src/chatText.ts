// Splits the text of a chat message or a note into the parts that the client shows differently:
// links, emotes, and the chat commands that the server suggests. The chat shows the parts with
// React, and the notes, which are tooltips, show them as HTML.

import { CHAT_SPECIAL_EMOTES, CHAT_EMOTES as emotes } from "@hanabi-live/data";
import { find as linkifyFind } from "linkifyjs";
import { escapeHtml } from "./utils.ts";

export type ChatSegment =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "link"; readonly text: string; readonly href: string }
  /** A chat command that the server suggests, which a click puts in the chat input. */
  | { readonly type: "command"; readonly command: string }
  | { readonly type: "emote"; readonly name: string; readonly src: string }
  /** The label that starts a notice from the server. */
  | { readonly type: "notice"; readonly text: string };

export interface ChatTextOptions {
  /** Whether "@/command@" becomes a command. Only the pre-game chat shows them. */
  readonly commands?: boolean;

  /** Whether the first "[Server Notice]" is a notice. Only messages from the server have one. */
  readonly notice?: boolean;
}

const NOTICE_LABEL = "[Server Notice]";

/** A command that the server suggests looks like "@/command@". */
const COMMAND_REGEX = /@(\/[^@]*)@/u;

const EMOTE_DIRECTORY = "/public/img/emotes";

/** Discord emotes look like "<:PogChamp:254683883033853954>". */
const DISCORD_EMOTE_PATTERN = String.raw`<:(\w+):(\d+)>`;

// The heart matches anywhere, but the emotes with colons must be surrounded by whitespace.
const { "<3": HEART_EMOTE_PATH, ...COLON_EMOTE_PATHS } = CHAT_SPECIAL_EMOTES;
const HEART_EMOTE = "<3";

function escapeRegex(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}

/** The path of each emote, without the directory and the extension, by its name. */
const EMOTE_PATHS: ReadonlyMap<string, string> = new Map([
  ...Object.entries(emotes).flatMap(([category, names]) =>
    [...names].map((name): [string, string] => [name, `${category}/${name}`]),
  ),
  [HEART_EMOTE, HEART_EMOTE_PATH],
  ...Object.entries(COLON_EMOTE_PATHS),
]);

/**
 * Matches any emote. A Twitch emote must be a whole word ("\b" is a word boundary). Longer names
 * come first, so that a name that starts with another one matches whole.
 */
const EMOTE_REGEX = new RegExp(
  [
    DISCORD_EMOTE_PATTERN,
    escapeRegex(HEART_EMOTE),
    ...Object.keys(COLON_EMOTE_PATHS).map(
      (code) => String.raw`(?<=^|\s)${escapeRegex(code)}(?=\s|$)`,
    ),
    String.raw`\b(?:${Object.values(emotes)
      .flat()
      .toSorted((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join("|")})\b`,
  ].join("|"),
  "gu",
);

function emoteSrc(path: string): string {
  return `${EMOTE_DIRECTORY}/${path}.png`;
}

/** Splits text at each match of a regular expression, and turns each match into a segment. */
function splitText(
  text: string,
  regex: RegExp,
  toSegment: (match: RegExpExecArray) => ChatSegment,
): readonly ChatSegment[] {
  const segments: ChatSegment[] = [];
  let start = 0;
  for (const match of text.matchAll(regex)) {
    if (match.index > start) {
      segments.push({
        type: "text",
        text: text.slice(start, match.index),
      });
    }
    segments.push(toSegment(match));
    start = match.index + match[0].length;
  }
  if (start < text.length) {
    segments.push({
      type: "text",
      text: text.slice(start),
    });
  }
  return segments;
}

/** Applies a step to the text segments, and keeps the others. */
function mapText(
  segments: readonly ChatSegment[],
  step: (text: string) => readonly ChatSegment[],
): readonly ChatSegment[] {
  return segments.flatMap((segment) =>
    segment.type === "text" ? step(segment.text) : [segment],
  );
}

function emoteSegments(text: string): readonly ChatSegment[] {
  return splitText(text, EMOTE_REGEX, (match) => {
    const [name, discordName, discordId] = match;
    if (discordName !== undefined && discordId !== undefined) {
      return {
        type: "emote",
        name: discordName,
        src: `https://cdn.discordapp.com/emojis/${discordId}.png`,
      };
    }
    return {
      type: "emote",
      name,
      src: emoteSrc(EMOTE_PATHS.get(name)!),
    };
  });
}

function commandSegments(text: string): readonly ChatSegment[] {
  return splitText(
    text,
    new RegExp(COMMAND_REGEX.source, "gu"),
    ([, command]) => ({
      type: "command",
      command: command!,
    }),
  );
}

function linkSegments(text: string): readonly ChatSegment[] {
  const segments: ChatSegment[] = [];
  let start = 0;
  for (const link of linkifyFind(text)) {
    if (link.start > start) {
      segments.push({
        type: "text",
        text: text.slice(start, link.start),
      });
    }
    segments.push({
      type: "link",
      text: link.value,
      href: link.href,
    });
    ({ end: start } = link);
  }
  if (start < text.length) {
    segments.push({
      type: "text",
      text: text.slice(start),
    });
  }
  return segments;
}

/** Marks the first notice label in the text segments. */
function noticeSegments(
  segments: readonly ChatSegment[],
): readonly ChatSegment[] {
  const i = segments.findIndex(
    (segment) => segment.type === "text" && segment.text.includes(NOTICE_LABEL),
  );
  const segment = segments[i];
  if (segment?.type !== "text") {
    return segments;
  }
  const [before = "", ...after] = segment.text.split(NOTICE_LABEL);
  const parts: readonly ChatSegment[] = [
    {
      type: "text",
      text: before,
    },
    {
      type: "notice",
      text: NOTICE_LABEL,
    },
    {
      type: "text",
      text: after.join(NOTICE_LABEL),
    },
  ];
  return [
    ...segments.slice(0, i),
    ...parts.filter((part) => part.type !== "text" || part.text !== ""),
    ...segments.slice(i + 1),
  ];
}

/** Splits text into its links, emotes, and plain text, and its commands and notice if asked. */
export function chatSegments(
  text: string,
  options: ChatTextOptions = {},
): readonly ChatSegment[] {
  // Links come first, so that nothing inside of a link changes it.
  let segments = linkSegments(text);
  if (options.commands === true) {
    segments = mapText(segments, commandSegments);
  }
  if (options.notice === true) {
    segments = noticeSegments(segments);
  }
  return mapText(segments, emoteSegments);
}

function segmentHtml(segment: ChatSegment): string {
  switch (segment.type) {
    case "link": {
      return `<a href="${escapeHtml(segment.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment.text)}</a>`;
    }

    case "emote": {
      return `<img class="chat-emote" src="${escapeHtml(segment.src)}" alt="${escapeHtml(segment.name)}" />`;
    }

    case "text":
    case "notice": {
      return escapeHtml(segment.text);
    }

    case "command": {
      return escapeHtml(segment.command);
    }
  }
}

/** Returns text, such as a note, as HTML with its links and emotes. */
export function chatTextHtml(text: string): string {
  return chatSegments(text).map(segmentHtml).join("");
}
