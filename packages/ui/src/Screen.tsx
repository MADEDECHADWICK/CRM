// packages/ui/src/Screen.tsx
//
// The outer container for every screen: background canvas, optional
// scrolling, and keyboard handling. Screens lay their own headers out so
// they can add the platform top inset where it matters.

import type { ReactNode, Ref } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { tokens } from "@crm/core";

import { useLayoutInsets } from "./util";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  bg?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Handle on the inner ScrollView, for screens that scroll to an item. */
  scrollRef?: Ref<ScrollView>;
};

export function Screen({
  children,
  scroll = true,
  padded = true,
  bg,
  contentContainerStyle,
  refreshControl,
  scrollRef,
}: ScreenProps) {
  const insets = useLayoutInsets();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1024;

  const body = (
    <View
      style={[
        padded && styles.padded,
        { paddingTop: insets.top + (desktop ? 28 : 18) },
        Platform.OS === "web" && { width: "100%", maxWidth: 1440, alignSelf: "center" },
        desktop && { paddingHorizontal: width >= 1600 ? 48 : 36 },
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, bg ? { backgroundColor: bg } : null]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{body}</View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: tokens.color.canvas,
  },

  scrollContent: {
    flexGrow: 1,
  },

  padded: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
});
