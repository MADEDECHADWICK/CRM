// packages/ui/src/Button.tsx
//
// Primary, secondary, ghost, danger and success variants with an optional
// leading icon. Sized for comfortable touch targets.

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { tokens } from "@crm/core";

import { Icon, type IconName } from "./icons";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success";

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: IconName;
};

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
  size = "md",
  icon,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === "md" ? styles.md : styles.sm,
        variantStyles[variant].button,
        isDisabled && styles.disabled,
        pressed && !isDisabled && variantStyles[variant].pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? tokens.color.onBrand : tokens.color.brand}
        />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Icon
              name={icon}
              size={18}
              color={variantStyles[variant].iconColor}
            />
          ) : null}

          <Text style={[styles.text, variantStyles[variant].text]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 18,
  },

  md: {
    minHeight: 50,
  },

  sm: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 14,
  },

  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  text: {
    fontWeight: "700",
    fontSize: 15,
  },

  disabled: {
    opacity: 0.5,
  },
});

const variantStyles: Record<
  ButtonVariant,
  { button: ViewStyle; pressed: ViewStyle; text: TextStyle; iconColor: string }
> = {
  primary: {
    button: { backgroundColor: tokens.color.accent },
    pressed: { backgroundColor: tokens.color.accentStrong },
    text: { color: tokens.color.onBrand },
    iconColor: tokens.color.onBrand,
  },
  secondary: {
    button: {
      backgroundColor: tokens.color.surface,
      borderWidth: 1,
      borderColor: tokens.color.borderStrong,
    },
    pressed: { backgroundColor: tokens.color.surfacePressed },
    text: { color: tokens.color.ink },
    iconColor: tokens.color.inkMuted,
  },
  ghost: {
    button: { backgroundColor: "transparent" },
    pressed: { backgroundColor: tokens.color.brandSoft },
    text: { color: tokens.color.brand },
    iconColor: tokens.color.brand,
  },
  danger: {
    button: { backgroundColor: tokens.color.dangerSoft },
    pressed: { backgroundColor: "#FDE8E8" },
    text: { color: tokens.color.danger },
    iconColor: tokens.color.danger,
  },
  success: {
    button: { backgroundColor: tokens.color.successSoft },
    pressed: { backgroundColor: "#D1FAE5" },
    text: { color: tokens.color.success },
    iconColor: tokens.color.success,
  },
};