// packages/ui/src/util.ts
//
// Safe-area layout helpers shared by the app shell components. Insets are
// read at runtime through react-native-safe-area-context, because they vary
// per device: a Dynamic Island iPhone reports a top inset around 59-62pt, a
// notched iPhone 44-48pt, and an iPhone SE 20pt with no bottom inset at all.

import { Platform, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type LayoutInsets = {
  top: number;
  bottom: number;
};

const androidTopInset = (StatusBar.currentHeight ?? 0) + 6;
const androidBottomInset = 12;

export function useLayoutInsets(): LayoutInsets {
  const insets = useSafeAreaInsets();

  if (Platform.OS === "ios") {
    return { top: insets.top, bottom: insets.bottom };
  }

  return {
    top: Math.max(insets.top, androidTopInset),
    bottom: Math.max(insets.bottom, androidBottomInset),
  };
}
