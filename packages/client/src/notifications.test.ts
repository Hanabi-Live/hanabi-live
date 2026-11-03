import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { send } from "./notifications";

const originalNotification = Object.getOwnPropertyDescriptor(
  globalThis,
  "Notification",
);

interface NotificationStub {
  addEventListener: (event: string, callback: () => void) => void;
}

function installNotificationMock(permission: NotificationPermission) {
  const mock = jest.fn<(...args: readonly unknown[]) => NotificationStub>();
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: Object.assign(mock, { permission }),
  });
  return mock;
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
    const listener = jest.fn<(event: string, callback: () => void) => void>();
    const notification = installNotificationMock("granted");
    notification.mockReturnValue({ addEventListener: listener });

    send("It is your turn.", "turn");

    expect(notification).toHaveBeenCalledWith("Hanab Live: It is your turn.", {
      icon: "/public/img/favicon-32x32.png",
      tag: "turn",
    });
    expect(listener).toHaveBeenCalledWith("click", expect.any(Function));
  });

  test("does not crash when Android Chrome forbids constructing notifications", () => {
    const notification = installNotificationMock("granted");
    notification.mockImplementation(() => {
      throw new TypeError(
        "Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.",
      );
    });
    expect(() => {
      send("It is your turn.", "turn");
    }).not.toThrow();
    expect(notification).toHaveBeenCalledTimes(1);
  });

  test("does not conceal unrelated notification failures", () => {
    const notification = installNotificationMock("granted");
    notification.mockImplementation(() => {
      throw new RangeError("Unexpected notification failure.");
    });
    expect(() => {
      send("It is your turn.", "turn");
    }).toThrow(RangeError);
  });
});
