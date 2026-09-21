// packages/ui/src/EmptyState.tsx
//
// Friendly centered placeholder for empty lists and error surfaces.

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";

import { Icon, type IconName } from "./icons";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={26} color={tokens.color.brand} />
      </View>

      <Text style={styles.title}>{title}</Text>

      {subtitle ? (
        <Text style={styles.subtitle}>{subtitle}</Text>
      ) : null}

      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },

  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  title: {
    ...tokens.type.h3,
    color: tokens.color.ink,
    textAlign: "center",
  },

  subtitle: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },

  action: {
    marginTop: 18,
  },
});