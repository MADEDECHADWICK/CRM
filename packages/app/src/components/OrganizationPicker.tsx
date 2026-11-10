import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { tokens, type Organization } from "@crm/core";
import { Button, Card, SearchBar } from "@crm/ui";
import { DirectoryPager } from "./DirectoryPager";
import { useDirectoryPage } from "./useDirectoryPage";

/** Search every accessible account instead of offering only the first API page. */
export function OrganizationPicker({ token, selected, onSelect }: {
  token: string; selected: Organization | null; onSelect: (organization: Organization | null) => void;
}) {
  const [query, setQuery] = useState("");
  const directory = useDirectoryPage<Organization>("/organizations", token, query);
  if (selected) return <Card style={styles.selected}>
    <View style={{ flex: 1, gap: 4 }}><Text style={styles.name}>{selected.name}</Text>
      <Text style={styles.hint}>{[selected.country, selected.assignedDepartment?.name].filter(Boolean).join(" · ")}</Text></View>
    <Button title="Change organization" variant="ghost" size="sm" onPress={() => onSelect(null)} />
  </Card>;
  return <View style={styles.wrap}>
    <SearchBar value={query} placeholder="Search organizations by name, country or contact" onChangeText={value => { setQuery(value); directory.setPage(0); }} />
    {directory.loading ? <ActivityIndicator color={tokens.color.brand} /> : directory.error ?
      <><Text style={styles.error}>{directory.error}</Text><Button title="Retry organization search" variant="secondary" onPress={() => void directory.load()} /></> : <>
        <DirectoryPager page={directory.page} total={directory.total} busy={directory.busy} onChange={directory.setPage} />
        <View style={styles.results}>
          {directory.items.map(org => <Button key={org.id} title={org.name} variant="secondary" size="sm" onPress={() => onSelect(org)} />)}
        </View>
        {!directory.items.length && <Text style={styles.hint}>No matching organizations in your assigned accounts.</Text>}
      </>}
  </View>;
}
const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 16 }, results: { gap: 8, maxHeight: 250, overflow: "scroll" },
  selected: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  name: { ...tokens.type.bodyStrong, color: tokens.color.brand }, hint: { ...tokens.type.caption, color: tokens.color.inkMuted },
  error: { ...tokens.type.caption, color: tokens.color.danger },
});
