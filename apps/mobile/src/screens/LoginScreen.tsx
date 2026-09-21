import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";
import { Button, Screen, TextField, Icon, IconSet, topInset } from "@crm/ui";

import { useAuth } from "../auth/AuthContext";

export function LoginScreen() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Icon name={IconSet.Check} size={22} color={tokens.color.brand} />
          </View>

          <View>
            <Text style={styles.wordmark}>Firm CRM</Text>
            <Text style={styles.wordmarkSub}>Professional services</Text>
          </View>
        </View>

        <View style={styles.heading}>
          <Text style={styles.title}>Welcome back.</Text>
          <Text style={styles.subtitle}>
            Sign in to manage your clients and pipeline.
          </Text>
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
          />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
          />

          <Button
            title="Sign in"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
          />
        </View>

        <Text style={styles.footnote}>
          Partner, Manager or BD account · secured & scoped per role
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingTop: topInset,
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 40,
  },

  mark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  wordmark: {
    ...tokens.type.h3,
    color: tokens.color.ink,
  },

  wordmarkSub: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: tokens.color.inkFaint,
    marginTop: 2,
  },

  heading: {
    marginBottom: 28,
  },

  title: {
    ...tokens.type.display,
    color: tokens.color.ink,
  },

  subtitle: {
    ...tokens.type.body,
    color: tokens.color.inkMuted,
    marginTop: 8,
  },

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 20,
    ...tokens.shadow.card,
  },

  footnote: {
    ...tokens.type.caption,
    color: tokens.color.inkFaint,
    textAlign: "center",
    marginTop: 24,
  },
});