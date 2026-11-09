// packages/ui/src/PageHero.tsx
//
// The shared page-identifier band used at the top of every app screen (beyond
// the login hero). A soft brand-tinted strip carrying a monogram tile, the
// screen title + subtitle, and an optional right-aligned slot (count, action,
// filter). Screens drop this in instead of hand-rolling headers so the whole
// app shares one visual voice.

import type { ReactNode } from "react";
import { Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { tokens } from "@crm/core";

import type { IconName } from "./icons";
import { Icon, IconSet } from "./icons";

type PageHeroProps = {
  icon: IconName;
  iconColor?: string;
  tint?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function PageHero({
  icon,
  iconColor,
  tint,
  title,
  subtitle,
  right,
}: PageHeroProps) {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.band}>
      <View
        style={[
          styles.mark,
          { backgroundColor: tint ?? tokens.color.brandSoft },
        ]}
      >
        <Icon
          name={icon}
          size={22}
          color={iconColor ?? tokens.color.brand}
        />
      </View>

      <View style={styles.textCol}>
        <Text accessibilityRole="header" style={[styles.title, width < 600 && { fontSize: 24, lineHeight: 31 }]}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
        ) : null}
      </View>

      {right ? <View style={[styles.right, width < 600 && { marginLeft: "auto" }]}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 26,
    paddingTop: 6,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },

  mark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  textCol: {
    flex: 1,
    minWidth: 150,
    paddingRight: 4,
  },

  title: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "600",
    fontFamily: Platform.OS === "web" ? 'Georgia, "Times New Roman", serif' : undefined,
    color: tokens.color.brand,
    letterSpacing: -0.7,
  },

  subtitle: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 5,
    lineHeight: 19,
  },

  right: {
    alignItems: "flex-end",
  },
});
