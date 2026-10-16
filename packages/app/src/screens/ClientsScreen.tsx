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
  Button,
  Card,
  EmptyState,
  Icon,
  IconSet,
  Screen,
  SearchBar,
  StatCard,
} from "@crm/ui";

import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api";
import { Alert } from "../lib/dialogs";
import { OrgFormSheet } from "../components/OrgFormSheet";
import { ContactFormSheet } from "../components/ContactFormSheet";

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

  const [clientFormOrg, setClientFormOrg] = useState<Organization | null>(null);
  const [contactFormOrg, setContactFormOrg] = useState<Organization | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

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

  function confirmDeleteContact(contact: Contact) {
    Alert.alert("Delete contact?", `${contact.name} will be removed from this client.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await apiFetch(`/contacts/${contact.id}`, token, { method: "DELETE" });
            await load();
          } catch (error) {
            Alert.alert("Unable to delete contact", error instanceof Error ? error.message : "Please try again.");
          }
        },
      },
    ]);
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

  const totalBooked = useMemo(
    () =>
      clients.reduce(
        (sum, c) => sum + c.opportunities.reduce((s, j) => s + (j.amount != null ? Number(j.amount) : 0), 0),
        0
      ),
    [clients]
  );

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
      <AppHeader
        icon={IconSet.Building}
        title="Clients"
        subtitle="Accounts with won work"
      />

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <StatCard label="Clients" value={clients.length} icon={IconSet.Building} accent={tokens.color.brand} soft={tokens.color.brandSoft} />
        </View>
        <View style={styles.statItem}>
          <StatCard label="Booked" value={formatAmount(totalBooked)} icon={IconSet.Check} accent={tokens.color.accent} soft={tokens.color.accentSoft} />
        </View>
      </View>

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
                        <View style={styles.numberChip}>
                          <Text style={styles.numberText}>{client.clientNumber}</Text>
                        </View>
                      ) : null}
                      {client.country ? <Text style={styles.meta}>{client.country}</Text> : null}
                      {client.industry ? <Text style={styles.meta}>{client.industry}</Text> : null}
                    </View>
                    <Text style={styles.summary}>
                      <Text style={styles.summaryStrong}>{client.opportunities.length} won</Text>
                      {" · "}
                      <Text style={styles.summaryAmount}>{formatAmount(booked)}</Text>
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
                  <View style={styles.actions}>
                    <Button
                      title="Edit client"
                      onPress={() => setClientFormOrg(client)}
                      variant="secondary"
                      size="sm"
                      icon={IconSet.Doc}
                    />
                    <Button
                      title="Add contact"
                      onPress={() => {
                        setEditingContact(null);
                        setContactFormOrg(client);
                      }}
                      variant="ghost"
                      size="sm"
                      icon={IconSet.Add}
                    />
                  </View>

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
                    <Text style={styles.detailEmpty}>No contacts yet — add the people you speak to.</Text>
                  ) : (
                    client.contacts.map((contact) => (
                      <View key={contact.id} style={styles.contact}>
                        <View style={styles.contactText}>
                          <View style={styles.contactNameRow}>
                            <Text style={styles.contactName}>{contact.name}</Text>
                            {contact.isPrimary ? (
                              <View style={styles.primaryChip}>
                                <Text style={styles.primaryText}>Primary</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.contactMeta} numberOfLines={1}>
                            {[contact.title, contact.email, contact.phone].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <View style={styles.contactActions}>
                          <Button
                            title="Edit"
                            onPress={() => {
                              setEditingContact(contact);
                              setContactFormOrg(client);
                            }}
                            variant="ghost"
                            size="sm"
                          />
                          <Button
                            title="Delete"
                            onPress={() => confirmDeleteContact(contact)}
                            variant="danger"
                            size="sm"
                          />
                        </View>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      {clientFormOrg ? (
        <OrgFormSheet
          visible={clientFormOrg !== null}
          token={token ?? ""}
          organization={clientFormOrg}
          onClose={() => setClientFormOrg(null)}
          onSaved={load}
        />
      ) : null}

      {contactFormOrg ? (
        <ContactFormSheet
          visible={contactFormOrg !== null}
          token={token ?? ""}
          contact={editingContact}
          organization={contactFormOrg}
          onClose={() => setContactFormOrg(null)}
          onSaved={load}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statItem: { flex: 1 },
  searchWrap: { marginBottom: 16 },
  clientCard: { padding: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...tokens.type.bodyStrong, fontWeight: "800", color: tokens.color.onBrand },
  textCol: { flex: 1, gap: 5 },
  name: { ...tokens.type.bodyStrong, fontSize: 17, color: tokens.color.ink },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  numberChip: {
    backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  numberText: { ...tokens.type.micro, letterSpacing: 0.5, color: tokens.color.accent },
  meta: { ...tokens.type.caption, color: tokens.color.inkMuted },
  summary: { ...tokens.type.caption, color: tokens.color.inkMuted },
  summaryStrong: { color: tokens.color.ink, fontWeight: "700" },
  summaryAmount: { color: tokens.color.brand, fontWeight: "700" },
  detail: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: tokens.color.border },
  actions: { flexDirection: "row", gap: 10, marginBottom: 6 },
  detailHeading: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    color: tokens.color.inkFaint,
    marginBottom: 10,
    marginTop: 14,
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
  jobAmount: { ...tokens.type.bodyStrong, color: tokens.color.accent },
  contact: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  contactText: { flex: 1, gap: 3 },
  contactNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  contactName: { ...tokens.type.body, color: tokens.color.ink, fontWeight: "600" },
  primaryChip: {
    backgroundColor: tokens.color.brandSoft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  primaryText: { ...tokens.type.micro, letterSpacing: 0, color: tokens.color.brand },
  contactMeta: { ...tokens.type.caption, color: tokens.color.inkMuted },
  contactActions: { gap: 4, alignItems: "flex-end" },
});
