import { afterEach, describe, expect, test } from "@jest/globals";
import { send } from "./notifications";

const originalNotification = Object.getOwnPropertyDescriptor(
  globalThis,
  "Notification",
);

function setNotification(implementation: unknown): void {
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: implementation,
  });
}

afterEach(() => {
  if (originalNotification === undefined) {
    Reflect.deleteProperty(globalThis, "Notification");
  } else {
    Object.defineProperty(globalThis, "Notification", originalNotification);
  }
});

describe("desktop notifications", () => {
  test("does nothing when the Notification API is unavailable", () => {
    Reflect.deleteProperty(globalThis, "Notification");
    expect(() => send("It is your turn.", "turn")).not.toThrow();
  });

  test("does nothing without permission", () => {
    class DeniedNotification {
      static readonly permission = "denied";
      constructor() {
        throw new Error("Notification must not be constructed.");
      }
    }
    setNotification(DeniedNotification);
    expect(() => send("It is your turn.", "turn")).not.toThrow();
  });

  test("creates a notification and attaches a click handler on desktop", () => {
    const seen: Array<{
      title: string;
      options: NotificationOptions | undefined;
      event: string;
    }> = [];
    class DesktopNotification {
      static readonly permission = "granted";
      private readonly entry: (typeof seen)[number];

      constructor(title: string, options?: NotificationOptions) {
        this.entry = { title, options, event: "" };
        seen.push(this.entry);
      }

      addEventListener(event: string): void {
        this.entry.event = event;
      }
    }
    setNotification(DesktopNotification);
    send("It is your turn.", "turn");

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      title: "Hanab Live: It is your turn.",
      options: { icon: "/public/img/favicon-32x32.png", tag: "turn" },
      event: "click",
    });
  });

  test("does not crash when Android Chrome forbids constructing notifications", () => {
    class MobileNotification {
      static readonly permission = "granted";
      constructor() {
        throw new TypeError(
          "Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.",
        );
      }
    }
    setNotification(MobileNotification);
    expect(() => send("It is your turn.", "turn")).not.toThrow();
  });

  test("does not conceal unrelated notification failures", () => {
    class BrokenNotification {
      static readonly permission = "granted";
      constructor() {
        throw new RangeError("Unexpected notification failure.");
      }
    }
    setNotification(BrokenNotification);
    expect(() => send("It is your turn.", "turn")).toThrow(RangeError);
  });
});
