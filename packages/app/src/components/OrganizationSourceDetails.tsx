import { StyleSheet, Text, View } from "react-native";
import { formatAmount, tokens, type Organization } from "@crm/core";

export function OrganizationSourceDetails({ organization }: { organization: Organization }) {
  const data = organization.sourceData;
  const fields = [
    ["Country", organization.country], ["Location", organization.address],
    ["Partner lead", data?.partnerLead], ["Pursuit order", data?.pursuitOrder],
    ["Recommended offer", data?.recommendedOffer],
    ["Planning fee (estimate)", data?.planningFeeKES ? formatAmount(data.planningFeeKES, "KES") : null],
    ["Region", data?.region], ["Market segment", data?.marketSegment],
    ["Customer status", data?.customerStatus], ["Payment terms", data?.paymentTerms],
    ["Email", organization.email], ["Phone", organization.phone],
  ].filter(([, value]) => value);
  if (!fields.length) return null;
  return <View style={styles.details}>{fields.map(([label, value]) => <View key={label} style={styles.row}>
    <Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text>
  </View>)}{data?.planningFeeKES && <Text style={styles.note}>Planning fees are estimates from the target list, not booked revenue.</Text>}</View>;
}
const styles = StyleSheet.create({
  details: { gap: 10, marginVertical: 14 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  label: { ...tokens.type.caption, color: tokens.color.inkMuted, width: 150 },
  value: { ...tokens.type.body, color: tokens.color.ink, flex: 1, minWidth: 150 },
  note: { ...tokens.type.caption, color: tokens.color.inkMuted, marginTop: 4 },
});
