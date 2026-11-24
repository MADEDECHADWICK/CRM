import { useState, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  View,
} from "react-native";

import { tokens } from "@crm/core";

import { webTextInputReset } from "./webStyles";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
  right?: ReactNode;
  variant?: "default" | "plain";
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  error,
  right,
  variant = "default",
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const plain = variant === "plain";
  return (
    <View style={[styles.wrapper, plain && styles.wrapperPlain, containerStyle]}>
      <Text style={[styles.label, plain && styles.labelPlain]}>{label}</Text>

      <View style={[styles.inputRow, plain && styles.inputRowPlain, focused && (plain ? styles.focusedPlain : styles.focused), error ? styles.inputRowError : undefined]}>
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel ?? label}
          onFocus={event => { setFocused(true); onFocus?.(event); }}
          onBlur={event => { setFocused(false); onBlur?.(event); }}
          style={[styles.input, plain && styles.inputPlain, webTextInputReset, style]}
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

  wrapperPlain: {
    marginBottom: 0,
  },

  label: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "600",
    color: tokens.color.inkMuted,
  },

  labelPlain: {
    marginBottom: 6,
    fontSize: 12,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: tokens.color.borderStrong,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: 14,
  },

  inputRowPlain: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
  },

  inputRowError: {
    borderColor: tokens.color.danger,
  },

  input: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 15,
    color: tokens.color.ink,
  },

  inputPlain: {
    fontSize: 14,
  },

  right: {
    marginLeft: 10,
  },

  focused: {
    borderColor: tokens.color.brand,
    backgroundColor: tokens.color.brandFaint,
  },

  focusedPlain: {
    borderColor: tokens.color.brand,
  },

  error: {
    marginTop: 5,
    fontSize: 12,
    color: tokens.color.danger,
  },
});
