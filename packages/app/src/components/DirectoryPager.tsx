import { StyleSheet, Text, View } from "react-native";
import { Button } from "@crm/ui";
import { tokens } from "@crm/core";
import { DIRECTORY_PAGE_SIZE } from "./useDirectoryPage";

export function DirectoryPager({ page, total, busy, onChange }: {
  page: number; total: number; busy: boolean; onChange: (page: number) => void;
}) {
  return <View style={styles.row}>
    <Text style={styles.text}>{busy ? "Loading…" : total ? `${page * DIRECTORY_PAGE_SIZE + 1}–${Math.min((page + 1) * DIRECTORY_PAGE_SIZE, total)} of ${total.toLocaleString()}` : "0 results"}</Text>
    <View style={styles.buttons}>
      <Button title="Previous" size="sm" variant="secondary" disabled={busy || page === 0} onPress={() => onChange(page - 1)} />
      <Button title="Next" size="sm" variant="secondary" disabled={busy || (page + 1) * DIRECTORY_PAGE_SIZE >= total} onPress={() => onChange(page + 1)} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginVertical: 16 },
  text: { ...tokens.type.caption, color: tokens.color.inkMuted },
  buttons: { flexDirection: "row", gap: 8 },
});
