import globals from "./globals";

export default function setGlobalEmpathy(enabled: boolean): void {
  if (enabled === globals.globalEmpathyEnabled) {
    return;
  }

  globals.globalEmpathyEnabled = enabled;
  for (const hand of globals.elements.playerHands) {
    hand.setEmpathy(enabled);
  }
}
