import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  tokens,
  type Contact,
  type Organization,
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
import { ContactFormSheet } from "../components/ContactFormSheet";

type DirectoryOrganization = Organization & { opportunities?: { stage: string }[] };
type DirectoryContact = Contact & { organization: DirectoryOrganization };

type ContactType = "Prospect" | "Lead" | "Client";

const TYPE_STYLE: Record<ContactType, { color: string; bg: string }> = {
  Client: { color: tokens.color.success, bg: tokens.color.successSoft },
  Lead: { color: tokens.color.info, bg: tokens.color.infoSoft },
  Prospect: { color: tokens.color.brand, bg: tokens.color.brandSoft },
};

function contactType(contact: DirectoryContact): ContactType {
  const org = contact.organization;
  const stages = org?.opportunities?.map((opp) => opp.stage) ?? [];
  if (org?.isExistingClient || stages.includes("WON")) return "Client";
  if (stages.some((stage) => stage !== "PROSPECT")) return "Lead";
  return "Prospect";
}

export function ContactsScreen() {
  const { token } = useAuth();
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DirectoryContact | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setContacts(await apiFetch<DirectoryContact[]>("/contacts?limit=500", token));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.title, contact.email, contact.phone, contact.organization?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [contacts, query]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return <Screen><View style={styles.center}><ActivityIndicator color={tokens.color.brand} /></View></Screen>;
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.center}>
          <EmptyState icon={IconSet.Warning} title="Unable to load contacts" subtitle={error} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader
        icon={IconSet.Person}
        title="Contacts"
        subtitle="Every prospect, lead and client contact in your scope"
      />
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search people, client, email or phone"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={tokens.color.brand} />}
      >
        <Text style={styles.count}>{filtered.length} contact{filtered.length === 1 ? "" : "s"}</Text>
        {filtered.length === 0 ? (
          <Card><EmptyState icon={IconSet.Person} title="No matching contacts" subtitle="Try a different name, client, email or phone." /></Card>
        ) : filtered.map((contact) => {
          const type = contactType(contact);
          const palette = TYPE_STYLE[type];
          return (
            <Card key={contact.id} onPress={() => setSelected(contact)} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.initials}>
                    {contact.name.split(" ").map((part) => part.charAt(0)).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                  </Text>
                </View>
                <View style={styles.body}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{contact.name}</Text>
                    <View style={[styles.typePill, { backgroundColor: palette.bg }]}>
                      <Text style={[styles.typeText, { color: palette.color }]}>{type}</Text>
                    </View>
                    {contact.isPrimary ? <Text style={styles.primary}>Primary</Text> : null}
                  </View>
                  <Text style={styles.org}>{contact.organization?.name ?? "No organization"}</Text>
                  {contact.title ? <Text style={styles.meta}>{contact.title}</Text> : null}
                  {contact.email ? <Text style={styles.meta}>{contact.email}</Text> : null}
                  {contact.phone ? <Text style={styles.meta}>{contact.phone}</Text> : null}
                </View>
                <Icon name={IconSet.ChevronRight} size={16} color={tokens.color.inkFaint} />
              </View>
            </Card>
          );
        })}
      </ScrollView>

      {selected ? (
        <ContactFormSheet
          visible
          token={token ?? ""}
          contact={selected}
          organization={selected.organization}
          onClose={() => setSelected(null)}
          onSaved={load}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { paddingBottom: 40, gap: 12 },
  count: { ...tokens.type.caption, color: tokens.color.inkMuted, marginBottom: 4 },
  card: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: tokens.color.brandFaint, alignItems: "center", justifyContent: "center" },
  initials: { ...tokens.type.bodyStrong, color: tokens.color.brand },
  body: { flex: 1, gap: 3, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { ...tokens.type.bodyStrong, color: tokens.color.ink },
  typePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  typeText: { ...tokens.type.micro, letterSpacing: 0, fontWeight: "800" },
  primary: { ...tokens.type.micro, letterSpacing: 0, color: tokens.color.brand },
  org: { ...tokens.type.caption, color: tokens.color.inkMuted, fontWeight: "600" },
  meta: { ...tokens.type.caption, color: tokens.color.inkFaint },
});
