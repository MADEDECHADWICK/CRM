// packages/ui/src/Section.tsx
//
// A small-caps section heading with an optional right-side action, used to
// group content on scrolling screens.

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";

type SectionProps = {
  title: string;
  action?: ReactNode;
};

export function Section({ title, action }: SectionProps) {
  return (
    <View style={styles.row}>
      <View style={styles.titleWrap}>
        <View style={styles.accentBar} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 12,
  },

  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },

  accentBar: {
    width: 3,
    height: 15,
    borderRadius: 2,
    backgroundColor: tokens.color.accent,
  },

  title: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    color: tokens.color.inkMuted,
  },
});