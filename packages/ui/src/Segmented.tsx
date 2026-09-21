// packages/ui/src/Segmented.tsx
//
// A pill-style segmented control for filtering toggle groups (Lead /
// Proposal, Pending / Done, etc.). Generic over the option key type.

import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";

type SegmentedOption<T extends string> = {
  key: T;
  label: string;
  count?: number;
};

type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (key: T) => void;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <View style={styles.wrap}>
      {options.map((option) => {
        const active = option.key === value;

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.item,
              {
                flexBasis:
                  options.length > 3 ? "30%" : 0,
              },
              active && styles.itemActive,
              pressed && !active && styles.itemPressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                active && styles.labelActive,
              ]}
            >
              {option.label}
            </Text>

            {option.count != null ? (
              <View
                style={[
                  styles.count,
                  active && styles.countActive,
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    active && styles.countTextActive,
                  ]}
                >
                  {option.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: tokens.color.surfaceMuted,
    borderRadius: tokens.radius.sm,
    padding: 4,
    gap: 4,
  },

  item: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
  },

  itemActive: {
    backgroundColor: tokens.color.surface,
    ...tokens.shadow.hairline,
  },

  itemPressed: {
    backgroundColor: tokens.color.surfacePressed,
  },

  label: {
    ...tokens.type.caption,
    fontWeight: "600",
    color: tokens.color.inkMuted,
  },

  labelActive: {
    color: tokens.color.ink,
  },

  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surfacePressed,
    alignItems: "center",
  },

  countActive: {
    backgroundColor: tokens.color.brandSoft,
  },

  countText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkFaint,
  },

  countTextActive: {
    color: tokens.color.brand,
  },
});