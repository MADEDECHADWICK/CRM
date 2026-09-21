// packages/ui/src/Screen.tsx
//
// The outer container for every screen: background canvas, optional
// scrolling, and keyboard handling. Screens lay their own headers out so
// they can add the platform top inset where it matters.

import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { tokens } from "@crm/core";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  bg?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement;
};

export function Screen({
  children,
  scroll = true,
  padded = true,
  bg,
  contentContainerStyle,
  refreshControl,
}: ScreenProps) {
  const body = (
    <View style={[padded && styles.padded, contentContainerStyle]}>
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