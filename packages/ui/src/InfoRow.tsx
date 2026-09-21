// packages/ui/src/InfoRow.tsx
//
// A label/value pair used inside detail sheets.

import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";

import { Icon, type IconName } from "./icons";

type InfoRowProps = {
  label: string;
  value?: string | null;
  icon?: IconName;
  last?: boolean;
  valueColor?: string;
};

export function InfoRow({
  label,
  value,
  icon,
  last = false,
  valueColor,
}: InfoRowProps) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.labelSlot}>
        {icon ? (
          <Icon name={icon} size={16} color={tokens.color.inkFaint} />
        ) : null}
        <Text style={styles.label}>{label}</Text>
      </View>

      <Text
        style={[
          styles.value,
          valueColor ? { color: valueColor } : null,
        ]}
        numberOfLines={1}
      >
        {value && value.length > 0 ? value : "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    gap: 12,
  },

  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },

  labelSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 1,
  },

  label: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  value: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
    flexShrink: 1,
  },
});