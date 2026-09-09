// packages/ui/src/Badge.tsx
//
// The proof-of-concept component for the whole monorepo architecture — if
// this renders correctly on both apps/mobile (via Expo Go) and apps/web
// (via react-native-web), the wiring between packages/core, packages/ui,
// and both apps is proven working end to end.
//
// Uses React Native primitives (View/Text), not HTML — that's what lets
// react-native-web compile this down to real DOM elements for the browser.

import React from "react";
import { View, Text } from "react-native";
import { STAGE_COLORS, STAGE_LABELS, type Stage } from "@crm/core";

type BadgeProps = {
  stage: Stage;
};

export function Badge({ stage }: BadgeProps) {
  const colors = STAGE_COLORS[stage];
  const label = STAGE_LABELS[stage];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: colors.bg,
        alignSelf: "flex-start", // prevents the pill from stretching full-width in a flex column
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.dot,
        }}
      />
      <Text style={{ fontSize: 12, fontWeight: "500", color: colors.text }}>
        {label}
      </Text>
    </View>
  );
}