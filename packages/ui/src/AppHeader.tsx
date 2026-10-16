// packages/ui/src/AppHeader.tsx
//
// The standard app screen header. This is now a thin delegate over the shared
// PageHero band so every screen carries the exact same brand treatment: a soft
// brand-tinted strip with a monogram tile, an icon, the title + subtitle, and
// an optional right-aligned slot. Kept as AppHeader so all existing screens
// (Prospects, Pipeline, Follow-ups, Reports, Team) inherit the styled band
// without any per-screen churn — pass a per-screen `icon` to differentiate.

import type { ReactNode } from "react";

import { tokens } from "@crm/core";

import { PageHero } from "./PageHero";
import { IconSet, type IconName } from "./icons";

type AppHeaderProps = {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function AppHeader({
  icon,
  title,
  subtitle,
  right,
}: AppHeaderProps) {
  return (
    <PageHero
      icon={icon ?? IconSet.Pipeline}
      tint={tokens.color.accent}
      iconColor={tokens.color.onBrand}
      title={title}
      subtitle={subtitle}
      right={right}
    />
  );
}
