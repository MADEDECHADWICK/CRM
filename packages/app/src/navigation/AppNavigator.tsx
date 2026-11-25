import { useState } from "react";
import { AppShell } from "./AppShell";

import { IconSet } from "@crm/ui";

import { useAuth } from "../auth/AuthContext";

import { LoginScreen } from "../screens/LoginScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { ProspectsScreen } from "../screens/ProspectsScreen";
import { ClientsScreen } from "../screens/ClientsScreen";
import { ContactsScreen } from "../screens/ContactsScreen";
import { OpportunitiesScreen } from "../screens/OpportunitiesScreen";
import { FollowupsScreen } from "../screens/FollowupsScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { TeamScreen } from "../screens/TeamScreen";
import { GovernanceScreen } from "../screens/GovernanceScreen";

type ScreenName =
  | "HOME"
  | "PROSPECTS"
  | "CLIENTS"
  | "CONTACTS"
  | "PIPELINE"
  | "FOLLOWUPS"
  | "REPORTS"
  | "GOVERNANCE"
  | "TEAM";

function buildScreens(user: {
  role: string;
  isAdmin?: boolean;
} | null) {
  return [
    { key: "HOME" as const, label: "Home", icon: IconSet.Home },
    { key: "PROSPECTS" as const, label: "Prospects", icon: IconSet.People },
    { key: "CLIENTS" as const, label: "Clients", icon: IconSet.Building },
    { key: "CONTACTS" as const, label: "Contacts", icon: IconSet.Person },
    { key: "PIPELINE" as const, label: "Pipeline", icon: IconSet.Pipeline },
    { key: "FOLLOWUPS" as const, label: "Follow-ups", icon: IconSet.Bell },
    { key: "REPORTS" as const, label: "Reports", icon: IconSet.Chart },
    { key: "GOVERNANCE" as const, label: "Proposals", icon: IconSet.Doc },
    ...(user?.role === "MARKETING_BD" || user?.role === "IT_ADMIN" || user?.isAdmin
      ? [{ key: "TEAM" as const, label: "Team", icon: IconSet.Building }]
      : []),
  ];
}

export function AppNavigator() {
  const { isAuthenticated, user } = useAuth();


  const [screen, setScreen] =
    useState<ScreenName>("HOME");

  // Client tapped on Home, carried over to Prospects so it can be expanded
  // and scrolled into view on arrival.
  const [focusClientId, setFocusClientId] = useState<string | null>(null);

  const screens = buildScreens(user);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // If the current screen vanished (e.g. a non-BD user landed on TEAM),
  // fall back to Home instead of rendering a dead tab.
  const activeScreen = screens.some((item) => item.key === screen)
    ? screen
    : "HOME";

  let content;

  switch (activeScreen) {
    case "HOME":
      content = (
        <HomeScreen
          onNavigate={setScreen}
          onOpenClient={(organizationId) => {
            setFocusClientId(organizationId);
            setScreen("PROSPECTS");
          }}
        />
      );
      break;

    case "PROSPECTS":
      content = (
        <ProspectsScreen
          focusOrganizationId={focusClientId}
          onFocusHandled={() => setFocusClientId(null)}
        />
      );
      break;

    case "PIPELINE":
      content = <OpportunitiesScreen />;
      break;

    case "CLIENTS":
      content = <ClientsScreen />;
      break;

    case "CONTACTS":
      content = <ContactsScreen />;
      break;

    case "FOLLOWUPS":
      content = <FollowupsScreen />;
      break;

    case "REPORTS":
      content = <ReportsScreen />;
      break;

    case "GOVERNANCE":
      content = <GovernanceScreen />;
      break;

    case "TEAM":
      content = <TeamScreen />;
      break;
  }

  return <AppShell items={screens} active={activeScreen} onSelect={key => setScreen(key as ScreenName)}>{content}</AppShell>;
}
