// packages/ui/src/Segmented.tsx
//
// A pill-style segmented control for filtering toggle groups (Lead /
// Proposal, Pending / Done, etc.). Generic over the option key type.
// With a few options the pills stretch evenly across one row; with many
// options the bar becomes a single-line horizontally scrollable strip so
// the pills never wrap into a ragged second line.

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

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
  const many = options.length > 3;

  const control = options.map((option) => {
    const active = option.key === value;

    return (
      <Pressable
        key={option.key}
        onPress={() => onChange(option.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          styles.item,
          many ? styles.itemSnug : styles.itemGrow,
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
  });

  return many ? (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {control}
      </ScrollView>
    </View>
  ) : (
    <View style={styles.wrap}>{control}</View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "#EDF1F5",
    borderRadius: tokens.radius.sm,
    padding: 4,
    gap: 4,
    overflow: "hidden",
  },

  scrollContent: {
    flexDirection: "row",
    gap: 4,
    paddingRight: 4,
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
  },

  itemGrow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },

  itemSnug: {
    flexShrink: 0,
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
    color: tokens.color.brand,
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
