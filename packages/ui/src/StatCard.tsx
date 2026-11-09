// packages/ui/src/StatCard.tsx
//
// A financial-style stat tile: micro-caption label, optional soft accent
// icon, a large value and an optional supporting line.

import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";

import { Icon, type IconName } from "./icons";

type StatCardProps = {
  label: string;
  value: string | number;
  icon?: IconName;
  accent?: string;
  soft?: string;
  sub?: string;
};

export function StatCard({
  label,
  value,
  icon,
  accent = tokens.color.brand,
  soft = tokens.color.brandSoft,
  sub,
}: StatCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text
          style={styles.label}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {label}
        </Text>

        {icon ? (
          <View style={[styles.iconCircle, { backgroundColor: soft }]}>
            <Icon name={icon} size={15} color={accent} />
          </View>
        ) : null}
      </View>

      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{typeof value === "number" ? value.toLocaleString() : value}</Text>

      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
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
    minHeight: 145,
    ...tokens.shadow.card,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  label: {
    flexShrink: 1,
    ...tokens.type.caption,
    fontWeight: "600",
    color: tokens.color.inkMuted,
  },

  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  value: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "600",
    letterSpacing: -1,
    color: tokens.color.brand,
    marginTop: 16,
  },

  sub: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 3,
    lineHeight: 18,
    minHeight: 36,
  },
});
