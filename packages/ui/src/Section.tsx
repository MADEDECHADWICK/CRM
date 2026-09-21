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
      <Text style={styles.title}>{title}</Text>
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

  title: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    color: tokens.color.inkFaint,
  },
});