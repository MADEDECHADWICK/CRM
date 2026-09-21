// packages/ui/src/AppHeader.tsx
//
// The standard app screen header: a large editorial title with optional
// subtitle and a right-aligned action slot (avatar, filter, add, etc.).

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";

import { topInset } from "./util";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function AppHeader({
  title,
  subtitle,
  right,
}: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
        ) : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: topInset,
    paddingBottom: 16,
  },

  textCol: {
    flex: 1,
    paddingRight: 12,
  },

  title: {
    ...tokens.type.h1,
    color: tokens.color.ink,
  },

  subtitle: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 5,
  },

  right: {
    marginBottom: 2,
  },
});