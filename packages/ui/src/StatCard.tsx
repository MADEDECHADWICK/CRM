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

      <Text style={styles.value}>{value}</Text>

      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 16,
    ...tokens.shadow.hairline,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  label: {
    flexShrink: 1,
    ...tokens.type.micro,
    textTransform: "uppercase",
    color: tokens.color.inkFaint,
  },

  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  value: {
    ...tokens.type.h2,
    color: tokens.color.ink,
    marginTop: 12,
  },

  sub: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 3,
  },
});