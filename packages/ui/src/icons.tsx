// packages/ui/src/icons.tsx
//
// Thin wrapper around @expo/vector-icons (Ionicons). Using the named
// IconSet shortcuts keeps glyph names in one place and the icon set
// swappable later (e.g. for the web app).

import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@crm/core";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({
  name,
  size = 22,
  color = tokens.color.inkMuted,
}: IconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}

export const IconSet = {
  Home: "home-outline",
  People: "people-outline",
  Pipeline: "funnel-outline",
  Bell: "notifications-outline",
  Chart: "bar-chart-outline",
  Search: "search-outline",
  Add: "add",
  Close: "close",
  Back: "chevron-back",
  ChevronRight: "chevron-forward",
  ChevronDown: "chevron-down",
  ChevronUp: "chevron-up",
  Check: "checkmark",
  Doc: "document-text-outline",
  Person: "person-outline",
  Send: "send-outline",
  Phone: "call-outline",
  Mail: "mail-outline",
  Globe: "globe-outline",
  Clock: "time-outline",
  Calendar: "calendar-outline",
  Logout: "log-out-outline",
  Eye: "eye-outline",
  EyeOff: "eye-off-outline",
  Options: "options-outline",
  Building: "business-outline",
  Pin: "pin-outline",
  Wallet: "wallet-outline",
  Warning: "alert-circle-outline",
} as const satisfies Record<string, IconName>;