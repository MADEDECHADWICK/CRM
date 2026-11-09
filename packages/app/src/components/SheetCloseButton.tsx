import { Pressable, StyleSheet } from "react-native";
import { Icon, IconSet } from "@crm/ui";
import { tokens } from "@crm/core";

export function SheetCloseButton({ onClose, disabled }: { onClose: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Close dialog" accessibilityState={{ disabled: !!disabled }} onPress={onClose} disabled={disabled} style={({ pressed }) => [styles.button, pressed && { backgroundColor: tokens.color.brandSoft }, disabled && { opacity: 0.5 }]}><Icon name={IconSet.Close} size={18} color={tokens.color.inkMuted} /></Pressable>;
}
const styles = StyleSheet.create({
  button: { position: "absolute", right: 14, top: 14, zIndex: 2, width: 34, height: 34, borderRadius: 10, backgroundColor: tokens.color.brandFaint, alignItems: "center", justifyContent: "center" },
});
