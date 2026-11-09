// packages/ui/src/Card.tsx
//
// The base surface container. Can be constrasted with a pressable card for
// navigable list rows.

import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { tokens } from "@crm/core";

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Reports the card's position so a screen can scroll it into view. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function Card({ children, onPress, style, onLayout }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onLayout={onLayout}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.card,
          pressed && styles.pressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View onLayout={onLayout} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 20,
    marginBottom: 14,
    ...tokens.shadow.card,
  },

  pressed: {
    backgroundColor: tokens.color.surfacePressed,
  },
});
