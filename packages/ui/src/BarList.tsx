// packages/ui/src/BarList.tsx
//
// A simple horizontal bar list for the management reports — the deck's
// "X leads booked fees" charts. Dependency-free (plain Views), so it works
// identically on web and native.

import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";

export type BarItem = {
  label: string;
  value: number;
  /** Optional formatted value shown at the end of the row. */
  caption?: string;
};

type BarListProps = {
  items: BarItem[];
  color?: string;
  emptyLabel?: string;
};

export function BarList({ items, color, emptyLabel = "No data." }: BarListProps) {
  if (items.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  const max = Math.max(1, ...items.map((item) => Math.abs(item.value)));

  return (
    <View>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.max(2, (Math.abs(item.value) / max) * 100)}%`,
                  backgroundColor: color ?? tokens.color.brand,
                },
              ]}
            />
          </View>
          <Text style={styles.value} numberOfLines={1}>
            {item.caption ?? String(item.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  label: {
    ...tokens.type.caption,
    color: tokens.color.ink,
    width: 110,
  },
  track: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: tokens.color.surfaceMuted,
    overflow: "hidden",
  },
  fill: {
    height: 14,
    borderRadius: 7,
  },
  value: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    width: 110,
    textAlign: "right",
  },
  empty: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },
});
