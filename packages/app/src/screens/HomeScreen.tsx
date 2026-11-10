import { MemberEditSheet } from "../components/MemberEditSheet";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Platform,
  useWindowDimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  type Contact,
  type PipelinePage,
  STAGES,
  type ReportingSummary,
  formatAmount,
  tokens,
} from "@crm/core";

import {
  Card,
  Button,
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

import { DonutChart, pipelineDonut } from "../components/charts";
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
  onNavigate?: (screen: "PROSPECTS" | "CLIENTS" | "PIPELINE" | "FOLLOWUPS" | "REPORTS") => void;
};

export function HomeScreen({ onOpenClient, onNavigate }: HomeScreenProps) {
  const { token, user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1180;
  const [editingProfile, setEditingProfile] = useState(false);

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
  const [pipelineCounts, setPipelineCounts] = useState<PipelinePage["counts"] | null>(null);
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
        apiFetch<PipelinePage>("/opportunities?paginated=true&limit=1", token),
        apiFetch<Contact[]>("/contacts?limit=500", token),
      ]);

      setSummary(summaryData);
      setPipelineCounts(opportunityData.counts);
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
    const counts = STAGES.map(stage => ({ stage, count: pipelineCounts?.[stage] ?? 0 }));
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    return { counts, total };
  }, [pipelineCounts]);

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
    <Screen scroll={false}>
      {editingProfile && <MemberEditSheet onClose={() => setEditingProfile(false)} />}
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
          iconColor={tokens.color.accentStrong}
          tint={tokens.color.accentSoft}
          title={`${greetingForHour(new Date().getHours())}, ${firstName}.`}
          subtitle={today}
          right={Platform.OS !== "web" ?
            <View style={styles.headerActions}>
              <Pressable onPress={() => setEditingProfile(true)} accessibilityRole="button" accessibilityLabel="Edit my profile" style={{ alignItems: "center", gap: 3 }}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(user?.name ?? "")}</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: "600", color: tokens.color.brand }}>My profile</Text>
              </Pressable>

              <IconButton
                name={IconSet.Logout}
                label="Sign out"
                onPress={confirmSignOut}
                color={tokens.color.danger}
                bg={tokens.color.dangerSoft}
              />
            </View> : undefined
          }
        />

        <View style={styles.stats}>
          <View style={[styles.statItem, wide && { width: "25%" }]}>
            <StatCard
              sub="Organizations on file"
              label="Prospects"
              value={summary.totalProspects}
              icon={IconSet.People}
              accent={tokens.color.brand}
              soft={tokens.color.brandSoft}
            />
          </View>

          <View style={[styles.statItem, wide && { width: "25%" }]}>
            <StatCard
              sub="Lead opportunities"
              label="Leads"
              value={summary.totalLeads}
              icon={IconSet.Pipeline}
              accent={tokens.color.info}
              soft={tokens.color.infoSoft}
            />
          </View>

          <View style={[styles.statItem, wide && { width: "25%" }]}>
            <StatCard
              sub="Proposals in preparation"
              label="Proposals"
              value={summary.totalProposals}
              icon={IconSet.Doc}
              accent={tokens.color.warning}
              soft={tokens.color.warningSoft}
            />
          </View>

          <View style={[styles.statItem, wide && { width: "25%" }]}>
            <StatCard
              sub="Customer accounts"
              label="Clients"
              value={summary.totalClients}
              icon={IconSet.Check}
              accent={tokens.color.success}
              soft={tokens.color.successSoft}
            />
          </View>
        </View>

        <View style={[styles.dashboardGrid, wide && { flexDirection: "row" }]}>
          <View style={styles.dashboardColumn}>
            <Section title="Pipeline overview" action={<Pressable onPress={() => onNavigate?.("PIPELINE")} accessibilityRole="button"><Text style={styles.dashboardLink}>View pipeline</Text></Pressable>} />
            <Card style={styles.pipelineCard}>
              {pipeline.total > 0 ? <DonutChart data={pipelineDonut(pipeline.counts)} centerValue={`${pipeline.total}`} centerCaption="opportunities" /> : <EmptyState icon={IconSet.Pipeline} title="No opportunities yet" subtitle="Deals will appear here as they move through your pipeline." action={<Button title="Open pipeline" icon={IconSet.ChevronRight} variant="secondary" size="sm" onPress={() => onNavigate?.("PIPELINE")} />} />}
              <View style={styles.pipelineFooter}>
                <View><Text style={styles.smallLabel}>Won value</Text><Text style={styles.pipelineAmount}>{formatAmount(summary.wonValue)}</Text></View>
                <View><Text style={styles.smallLabel}>Active proposals</Text><Text style={styles.pipelineAmount}>{formatAmount(summary.activeProposalValue)}</Text></View>
              </View>
            </Card>
          </View>
          <View style={styles.dashboardColumn}>
            <Section title="Your workspace" />
            <Card style={styles.quickActions}>
              {([
                { screen: "PROSPECTS", title: "Explore prospects", description: "Browse organizations and manage assignments", icon: IconSet.People },
                { screen: "CLIENTS", title: "Manage clients", description: "Keep your client accounts and contacts up to date", icon: IconSet.Building },
                { screen: "FOLLOWUPS", title: "Plan your follow-ups", description: "Review scheduled calls, emails and meetings", icon: IconSet.Calendar },
                { screen: "REPORTS", title: "Review performance", description: "See results across your team and departments", icon: IconSet.Chart },
              ] as const).map((action, index) => <Pressable key={action.screen} accessibilityRole="button" onPress={() => onNavigate?.(action.screen)} style={({ pressed }) => [styles.quickAction, index > 0 && styles.quickActionBorder, pressed && { backgroundColor: tokens.color.brandFaint }]}>
                <View style={styles.quickIcon}><Icon name={action.icon} size={20} color={tokens.color.brand} /></View>
                <View style={{ flex: 1, gap: 5 }}><Text style={styles.quickTitle}>{action.title}</Text><Text style={styles.quickDescription}>{action.description}</Text></View>
                <Icon name={IconSet.ChevronRight} size={16} color={tokens.color.inkFaint} />
              </Pressable>)}
            </Card>
          </View>
        </View>

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
  dashboardGrid: { gap: 22 },
  dashboardColumn: { flex: 1, minWidth: 0 },
  dashboardLink: { ...tokens.type.caption, color: tokens.color.brand, fontWeight: "600" },
  pipelineCard: { flex: 1, minHeight: 345, justifyContent: "space-between" },
  pipelineFooter: { flexDirection: "row", gap: 32, borderTopWidth: 1, borderColor: tokens.color.border, paddingTop: 18, marginTop: 12 },
  smallLabel: { ...tokens.type.caption, color: tokens.color.inkMuted, marginBottom: 7 },
  pipelineAmount: { fontSize: 19, fontWeight: "600", color: tokens.color.brand },
  quickActions: { flex: 1, paddingVertical: 4, paddingHorizontal: 20 },
  quickAction: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 21 },
  quickActionBorder: { borderTopWidth: 1, borderColor: tokens.color.border },
  quickIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: tokens.color.brandFaint, alignItems: "center", justifyContent: "center" },
  quickTitle: { fontSize: 14, fontWeight: "600", color: tokens.color.brand },
  quickDescription: { fontSize: 12, lineHeight: 17, color: tokens.color.inkMuted },
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
