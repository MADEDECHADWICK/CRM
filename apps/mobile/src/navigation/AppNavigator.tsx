import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, IconSet, bottomInset } from "@crm/ui";
import { tokens } from "@crm/core";

import { useAuth } from "../auth/AuthContext";

import { LoginScreen } from "../screens/LoginScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { ProspectsScreen } from "../screens/ProspectsScreen";
import { OpportunitiesScreen } from "../screens/OpportunitiesScreen";
import { FollowupsScreen } from "../screens/FollowupsScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { TeamScreen } from "../screens/TeamScreen";

type ScreenName =
  | "HOME"
  | "PROSPECTS"
  | "PIPELINE"
  | "FOLLOWUPS"
  | "REPORTS"
  | "TEAM";

function buildScreens(user: {
  role: string;
} | null) {
  return [
    { key: "HOME" as const, label: "Home", icon: IconSet.Home },
    { key: "PROSPECTS" as const, label: "Prospects", icon: IconSet.People },
    { key: "PIPELINE" as const, label: "Pipeline", icon: IconSet.Pipeline },
    { key: "FOLLOWUPS" as const, label: "Follow-ups", icon: IconSet.Bell },
    { key: "REPORTS" as const, label: "Reports", icon: IconSet.Chart },
    ...(user?.role === "MARKETING_BD"
      ? [{ key: "TEAM" as const, label: "Team", icon: IconSet.Building }]
      : []),
  ];
}

export function AppNavigator() {
  const { isAuthenticated, user } = useAuth();

  const [screen, setScreen] =
    useState<ScreenName>("HOME");

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
      content = <HomeScreen />;
      break;

    case "PROSPECTS":
      content = <ProspectsScreen />;
      break;

    case "PIPELINE":
      content = <OpportunitiesScreen />;
      break;

    case "FOLLOWUPS":
      content = <FollowupsScreen />;
      break;

    case "REPORTS":
      content = <ReportsScreen />;
      break;

    case "TEAM":
      content = <TeamScreen />;
      break;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>{content}</View>

      <View style={styles.navigation}>
        {screens.map((item) => {
          const active = activeScreen === item.key;

          return (
            <Pressable
              key={item.key}
              onPress={() => setScreen(item.key)}
              style={({ pressed }) => [
                styles.navButton,
                pressed && styles.navPressed,
              ]}
            >
              <Icon
                name={item.icon}
                size={22}
                color={
                  active
                    ? tokens.color.brand
                    : tokens.color.inkFaint
                }
              />

              <Text
                style={[
                  styles.navText,
                  active && styles.navTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.canvas,
  },

  content: {
    flex: 1,
  },

  navigation: {
    flexDirection: "row",
    backgroundColor: tokens.color.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    paddingTop: 6,
    paddingBottom: bottomInset,
    paddingHorizontal: 4,
    ...tokens.shadow.floated,
  },

  navButton: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    borderRadius: 12,
  },

  navPressed: {
    backgroundColor: tokens.color.surfacePressed,
  },

  navText: {
    fontSize: 11,
    fontWeight: "600",
    color: tokens.color.inkFaint,
  },

  navTextActive: {
    color: tokens.color.brand,
  },
});