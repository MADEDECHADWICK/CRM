// packages/ui/src/util.ts
//
// Platform-safe layout helpers shared by the app shell components. No
// safe-area-context dependency is installed, so these are pragmatic
// approximations for the home-screen tab UX.

import { Platform, StatusBar } from "react-native";

export const topInset =
  Platform.OS === "ios" ? 54 : (StatusBar.currentHeight ?? 24) + 6;

export const bottomInset = Platform.OS === "ios" ? 26 : 12;