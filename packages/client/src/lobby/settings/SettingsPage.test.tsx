// @vitest-environment jsdom

import { defaultSettings } from "@hanabi-live/data";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Connection } from "../../Connection.ts";
import { globals } from "../../Globals.ts";
import { settingsChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import { SettingsPage } from "./SettingsPage.tsx";

vi.mock("../../theme.ts", () => ({ setDarkMode: vi.fn() }));
vi.mock("../../notifications.ts", () => ({ test: vi.fn() }));

const send = vi.fn();

function getInput(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  globals.conn = { send } as unknown as Connection;
  store.dispatch(settingsChanged(defaultSettings));
  send.mockClear();
  render(
    <Provider store={store}>
      <SettingsPage />
    </Provider>,
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SettingsPage", () => {
  test("a change goes to the server and shows that it is saved", () => {
    act(() => {
      getInput("colorblindMode")!.click();
    });
    expect(store.getState().session.settings.colorblindMode).toBe(true);
    expect(send).toHaveBeenCalledWith("settings", {
      settings: {
        colorblindMode: true,
      },
    });
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Saved");
    expect(status.className).toContain("tw:opacity-100");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(status.className).toContain("tw:opacity-0");
  });

  test("the H-Group level shows with the H-Group features, and can be cleared", () => {
    expect(getInput("hGroupLevel")).toBeNull();

    act(() => {
      getInput("hGroupConventions")!.click();
    });
    act(() => {
      fireEvent.change(getInput("hGroupLevel")!, {
        target: {
          value: "3",
        },
      });
    });
    expect(store.getState().session.settings.hGroupLevel).toBe(3);

    act(() => {
      fireEvent.change(getInput("hGroupLevel")!, {
        target: {
          value: "",
        },
      });
    });
    expect(store.getState().session.settings).not.toHaveProperty("hGroupLevel");
    expect(send).toHaveBeenLastCalledWith("settings", {
      settings: {},
      cleared: ["hGroupLevel"],
    });
  });

  test("the volume saves only when the slider is released", () => {
    const slider = getInput("settings-volume-slider")!;
    act(() => {
      fireEvent.input(slider, {
        target: {
          value: "80",
        },
      });
    });
    expect(screen.getByText("80%")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();

    act(() => {
      fireEvent.change(slider, {
        target: {
          value: "80",
        },
      });
    });
    expect(store.getState().session.settings.volume).toBe(80);
    expect(send).toHaveBeenCalledWith("settings", {
      settings: {
        volume: 80,
      },
    });
  });
});
