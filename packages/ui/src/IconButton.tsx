// packages/ui/src/IconButton.tsx
//
// A round icon pressable for header actions + a full-sized Floating Action
// Button for primary create actions.

import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { tokens } from "@crm/core";

import { Icon, type IconName } from "./icons";

type IconButtonProps = {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  bg?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  name,
  onPress,
  size = 20,
  color = tokens.color.inkMuted,
  bg = tokens.color.surface,
  label,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: bg },
        pressed && styles.iconPressed,
        style,
      ]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

type FabProps = {
  name: IconName;
  onPress: () => void;
  label?: string;
};

export function Fab({ name, onPress, label }: FabProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.fab,
        pressed && styles.fabPressed,
      ]}
    >
      <Icon name={name} size={26} color={tokens.color.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.hairline,
  },

  iconPressed: {
    backgroundColor: tokens.color.surfacePressed,
  },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
    ...tokens.shadow.floated,
  },

  fabPressed: {
    opacity: 0.92,
  },
});
