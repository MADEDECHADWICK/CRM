import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { canReceiveProspect, isOwnerEligible, tokens, type UserLite } from "@crm/core";
import { Button, Icon, IconSet, TextField } from "@crm/ui";
import { apiFetch } from "../api";

export function TeamAssigneePicker({ token, value, onChange, disabled = false, includeAdministrators = false, allowUnassigned = true, currentUserId }: {
  token: string; value: string | null; onChange: (id: string | null) => void; disabled?: boolean;
  includeAdministrators?: boolean; allowUnassigned?: boolean; currentUserId?: string;
}) {
  const [members, setMembers] = useState<UserLite[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setMembers((await apiFetch<UserLite[]>("/users", token)).filter(member => includeAdministrators ? canReceiveProspect(member.role) : isOwnerEligible(member))); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to load team members."); }
    finally { setLoading(false); }
  }, [token, includeAdministrators]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => members.filter(member =>
    `${member.name} ${member.email}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [members, query]);
  return <View style={styles.wrapper}>
    <View style={styles.heading}><Text style={styles.label}>Assign to team member</Text>{currentUserId && members.some(m => m.id === currentUserId) && <Button title="Assign to me" variant="ghost" size="sm" disabled={disabled} onPress={() => onChange(currentUserId)} />}</View>
    {members.length > 8 && <TextField label="Search team" value={query} onChangeText={setQuery} placeholder="Name or email" editable={!disabled} />}
    <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {allowUnassigned && <Pressable accessibilityRole="radio" aria-checked={value === null} accessibilityState={{ checked: value === null, disabled }} disabled={disabled} onPress={() => onChange(null)} style={[styles.option, value === null && styles.selected]}>
        <Text style={styles.name}>Unassigned</Text>{value === null && <Icon name={IconSet.Check} size={18} color={tokens.color.brand} />}
      </Pressable>}
      {filtered.map(member => <Pressable key={member.id} accessibilityRole="radio" accessibilityLabel={`${member.name}, ${member.role === "MARKETING_BD" ? "Administrator" : member.role === "PARTNER" ? "Partner" : "Manager"}${member.id === currentUserId ? ", you" : ""}`} aria-checked={value === member.id} accessibilityState={{ checked: value === member.id, disabled }} disabled={disabled} onPress={() => onChange(member.id)} style={[styles.option, value === member.id && styles.selected]}>
        <View style={styles.person}><Text style={styles.name}>{member.name}{member.id === currentUserId ? " (you)" : ""}</Text><Text style={styles.meta}>{member.role === "MARKETING_BD" ? "Administrator" : member.role === "PARTNER" ? "Partner" : "Manager"} · {member.email}</Text></View>
        {value === member.id && <Icon name={IconSet.Check} size={18} color={tokens.color.brand} />}
      </Pressable>)}
    </ScrollView>
    {loading ? <ActivityIndicator style={styles.status} color={tokens.color.brand} /> : error ? <View style={styles.status}><Text style={styles.error}>{error}</Text><Button title="Retry loading team" variant="ghost" size="sm" onPress={load} /></View> : <Text style={styles.meta}>{members.length === 0 ? "No eligible team members are available." : filtered.length === 0 ? "No team members match your search." : "Select the team member responsible for this account."}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { marginBottom: 20, gap: 8 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  label: { ...tokens.type.bodyStrong, color: tokens.color.inkMuted },
  list: { maxHeight: 230, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 10, backgroundColor: tokens.color.surface },
  option: { minHeight: 48, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  selected: { backgroundColor: tokens.color.brandSoft },
  person: { flex: 1, gap: 3 },
  name: { ...tokens.type.bodyStrong, color: tokens.color.ink },
  meta: { ...tokens.type.caption, color: tokens.color.inkMuted },
  error: { ...tokens.type.caption, color: tokens.color.danger },
  status: { marginTop: 8, gap: 6 },
});
