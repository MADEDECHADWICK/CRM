import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createApiClient,
  formatAmount,
  type Opportunity,
  type ReportingSummary,
  tokens,
} from "@crm/core";

import {
  AppHeader,
  Badge,
  Card,
  EmptyState,
  Icon,
  IconButton,
  IconSet,
  Screen,
  Section,
  StatCard,
} from "@crm/ui";

import { countByStage, DonutChart, pipelineDonut } from "../components/charts";
import { useAuth } from "../auth/AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const apiFetch = createApiClient(API_URL);

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

export function HomeScreen() {
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;

    const [summaryData, opportunityData] = await Promise.all([
      apiFetch<ReportingSummary>("/reporting/summary", token),
      apiFetch<Opportunity[]>("/opportunities", token),
    ]);

    setSummary(summaryData);
    setOpportunities(opportunityData);
  }, [token]);

  useEffect(() => {
    load()
      .catch(console.error)
      .finally(() => setLoading(false));
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

  if (loading || !summary) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.brand} />
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
        <AppHeader
          title={`${greetingForHour(new Date().getHours())}, ${firstName}.`}
          subtitle={today}
          right={
            <View style={styles.headerActions}>
              <IconButton
                name={IconSet.Logout}
                label="Sign out"
                onPress={confirmSignOut}
              />

              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {initials(user?.name ?? "")}
                </Text>
              </View>
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
          title="Recent opportunities"
          action={<Text style={styles.sectionMeta}>{opportunities.length} total</Text>}
        />

        {opportunities.length === 0 ? (
          <EmptyState
            icon={IconSet.Pipeline}
            title="Pipeline is quiet"
            subtitle="Create a new opportunity to start tracking it here."
          />
        ) : (
          opportunities.slice(0, 4).map((opportunity) => (
            <Card key={opportunity.id} style={styles.oppCard}>
              <View style={styles.oppHeader}>
                <View style={styles.oppTextCol}>
                  <Text style={styles.oppTitle} numberOfLines={1}>
                    {opportunity.title}
                  </Text>

                  <Text style={styles.oppMeta} numberOfLines={1}>
                    {opportunity.organization?.name ?? "Unknown organization"}
                    {opportunity.department?.name
                      ? ` · ${opportunity.department.name}`
                      : ""}
                  </Text>
                </View>

                {opportunity.amount != null ? (
                  <Text style={styles.oppAmount}>
                    {formatAmount(
                      opportunity.amount,
                      opportunity.currency
                    )}
                  </Text>
                ) : null}
              </View>

              <View style={styles.oppFooter}>
                <Badge stage={opportunity.stage} />
                <Icon
                  name={IconSet.ChevronRight}
                  size={16}
                  color={tokens.color.inkFaint}
                />
              </View>
            </Card>
          ))
        )}
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

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tokens.color.border,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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

  oppCard: {
    padding: 14,
  },

  oppHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  oppTextCol: {
    flex: 1,
  },

  oppTitle: {
    ...tokens.type.h3,
    color: tokens.color.ink,
  },

  oppMeta: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 3,
  },

  oppAmount: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
  },

  oppFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
});