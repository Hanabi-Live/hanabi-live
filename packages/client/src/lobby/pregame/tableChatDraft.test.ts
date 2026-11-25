// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GAME_CHAT_INPUT_ID } from "../../game/GameChatBox.tsx";
import { hide, moveChatDraftToGame } from "./pregame.ts";
import { PREGAME_CHAT_INPUT_ID } from "./PregameChat.tsx";

vi.mock("../../chatCommands.ts", () => ({ chatCommands: new Map() }));
vi.mock("../../modals.ts", () => ({}));
vi.mock("../../tooltips.ts", () => ({}));
vi.mock("../lobbyPage.ts", () => ({ hide: vi.fn() }));

function chatInput(id: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`#${id}`)!;
}

describe("the table chat draft", () => {
  beforeEach(() => {
    for (const id of [PREGAME_CHAT_INPUT_ID, GAME_CHAT_INPUT_ID]) {
      const input = document.createElement("input");
      input.id = id;
      document.body.append(input);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  test("moves to the game chat when the game starts", () => {
    chatInput(PREGAME_CHAT_INPUT_ID).value = "half a mess";

    moveChatDraftToGame();
    hide(false);

    expect(chatInput(GAME_CHAT_INPUT_ID).value).toBe("half a mess");
    expect(chatInput(PREGAME_CHAT_INPUT_ID).value).toBe("");
  });

  test("is cleared when we leave the pre-game", () => {
    chatInput(PREGAME_CHAT_INPUT_ID).value = "half a mess";

    hide();

    expect(chatInput(PREGAME_CHAT_INPUT_ID).value).toBe("");
  });
});
