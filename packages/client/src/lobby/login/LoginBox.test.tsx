// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { store } from "../../store.ts";
import { signIn } from "../login.ts";
import { LoginBox } from "./LoginBox.tsx";
import {
  confirmingUsernameCleared,
  loginAlertCleared,
  loginStageChanged,
  noAccountFound,
} from "./loginSlice.ts";

vi.mock("../login.ts", () => ({
  acceptFirefoxWarning: vi.fn(),
  retryAutomaticLogin: vi.fn(),
  signIn: vi.fn(),
}));

function getInput(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)!;
}

function clickSignIn() {
  act(() => {
    document.querySelector<HTMLElement>("#login-button")!.click();
  });
}

beforeEach(() => {
  vi.mocked(signIn).mockClear();
  // The "jsdom" library does not scroll.
  Element.prototype.scrollIntoView = vi.fn<() => void>();
  store.dispatch(loginStageChanged("signIn"));
  render(
    <Provider store={store}>
      <LoginBox />
    </Provider>,
  );
});

afterEach(() => {
  cleanup();
  store.dispatch(loginAlertCleared());
  store.dispatch(confirmingUsernameCleared());
  store.dispatch(loginStageChanged("loading"));
});

test("an empty field explains itself instead of signing in", () => {
  clickSignIn();
  expect(screen.getByText("You must provide a username.")).toBeTruthy();

  fireEvent.change(getInput("login-username"), {
    target: {
      value: "Alice",
    },
  });
  clickSignIn();
  expect(screen.getByText("You must provide a password.")).toBeTruthy();
  expect(signIn).not.toHaveBeenCalled();
});

test("a username without an account is created only after a second sign-in", () => {
  fireEvent.change(getInput("login-username"), {
    target: {
      value: "Alice",
    },
  });
  fireEvent.change(getInput("login-password"), {
    target: {
      value: "pw",
    },
  });
  clickSignIn();
  expect(signIn).toHaveBeenLastCalledWith("Alice", "pw", undefined, false);

  act(() => {
    store.dispatch(noAccountFound("Alice"));
  });
  expect(screen.getByText("Create Account")).toBeTruthy();
  clickSignIn();
  expect(signIn).toHaveBeenLastCalledWith("Alice", "pw", undefined, true);

  // Editing the username cancels the creation.
  fireEvent.change(getInput("login-username"), {
    target: {
      value: "Alicia",
    },
  });
  expect(document.querySelector("#login-no-account")).toBeNull();
  expect(screen.getByText("Sign In")).toBeTruthy();
});

test("the change password form sends the new password", () => {
  act(() => {
    document.querySelector<HTMLElement>("#change-password-link")!.click();
  });
  expect(getInput("login-password").placeholder).toBe("Old Password");
  fireEvent.change(getInput("login-username"), {
    target: {
      value: "Alice",
    },
  });
  fireEvent.change(getInput("login-password"), {
    target: {
      value: "old",
    },
  });
  fireEvent.change(getInput("change-password"), {
    target: {
      value: "new",
    },
  });
  clickSignIn();
  expect(signIn).toHaveBeenLastCalledWith("Alice", "old", "new", false);
});
