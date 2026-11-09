import { Platform, useWindowDimensions, type ViewStyle } from "react-native";

export function useSheetLayout(): { backdrop: ViewStyle; surface: ViewStyle } {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= 740
    ? { backdrop: { justifyContent: "center", padding: 28 }, surface: { borderRadius: 20, overflow: "hidden", backgroundColor: "#FFFFFF" } }
    : { backdrop: {}, surface: {} };
}
