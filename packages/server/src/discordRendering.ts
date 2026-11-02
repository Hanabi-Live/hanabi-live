import { getMaxConsecutiveMarks, truncateToMaxBytes } from "./utils";

interface DiscordNames {
  nickname: (id: string) => Promise<string>;
  role: (id: string) => Promise<string>;
  channel: (id: string) => Promise<string>;
}

/** Match Go's html.EscapeString, including the numeric quote entities. */
export function escapeDiscordHTML(text: string): string {
  return text.replaceAll(/["&'<>]/gu, (character) => {
    switch (character) {
      case "&": {
        return "&amp;";
      }

      case "<": {
        return "&lt;";
      }

      case ">": {
        return "&gt;";
      }

      case '"': {
        return "&#34;";
      }

      default: {
        return "&#39;";
      }
    }
  });
}

export function normalizeDiscordMessage(text: string): string | undefined {
  const normalized = truncateToMaxBytes(text, 300)
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{P}\p{S} ]/gu, "")
    .trim();
  return normalized === "" || getMaxConsecutiveMarks(normalized) > 3
    ? undefined
    : normalized;
}

export async function renderDiscordMessage(
  text: string,
  names: DiscordNames,
): Promise<string> {
  // Resolve only original tokens, never tokens introduced by malicious nicknames.
  const pattern = /<(@!?|@&|#)(\d{17,19})>/gu;
  let result = "";
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    result += escapeDiscordHTML(text.slice(offset, match.index));
    const [token, kind, id] = match;
    if (id === undefined) {
      throw new Error("Missing Discord mention ID.");
    }
    let name: string;
    if (kind === "#") {
      // Resolve sequentially to bound REST requests for a single message.
      // eslint-disable-next-line no-await-in-loop
      name = `#${await names.channel(id)}`;
    } else if (kind === "@&") {
      // eslint-disable-next-line no-await-in-loop
      name = `@${await names.role(id)}`;
    } else {
      // eslint-disable-next-line no-await-in-loop
      name = `@${await names.nickname(id)}`;
    }
    result += escapeDiscordHTML(name);
    offset = match.index + token.length;
  }
  result += escapeDiscordHTML(text.slice(offset));
  // Custom emoji remain escaped Discord tokens, interpreted by the existing client.
  return result.replaceAll(
    /(?<=^| )\|\|(.+?)\|\|(?= |$)/gu,
    '<span class="spoiler">$1</span>',
  );
}

export function discordOutboundText(username: string, text: string): string {
  const content = text
    .split(" ")
    .map((word) => {
      try {
        const url = new URL(word);
        return /^[a-z][\d+\-.a-z]*:\/\//iu.test(word) && url.host !== ""
          ? `<${word}>`
          : word;
      } catch {
        return word;
      }
    })
    .join(" ");
  const safeName = username
    .replaceAll(/([*\\_`|~])/gu, String.raw`\$1`)
    .replaceAll(/[\n\r]/gu, "");
  return username === "" ? content : `<**${safeName}**> ${content}`;
}

export function decodeDiscordHTML(text: string): string {
  return text.replaceAll(/&(?:amp|apos|gt|lt|quot|#34|#39);/gu, (entity) => {
    switch (entity) {
      case "&amp;": {
        return "&";
      }

      case "&lt;": {
        return "<";
      }

      case "&gt;": {
        return ">";
      }

      case "&quot;":
      case "&#34;": {
        return '"';
      }

      default: {
        return "'";
      }
    }
  });
}
