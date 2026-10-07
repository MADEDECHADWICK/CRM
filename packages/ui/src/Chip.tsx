// packages/ui/src/Chip.tsx
//
// A compact selectable pill — used for filters and short option pickers.

import { Pressable, StyleSheet, Text } from "react-native";

import { tokens } from "@crm/core";

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /**
   * Renders the chip as unavailable and ignores presses.
   *
   * For options that are visible and relevant but cannot currently be chosen —
   * somebody who already holds the one post that only one person may hold, for
   * instance. Omitting them from the list entirely would hide the constraint
   * that makes the picker look arbitrary, so they stay visible and explain
   * themselves; the caller's own caption is where the reason belongs.
   */
  disabled?: boolean;
};

export function Chip({ label, selected, onPress, disabled }: ChipProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.chip,
        disabled && styles.chipDisabled,
        selected && styles.chipSelected,
        pressed && !selected && !disabled && styles.chipPressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          disabled && styles.labelDisabled,
          selected && styles.labelSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surfaceMuted,
  },

  chipPressed: {
    backgroundColor: tokens.color.border,
  },

  chipDisabled: {
    opacity: 0.45,
  },

  chipSelected: {
    backgroundColor: tokens.color.ink,
  },

  label: {
    ...tokens.type.caption,
    fontWeight: "600",
    color: tokens.color.inkMuted,
  },

  labelDisabled: {
    textDecorationLine: "line-through",
  },

  labelSelected: {
    color: tokens.color.white,
  },
});