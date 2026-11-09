import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { tokens, type Department } from "@crm/core";
import { Button, Chip } from "@crm/ui";
import { apiFetch } from "../api";

export function DepartmentAssigneePicker({ token, value, onChange, disabled = false }: {
  token: string; value: string | null; onChange: (id: string | null) => void; disabled?: boolean;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setDepartments(await apiFetch<Department[]>("/departments", token)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to load departments."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  return <View style={styles.wrapper}>
    <Text style={styles.label}>Assign to department</Text>
    <View style={styles.options}>
      <Chip label="No department" selected={value === null} onPress={() => onChange(null)} disabled={disabled} />
      {departments.map(department => <Chip key={department.id} label={department.name} selected={value === department.id} onPress={() => onChange(department.id)} disabled={disabled} />)}
    </View>
    {loading ? <ActivityIndicator color={tokens.color.brand} /> : error ? <><Text style={styles.error}>{error}</Text><Button title="Retry loading departments" variant="ghost" size="sm" onPress={load} /></> : <Text style={styles.hint}>{departments.length ? "All current members of the selected department can see this account." : "Create departments and set staff membership in Team to share accounts by department."}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { gap: 10, marginBottom: 24 }, label: { ...tokens.type.bodyStrong, color: tokens.color.inkMuted },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hint: { ...tokens.type.caption, color: tokens.color.inkMuted }, error: { ...tokens.type.caption, color: tokens.color.danger },
});
