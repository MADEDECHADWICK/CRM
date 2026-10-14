import { Alert as RNAlert, Platform } from "react-native";

/**
 * Cross-platform Alert.
 *
 * React Native Web does not implement `Alert.alert` — it is a no-op — so every
 * confirmation and validation message was silently doing nothing on the web
 * client (the sign-out confirm never appeared, so logout never ran). This shim
 * keeps the exact react-native call signature and maps it onto the browser's
 * native dialogs on web, delegating to the real Alert everywhere else.
 *
 * Import this instead of `Alert` from "react-native":
 *   import { Alert } from "../lib/dialogs";
 */

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

const browser = globalThis as unknown as {
  alert?: (message: string) => void;
  confirm?: (message: string) => boolean;
};

function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    RNAlert.alert(title, message, buttons as never);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;
  const list = buttons ?? [];

  // A single button is just an acknowledgement.
  if (list.length <= 1) {
    browser.alert?.(text);
    list[0]?.onPress?.();
    return;
  }

  // Two or more: treat the first non-cancel button as the confirmation.
  const confirmButton = list.find((button) => button.style !== "cancel") ?? list[list.length - 1];
  const cancelButton = list.find((button) => button.style === "cancel");

  if (browser.confirm?.(text)) {
    confirmButton?.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}

export const Alert = { alert };
