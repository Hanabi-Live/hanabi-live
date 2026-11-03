import { CHAT_EMOJIS } from "@hanabi-live/data";
import type { JSX } from "react";
import { Fragment } from "react";
import { emoteImages } from "../symbols";

const emojis = new Map<string, string>(Object.entries(CHAT_EMOJIS));

function symbols(text: string, links: boolean): JSX.Element {
  const parts: Array<JSX.Element | string> = [];
  let cursor = 0;
  for (const match of text.matchAll(
    /https?:\/\/[^\s<>]+|:[\w+-]+:|\b\w+\b/gu,
  )) {
    parts.push(text.slice(cursor, match.index));
    const token = match[0];
    const image = emoteImages.get(token);
    if (token.startsWith("http") && links) {
      const href = safeLink(token);
      parts.push(
        href ? (
          <a
            href={href}
            key={match.index}
            rel="noopener noreferrer"
            target="_blank"
          >
            {token}
          </a>
        ) : (
          token
        ),
      );
    } else if (image) {
      parts.push(
        <img
          alt={token}
          className="chat-emote"
          key={match.index}
          loading="lazy"
          src={image}
          title={token}
        />,
      );
    } else {
      parts.push(
        token.startsWith(":")
          ? (emojis.get(token.slice(1, -1)) ?? token)
          : token,
      );
    }
    cursor = match.index + token.length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function safeLink(href: string): string | undefined {
  try {
    const url = new URL(href, globalThis.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function RichText({
  html,
  onOptions,
}: {
  html: string;
  onOptions?: (json: string) => void;
}) {
  const document = new DOMParser().parseFromString(html, "text/html");
  function render(
    node: Node,
    key: number,
    depth: number,
  ): JSX.Element | string | null {
    if (depth > 20) {
      return null;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const literal = node.parentElement?.closest("a,code");
      return (
        <Fragment key={key}>
          {literal?.tagName === "CODE"
            ? node.textContent
            : symbols(node.textContent ?? "", !literal)}
        </Fragment>
      );
    }
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const children = [...node.childNodes].map((child, i) =>
      render(child, i, depth + 1),
    );
    switch (node.tagName) {
      case "BR": {
        return <br key={key} />;
      }

      case "STRONG":
      case "B": {
        return <strong key={key}>{children}</strong>;
      }

      case "EM":
      case "I": {
        return <em key={key}>{children}</em>;
      }

      case "CODE": {
        return <code key={key}>{children}</code>;
      }

      case "A": {
        const href = safeLink(node.getAttribute("href") ?? "");
        return href ? (
          <a href={href} key={key} rel="noopener noreferrer" target="_blank">
            {children}
          </a>
        ) : (
          <span key={key}>{children}</span>
        );
      }

      case "BUTTON": {
        const options = node.dataset.newOptions;
        return options && onOptions ? (
          <button key={key} onClick={() => onOptions(options)}>
            {children}
          </button>
        ) : (
          <span key={key}>{children}</span>
        );
      }

      case "SCRIPT":
      case "STYLE":
      case "IFRAME":
      case "OBJECT": {
        return null;
      }

      default: {
        return <span key={key}>{children}</span>;
      }
    }
  }
  return (
    <>{[...document.body.childNodes].map((node, i) => render(node, i, 0))}</>
  );
}
