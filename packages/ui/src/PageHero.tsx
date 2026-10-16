// packages/ui/src/PageHero.tsx
//
// The shared page-identifier band used at the top of every app screen (beyond
// the login hero). A soft brand-tinted strip carrying a monogram tile, the
// screen title + subtitle, and an optional right-aligned slot (count, action,
// filter). Screens drop this in instead of hand-rolling headers so the whole
// app shares one visual voice.

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

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
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: -20,
    marginTop: -2,
    marginBottom: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: tokens.color.brandSoft,
    borderBottomWidth: 3,
    borderBottomColor: tokens.color.accent,
  },

  mark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  textCol: {
    flex: 1,
    paddingRight: 12,
  },

  title: {
    ...tokens.type.h2,
    color: tokens.color.ink,
    letterSpacing: -0.3,
  },

  subtitle: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 3,
  },

  right: {
    alignItems: "flex-end",
  },
});
