// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Connection } from "../../Connection.ts";
import { globals } from "../../Globals.ts";
import { store } from "../../store.ts";
import { parseGameJson } from "../gameJson.ts";
import { WatchReplay } from "./WatchReplay.tsx";

const hide = vi.fn();
vi.mock("../lobbyPage.ts", () => ({
  hide: () => {
    hide();
  },
}));

/** The error tooltips that are open, by the ID of their text box. */
const openErrors = new Map<string, string>();
vi.mock("../../Tooltip.ts", async (importOriginal) => ({
  // The New UI's cards read its sizes.
  ...(await importOriginal<object>()),
  Tooltip: class {
    private readonly id: string;
    private content = "";
    constructor(anchor: HTMLElement) {
      this.id = anchor.id;
    }

    setContent(content: string) {
      this.content = content;
    }

    open() {
      openErrors.set(this.id, this.content);
    }

    close() {
      openErrors.delete(this.id);
    }

    destroy() {
      this.close();
    }
  },
}));

const send = vi.fn();

function getElement(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`);
}

beforeEach(() => {
  globals.conn = { send } as unknown as Connection;
  send.mockClear();
  hide.mockClear();
  openErrors.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function showPage() {
  render(
    <Provider store={store}>
      <WatchReplay />
    </Provider>,
  );
}

describe("WatchReplay", () => {
  test("starts with what was used last time", () => {
    localStorage.setItem("watchReplaySource", "json");
    localStorage.setItem("watchReplayJson", "{}");
    localStorage.setItem("watchReplayVisibility", "shared");
    localStorage.setItem("watchReplaySpoilerFree", "true");
    showPage();

    expect(getElement("replay-id")).toBeNull();
    expect(
      document.querySelector<HTMLTextAreaElement>("#replay-json")!.value,
    ).toBe("{}");
    expect(getElement("replay-visibility-shared")!.checked).toBe(true);
    expect(getElement("replay-spoiler-free")!.checked).toBe(true);
  });

  test("explains an ID that is too large while it is typed, and does not watch it", () => {
    showPage();
    fireEvent.change(getElement("replay-id")!, {
      target: {
        value: "99999999999",
      },
    });
    expect(openErrors.get("replay-id")).toBe(
      "The game ID must be a positive number.",
    );

    act(() => {
      getElement("replay-submit")!.click();
    });
    expect(send).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();

    fireEvent.change(getElement("replay-id")!, {
      target: {
        value: "42",
      },
    });
    expect(openErrors.has("replay-id")).toBe(false);
  });

  test("watches a replay and remembers it", () => {
    showPage();
    fireEvent.change(getElement("replay-id")!, {
      target: {
        value: "42",
      },
    });
    act(() => {
      getElement("replay-visibility-shared")!.click();
    });
    // A spoiler-free review must be shared.
    act(() => {
      getElement("replay-spoiler-free")!.click();
    });
    act(() => {
      getElement("replay-submit")!.click();
    });

    expect(send).toHaveBeenCalledWith("replayCreate", {
      source: {
        type: "saved",
        gameId: 42,
      },
      visibility: {
        type: "shared",
        joinExisting: false,
        spoilerFree: true,
      },
    });
    expect(hide).toHaveBeenCalled();
    expect(localStorage.getItem("watchReplayId")).toBe("42");
    expect(localStorage.getItem("watchReplayVisibility")).toBe("shared");
  });

  test("watches pasted JSON with Ctrl+Enter", () => {
    localStorage.setItem("watchReplaySource", "json");
    showPage();
    const jsonBox =
      document.querySelector<HTMLTextAreaElement>("#replay-json")!;
    const text = JSON.stringify({
      seed: "p2v0s1",
      options: {
        variantId: 0,
      },
    });
    fireEvent.change(jsonBox, {
      target: {
        value: text,
      },
    });

    fireEvent.keyDown(jsonBox, { key: "Enter" });
    expect(send).not.toHaveBeenCalled();

    fireEvent.keyDown(jsonBox, {
      key: "Enter",
      ctrlKey: true,
    });
    const parsed = parseGameJson(text);
    expect(send).toHaveBeenCalledWith("replayCreate", {
      source: {
        type: "imported",
        game: "gameJson" in parsed ? parsed.gameJson : undefined,
      },
      visibility: {
        type: "solo",
      },
    });
    expect(hide).toHaveBeenCalled();
  });
});
