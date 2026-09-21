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

type ScreenName =
  | "HOME"
  | "PROSPECTS"
  | "PIPELINE"
  | "FOLLOWUPS"
  | "REPORTS";

const SCREENS: {
  key: ScreenName;
  label: string;
  icon: (typeof IconSet)[keyof typeof IconSet];
}[] = [
  { key: "HOME", label: "Home", icon: IconSet.Home },
  { key: "PROSPECTS", label: "Prospects", icon: IconSet.People },
  { key: "PIPELINE", label: "Pipeline", icon: IconSet.Pipeline },
  { key: "FOLLOWUPS", label: "Follow-ups", icon: IconSet.Bell },
  { key: "REPORTS", label: "Reports", icon: IconSet.Chart },
];

export function AppNavigator() {
  const { isAuthenticated } = useAuth();

  const [screen, setScreen] =
    useState<ScreenName>("HOME");

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  let content;

  switch (screen) {
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
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>{content}</View>

      <View style={styles.navigation}>
        {SCREENS.map((item) => {
          const active = screen === item.key;

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