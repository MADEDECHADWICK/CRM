import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, useLayoutInsets } from "@crm/ui";
import { tokens } from "@crm/core";
import type { AppShellProps } from "./AppShell.types";

export function AppShell({ children, items, active, onSelect }: AppShellProps) {
  const insets = useLayoutInsets();
  return <View style={styles.root}>
    <View style={styles.content}>{children}</View>
    <View style={[styles.navigation, { paddingBottom: insets.bottom + 6 }]}>
      {items.map(item => <Pressable key={item.key} onPress={() => onSelect(item.key)} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active === item.key }} style={({ pressed }) => [styles.button, active === item.key && styles.active, pressed && styles.pressed]}>
        <Icon name={item.icon} size={22} color={active === item.key ? tokens.color.brand : tokens.color.inkMuted} />
        <Text style={[styles.label, active === item.key && { color: tokens.color.brand }]}>{item.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.canvas },
  content: { flex: 1 },
  navigation: { flexDirection: "row", paddingTop: 8, paddingHorizontal: 6, borderTopWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
  button: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 8, borderRadius: 10 },
  label: { fontSize: 10, fontWeight: "600", color: tokens.color.inkMuted },
  active: { backgroundColor: tokens.color.accentSoft },
  pressed: { backgroundColor: tokens.color.surfacePressed },
});
