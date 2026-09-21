// packages/ui/src/Chip.tsx
//
// A compact selectable pill — used for filters and short option pickers.

import { Pressable, StyleSheet, Text } from "react-native";

import { tokens } from "@crm/core";

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && !selected && styles.chipPressed,
      ]}
    >
      <Text
        style={[styles.label, selected && styles.labelSelected]}
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

  chipSelected: {
    backgroundColor: tokens.color.ink,
  },

  label: {
    ...tokens.type.caption,
    fontWeight: "600",
    color: tokens.color.inkMuted,
  },

  labelSelected: {
    color: tokens.color.white,
  },
});