import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  BUSINESS_TYPE_LABELS,
  formatAmount,
  type BusinessType,
  type Contact,
  type Organization,
  tokens,
} from "@crm/core";

import {
  AppHeader,
  Card,
  EmptyState,
  Icon,
  IconSet,
  Screen,
  SearchBar,
} from "@crm/ui";

import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api";
import { Alert } from "../lib/dialogs";

type WonJob = {
  id: string;
  title: string;
  service: string;
  amount?: number | string | null;
  currency: string;
  wonAt?: string | null;
  businessType?: BusinessType | null;
  department?: { name: string } | null;
  signingPartner?: { name: string } | null;
};

type Client = Organization & {
  contacts: Contact[];
  opportunities: WonJob[];
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export function ClientsScreen() {
  const { token } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<Client[]>("/clients", token);
      setClients(data);
      setLoadError(null);
    } catch (err) {
      console.error("Clients loading error:", err);
      setLoadError(err instanceof Error ? err.message : "Unable to load clients.");
    }
  }, [token]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        (c.clientNumber ?? "").toLowerCase().includes(lower) ||
        (c.country ?? "").toLowerCase().includes(lower) ||
        (c.industry ?? "").toLowerCase().includes(lower)
    );
  }, [clients, query]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.brand} />
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <View style={styles.center}>
          <EmptyState icon={IconSet.Warning} title="Unable to load clients" subtitle={loadError} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={tokens.color.brand} />
      }
    >
      <AppHeader title="Clients" subtitle={`${clients.length} accounts with won work`} />

      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search clients, numbers, countries" />
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon={IconSet.Building}
          title={clients.length === 0 ? "No clients yet" : "Nothing matches"}
          subtitle={
            clients.length === 0
              ? "An organization becomes a client once it has a won job."
              : "Try a different name, number or country."
          }
        />
      ) : (
        filtered.map((client) => {
          const expanded = expandedId === client.id;
          const booked = client.opportunities.reduce(
            (sum, job) => sum + (job.amount != null ? Number(job.amount) : 0),
            0
          );

          return (
            <Card key={client.id} style={styles.clientCard}>
              <Pressable onPress={() => setExpandedId(expanded ? null : client.id)}>
                <View style={styles.header}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(client.name)}</Text>
                  </View>

                  <View style={styles.textCol}>
                    <Text style={styles.name} numberOfLines={1}>
                      {client.name}
                    </Text>
                    <View style={styles.badgeRow}>
                      {client.clientNumber ? (
                        <Text style={styles.clientNumber}>{client.clientNumber}</Text>
                      ) : null}
                      {client.country ? <Text style={styles.meta}>{client.country}</Text> : null}
                      {client.industry ? <Text style={styles.meta}>{client.industry}</Text> : null}
                    </View>
                    <Text style={styles.summary}>
                      {client.opportunities.length} won · {formatAmount(booked)}
                    </Text>
                  </View>

                  <Icon
                    name={expanded ? IconSet.ChevronUp : IconSet.ChevronDown}
                    size={16}
                    color={tokens.color.inkFaint}
                  />
                </View>
              </Pressable>

              {expanded ? (
                <View style={styles.detail}>
                  <Text style={styles.detailHeading}>Jobs won</Text>
                  {client.opportunities.length === 0 ? (
                    <Text style={styles.detailEmpty}>No won jobs on record.</Text>
                  ) : (
                    client.opportunities.map((job) => (
                      <View key={job.id} style={styles.job}>
                        <View style={styles.jobText}>
                          <Text style={styles.jobTitle} numberOfLines={1}>
                            {job.title}
                          </Text>
                          <Text style={styles.jobMeta} numberOfLines={1}>
                            {job.service}
                            {job.department?.name ? ` · ${job.department.name}` : ""}
                            {job.businessType ? ` · ${BUSINESS_TYPE_LABELS[job.businessType]}` : ""}
                            {job.signingPartner?.name ? ` · signed ${job.signingPartner.name}` : ""}
                          </Text>
                          <Text style={styles.jobMeta}>Won {fmtDate(job.wonAt)}</Text>
                        </View>
                        <Text style={styles.jobAmount}>
                          {job.amount != null ? formatAmount(job.amount, job.currency) : "—"}
                        </Text>
                      </View>
                    ))
                  )}

                  <Text style={styles.detailHeading}>Contacts</Text>
                  {client.contacts.length === 0 ? (
                    <Text style={styles.detailEmpty}>No contacts on record.</Text>
                  ) : (
                    client.contacts.map((contact) => (
                      <View key={contact.id} style={styles.contact}>
                        <Text style={styles.contactName}>
                          {contact.name}
                          {contact.isPrimary ? "  · Primary" : ""}
                        </Text>
                        <Text style={styles.contactMeta} numberOfLines={1}>
                          {[contact.title, contact.email, contact.phone].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchWrap: { marginBottom: 16 },
  clientCard: { padding: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...tokens.type.bodyStrong, fontWeight: "800", color: tokens.color.brand },
  textCol: { flex: 1, gap: 4 },
  name: { ...tokens.type.bodyStrong, fontSize: 17, color: tokens.color.ink },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  clientNumber: { ...tokens.type.micro, letterSpacing: 0.5, color: tokens.color.brand },
  meta: { ...tokens.type.caption, color: tokens.color.inkMuted },
  summary: { ...tokens.type.caption, color: tokens.color.inkMuted },
  detail: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: tokens.color.border },
  detailHeading: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    color: tokens.color.inkFaint,
    marginBottom: 10,
    marginTop: 8,
  },
  detailEmpty: { ...tokens.type.caption, color: tokens.color.inkMuted, marginBottom: 12 },
  job: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  jobText: { flex: 1, gap: 2 },
  jobTitle: { ...tokens.type.bodyStrong, color: tokens.color.ink },
  jobMeta: { ...tokens.type.caption, color: tokens.color.inkMuted },
  jobAmount: { ...tokens.type.bodyStrong, color: tokens.color.brand },
  contact: { marginBottom: 10 },
  contactName: { ...tokens.type.body, color: tokens.color.ink },
  contactMeta: { ...tokens.type.caption, color: tokens.color.inkMuted },
});
