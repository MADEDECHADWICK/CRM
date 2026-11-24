import { Platform, type TextStyle } from "react-native";

/**
 * Removes the browser's default focus rectangle from text inputs.
 *
 * react-native-web renders TextInput as a real DOM input, so Chrome/Edge draw
 * their own inner focus outline on top of the wrapper's brand border. That
 * double border is the "typing box" that appears inside every form field.
 * Native platforms have no such outline, so this is a no-op there.
 */
export const webTextInputReset = (Platform.OS === "web"
  ? {
      outlineStyle: "none",
      outlineWidth: 0,
      boxShadow: "none",
    }
  : {}) as TextStyle;
