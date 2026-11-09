import type { ReactNode } from "react";
import type { IconName } from "@crm/ui";

export type AppShellProps = {
  children: ReactNode;
  items: { key: string; label: string; icon: IconName }[];
  active: string;
  onSelect: (key: string) => void;
};
