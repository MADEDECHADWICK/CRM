import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { tokens } from "@crm/core";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
  right?: ReactNode;
};

export function TextField({
  label,
  error,
  right,
  style,
  ...props
}: TextFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.inputRow, error ? styles.inputRowError : undefined]}>
        <TextInput
          {...props}
          style={[styles.input, style]}
          placeholderTextColor={tokens.color.inkFaint}
        />

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },

  label: {
    marginBottom: 7,
    fontSize: 14,
    fontWeight: "600",
    color: tokens.color.inkMuted,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: 14,
  },

  inputRowError: {
    borderColor: tokens.color.danger,
  },

  input: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 16,
    color: tokens.color.ink,
  },

  right: {
    marginLeft: 10,
  },

  error: {
    marginTop: 5,
    fontSize: 12,
    color: tokens.color.danger,
  },
});