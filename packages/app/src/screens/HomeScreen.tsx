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
  type Contact,
  type Opportunity,
  type ReportingSummary,
  tokens,
} from "@crm/core";

import {
  Card,
  EmptyState,
  Icon,
  IconButton,
  IconSet,
  PageHero,
  Screen,
  SearchBar,
  Section,
  StatCard,
} from "@crm/ui";

import { countByStage, DonutChart, pipelineDonut } from "../components/charts";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api";
import { Alert } from "../lib/dialogs";

/** Contacts shown before the user starts searching. */
const CONTACTS_PREVIEW = 3;

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type HomeScreenProps = {
  /** Jump to a client on the Prospects screen (their contact list). */
  onOpenClient?: (organizationId: string) => void;
};

export function HomeScreen({ onOpenClient }: HomeScreenProps) {
  const { token, user, logout } = useAuth();

  function confirmSignOut() {
    Alert.alert(
      "Sign out?",
      "You'll need to sign back in to manage your pipeline.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: logout },
      ]
    );
  }

  const [summary, setSummary] = useState<ReportingSummary | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;

    try {
      const [summaryData, opportunityData, contactData] = await Promise.all([
        apiFetch<ReportingSummary>("/reporting/summary", token),
        apiFetch<Opportunity[]>("/opportunities", token),
        apiFetch<Contact[]>("/contacts", token),
      ]);

      setSummary(summaryData);
      setOpportunities(opportunityData);
      setContacts(contactData);
      setError(null);
    } catch (err) {
      // Surfaced instead of swallowed: a failed load used to leave the
      // dashboard on an endless spinner because summary stayed null.
      console.error("Home loading error:", err);
      setError(err instanceof Error ? err.message : "Unable to load your dashboard.");
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

  const pipeline = useMemo(() => {
    const counts = countByStage(opportunities);
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    return { counts, total };
  }, [opportunities]);

  // Idle state shows only a short preview — with 1000+ clients a full list
  // would be unusable on a phone. Searching is the way to find anyone else,
  // and while a search is active every match is shown.
  const matches = useMemo(() => {
    const lower = contactQuery.trim().toLowerCase();

    if (!lower) return contacts;

    return contacts.filter((contact) =>
      [
        contact.name,
        contact.title ?? "",
        contact.department ?? "",
        contact.email ?? "",
        contact.phone ?? "",
        contact.organization?.name ?? "",
      ].some((field) => field.toLowerCase().includes(lower))
    );
  }, [contacts, contactQuery]);

  const isSearching = contactQuery.trim().length > 0;
  const visibleContacts = isSearching
    ? matches
    : contacts.slice(0, CONTACTS_PREVIEW);
  const hiddenCount = contacts.length - visibleContacts.length;

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.brand} />
        </View>
      </Screen>
    );
  }

  if (error || !summary) {
    return (
      <Screen>
        <View style={styles.center}>
          <EmptyState
            icon={IconSet.Warning}
            title="Unable to load your dashboard"
            subtitle={error ?? "Please pull to refresh and try again."}
          />
        </View>
      </Screen>
    );
  }

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const today = new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={tokens.color.brand}
          />
        }
      >
        <PageHero
          icon={IconSet.Check}
          iconColor={tokens.color.onBrand}
          tint={tokens.color.accent}
          title={`${greetingForHour(new Date().getHours())}, ${firstName}.`}
          subtitle={today}
          right={
            <View style={styles.headerActions}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {initials(user?.name ?? "")}
                </Text>
              </View>

              <IconButton
                name={IconSet.Logout}
                label="Sign out"
                onPress={confirmSignOut}
                color={tokens.color.danger}
                bg={tokens.color.dangerSoft}
              />
            </View>
          }
        />

        <View style={styles.stats}>
          <View style={styles.statItem}>
            <StatCard
              label="Prospects"
              value={summary.totalProspects}
              icon={IconSet.People}
              accent={tokens.color.brand}
              soft={tokens.color.brandSoft}
            />
          </View>

          <View style={styles.statItem}>
            <StatCard
              label="Leads"
              value={summary.totalLeads}
              icon={IconSet.Pipeline}
              accent={tokens.color.info}
              soft={tokens.color.infoSoft}
            />
          </View>

          <View style={styles.statItem}>
            <StatCard
              label="Proposals"
              value={summary.totalProposals}
              icon={IconSet.Doc}
              accent={tokens.color.warning}
              soft={tokens.color.warningSoft}
            />
          </View>

          <View style={styles.statItem}>
            <StatCard
              label="Clients"
              value={summary.totalClients}
              icon={IconSet.Check}
              accent={tokens.color.success}
              soft={tokens.color.successSoft}
            />
          </View>
        </View>

        <Section title="Pipeline snapshot" />

        <Card>
          <DonutChart
            data={pipelineDonut(pipeline.counts)}
            centerValue={`${pipeline.total}`}
            centerCaption="opportunities"
          />
        </Card>

        <Section
          title="Client contact information"
          action={
            <Text style={styles.sectionMeta}>
              {isSearching
                ? `${matches.length} of ${contacts.length}`
                : `${contacts.length} on file`}
            </Text>
          }
        />

        {contacts.length > 0 ? (
          <View style={styles.contactSearch}>
            <SearchBar
              value={contactQuery}
              onChangeText={setContactQuery}
              placeholder="Search clients, people, email or phone"
            />
          </View>
        ) : null}

        {contacts.length === 0 ? (
          <EmptyState
            icon={IconSet.Person}
            title="No contacts yet"
            subtitle="Open Prospects to add the people you speak to at each client."
          />
        ) : visibleContacts.length === 0 ? (
          <EmptyState
            icon={IconSet.Search}
            title="Nothing matches"
            subtitle="Try a different client, contact name, email or phone number."
          />
        ) : (
          visibleContacts.map((contact) => (
            <Card
              key={contact.id}
              style={styles.contactCard}
              onPress={() => onOpenClient?.(contact.organizationId)}
            >
              <View style={styles.contactRow}>
                <View style={styles.contactAvatar}>
                  <Text style={styles.contactInitials}>
                    {initials(contact.name)}
                  </Text>
                </View>

                <View style={styles.contactTextCol}>
                  <View style={styles.contactNameRow}>
                    <Text style={styles.contactName} numberOfLines={1}>
                      {contact.name}
                    </Text>

                    {contact.isPrimary ? (
                      <View style={styles.primaryChip}>
                        <Text style={styles.primaryText}>Primary</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.contactOrg} numberOfLines={1}>
                    {contact.organization?.name ?? "Unknown organization"}
                    {contact.title ? ` · ${contact.title}` : ""}
                  </Text>
                </View>

                <Icon
                  name={IconSet.ChevronRight}
                  size={16}
                  color={tokens.color.inkFaint}
                />
              </View>

              <View style={styles.contactDetails}>
                {contact.email ? (
                  <View style={styles.detailRow}>
                    <Icon
                      name={IconSet.Mail}
                      size={13}
                      color={tokens.color.inkFaint}
                    />
                    <Text style={styles.detailText} numberOfLines={1}>
                      {contact.email}
                    </Text>
                  </View>
                ) : null}

                {contact.phone ? (
                  <View style={styles.detailRow}>
                    <Icon
                      name={IconSet.Phone}
                      size={13}
                      color={tokens.color.inkFaint}
                    />
                    <Text style={styles.detailText} numberOfLines={1}>
                      {contact.phone}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.openHint}>
                Tap to see everyone at this client
              </Text>
            </Card>
          ))
        )}

        {hiddenCount > 0 ? (
          <View style={styles.moreRow}>
            <Icon
              name={IconSet.Search}
              size={14}
              color={tokens.color.inkFaint}
            />
            <Text style={styles.moreText}>
              {hiddenCount} more contact{hiddenCount === 1 ? "" : "s"} — search
              above to find them
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tokens.color.border,
  },

  avatarText: {
    ...tokens.type.bodyStrong,
    color: tokens.color.brand,
    fontWeight: "800",
  },

  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
    marginBottom: 8,
  },

  statItem: {
    width: "50%",
    paddingHorizontal: 6,
    marginBottom: 12,
  },

  sectionMeta: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  contactSearch: {
    marginBottom: 14,
  },

  contactCard: {
    padding: 14,
  },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  contactInitials: {
    ...tokens.type.caption,
    fontWeight: "800",
    color: tokens.color.brand,
  },

  contactTextCol: {
    flex: 1,
    gap: 3,
  },

  contactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  contactName: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
    flexShrink: 1,
  },

  primaryChip: {
    backgroundColor: tokens.color.brandSoft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },

  primaryText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.brand,
  },

  contactOrg: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  contactDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: 7,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  detailText: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    flexShrink: 1,
  },

  openHint: {
    ...tokens.type.micro,
    letterSpacing: 0,
    textTransform: "none",
    color: tokens.color.inkFaint,
    marginTop: 10,
  },

  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },

  moreText: {
    ...tokens.type.caption,
    color: tokens.color.inkFaint,
  },
});