import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";
import { Button, Screen, TextField, Icon, IconSet } from "@crm/ui";

import { useAuth } from "../auth/AuthContext";
import { Alert } from "../lib/dialogs";

export function LoginScreen() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }

    try {
      setLoading(true);
      await login({
        email: email.trim(),
        password,
      });
    } catch (error) {
      Alert.alert(
        "Login failed",
        error instanceof Error ? error.message : "Unable to log in."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <Icon
                name={IconSet.Check}
                size={22}
                color={tokens.color.onBrand}
              />
            </View>

            <View>
              <Text style={styles.wordmark}>Firm CRM</Text>
              <Text style={styles.wordmarkSub}>Professional services</Text>
            </View>
          </View>

          <View style={styles.heroHeading}>
            <Text style={styles.heroTitle}>Welcome back.</Text>
            <Text style={styles.heroSubtitle}>
              Sign in to manage your clients, deals and team under one roof.
            </Text>
          </View>

          <View style={styles.heroStrip}>
            <Icon
              name={IconSet.Check}
              size={14}
              color={tokens.color.onBrand}
            />
            <Text style={styles.heroStripText}>
              Scoped per role · secured & private
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@firm.co.ke"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
          />

          <View style={styles.spacing} />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="off"
            textContentType="none"
            right={
              <Pressable
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={8}
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                <Icon
                  name={showPassword ? IconSet.EyeOff : IconSet.Eye}
                  size={20}
                  color={tokens.color.inkFaint}
                />
              </Pressable>
            }
          />

          <View style={styles.spacing} />

          <Button
            title="Sign in"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
          />
        </View>

        <Text style={styles.footnote}>
          Partner, Manager or BD account · access is scoped per role
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  hero: {
    marginHorizontal: -20,
    marginTop: -10,
    paddingTop: 34,
    paddingHorizontal: 24,
    paddingBottom: 44,
    backgroundColor: tokens.color.brand,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  mark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: tokens.color.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  wordmark: {
    ...tokens.type.h3,
    color: tokens.color.onBrand,
    fontWeight: "800",
  },

  wordmarkSub: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.72)",
    marginTop: 2,
  },

  heroHeading: {
    marginTop: 36,
  },

  heroTitle: {
    ...tokens.type.display,
    color: tokens.color.onBrand,
    fontWeight: "800",
  },

  heroSubtitle: {
    ...tokens.type.body,
    color: "rgba(255,255,255,0.86)",
    marginTop: 8,
    maxWidth: 300,
  },

  heroStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: tokens.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },

  heroStripText: {
    ...tokens.type.caption,
    color: tokens.color.onBrand,
  },

  card: {
    marginTop: -22,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 20,
    ...tokens.shadow.floated,
  },

  spacing: {
    height: 16,
  },

  footnote: {
    ...tokens.type.caption,
    color: tokens.color.inkFaint,
    textAlign: "center",
    marginTop: 20,
  },
});
