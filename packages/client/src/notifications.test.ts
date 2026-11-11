import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("./modals.ts", () => ({ showWarning: vi.fn() }));
const { send } = await import("./notifications.ts");

const originalNotification = Object.getOwnPropertyDescriptor(
  globalThis,
  "Notification",
);

interface NotificationStub {
  addEventListener: (event: string, callback: () => void) => void;
}

function installNotificationMock(permission: NotificationPermission) {
  const notification =
    vi.fn<(...args: readonly unknown[]) => NotificationStub>();
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: Object.assign(notification, { permission }),
  });
  return notification;
}

// Vitest only constructs mocks whose implementation is a function or a class.
function illegalConstructor(): never {
  throw new TypeError(
    "Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.",
  );
}

function failingConstructor(): never {
  throw new RangeError("Unexpected notification failure.");
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
    expect(() => {
      send("It is your turn.", "turn");
    }).not.toThrow();
  });

  test("does nothing without permission", () => {
    const notification = installNotificationMock("denied");
    send("It is your turn.", "turn");
    expect(notification).not.toHaveBeenCalled();
  });

  test("creates a notification and attaches a click handler on desktop", () => {
    const listener = vi.fn<(event: string, callback: () => void) => void>();
    const notification = installNotificationMock("granted");
    function notificationStub() {
      return { addEventListener: listener };
    }
    // Vitest only constructs mocks whose implementation is a function or a class.
    notification.mockImplementation(notificationStub);

    send("It is your turn.", "turn");

    expect(notification).toHaveBeenCalledWith("Hanab Live: It is your turn.", {
      icon: "/public/img/favicon-32x32.png",
      tag: "turn",
    });
    expect(listener).toHaveBeenCalledWith("click", expect.any(Function));
  });

  test("does not crash when Android Chrome forbids constructing notifications", () => {
    const notification = installNotificationMock("granted");
    notification.mockImplementation(illegalConstructor);
    expect(() => {
      send("It is your turn.", "turn");
    }).not.toThrow();
    expect(notification).toHaveBeenCalledTimes(1);
  });

  test("does not conceal unrelated notification failures", () => {
    const notification = installNotificationMock("granted");
    notification.mockImplementation(failingConstructor);
    expect(() => {
      send("It is your turn.", "turn");
    }).toThrow(RangeError);
  });
});
