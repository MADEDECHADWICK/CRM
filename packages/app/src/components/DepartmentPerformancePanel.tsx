import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { tokens, type BreakdownRow, type DepartmentPerformance } from "@crm/core";
import { Card, Section } from "@crm/ui";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api";

export function DepartmentPerformancePanel({ query = "?period=all", memberId, reloadKey = 0, money }: {
  query?: string; memberId?: string; reloadKey?: number; money: (value: number) => string;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<DepartmentPerformance | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    let active = true;
    setData(null); setError("");
    apiFetch<DepartmentPerformance>(`/reporting/department-performance${query}${memberId ? `&memberId=${encodeURIComponent(memberId)}` : ""}`, token).then(result => {
      if (active) setData(result);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [query, memberId, reloadKey, token]);
  function row(item: BreakdownRow, emphasis = false) {
    return <Card key={item.id} style={emphasis ? styles.highlight : undefined}>
      <Text style={styles.heading}>{item.name}</Text>
      <View style={styles.metrics}>
        <Text style={styles.metric}>Leads: {item.counts.LEAD}</Text>
        <Text style={styles.metric}>Proposals: {item.counts.PROPOSAL}</Text>
        <Text style={styles.metric}>Awaiting feedback: {item.counts.AWAITING_FEEDBACK}</Text>
        <Text style={styles.metric}>Deferred: {item.counts.DEFERRED}</Text>
        <Text style={styles.metric}>Wins: {item.wonCount}</Text>
        <Text style={styles.metric}>Losses: {item.lostCount}</Text>
      </View>
      <Text style={styles.values}>Won {money(item.wonValue)} · Active proposals {money(item.activeProposalValue)} · Lost {money(item.lostValue)}</Text>
    </Card>;
  }
  return <View>
    <Section title={memberId ? "Department leadership performance" : "My performance"} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : !data ? <ActivityIndicator color={tokens.color.brand} /> : <>
      {row(data.personal)}
      {data.departments.length > 0 ? <>
        {row(data.combined, true)}
        {data.departments.map(d => row(d))}
        <Text style={styles.note}>Department totals include all deals recorded in each department you head. The combined view counts each deal once. Personal totals cover your visible, owned deals and can overlap department totals. Account details still follow assignment permissions.</Text>
      </> : <Text style={styles.note}>No department headships appointed yet. Your personally owned deals appear above.</Text>}
      <Text style={styles.note}>The selected period uses the date each deal entered its current stage. Imported customer records count as clients in the directory; they do not create won deals or fees.</Text>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  heading: { ...tokens.type.bodyStrong, color: tokens.color.ink, marginBottom: 10 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  metric: { ...tokens.type.caption, color: tokens.color.ink },
  values: { ...tokens.type.caption, color: tokens.color.brand, marginTop: 12 },
  highlight: { borderColor: tokens.color.accent, borderWidth: 1 },
  note: { ...tokens.type.caption, color: tokens.color.inkMuted, marginVertical: 8 },
  error: { ...tokens.type.caption, color: tokens.color.danger },
});
