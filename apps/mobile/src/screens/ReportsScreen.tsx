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
  createApiClient,
  formatAmount,
  toAmount,
  type Opportunity,
  type ReportingSummary,
  tokens,
} from "@crm/core";

import {
  AppHeader,
  Card,
  EmptyState,
  Icon,
  IconSet,
  Screen,
  Section,
  StatCard,
} from "@crm/ui";

import {
  countByStage,
  DonutChart,
  type DonutDatum,
  pipelineBar,
  StageBarChart,
} from "../components/charts";
import { useAuth } from "../auth/AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const apiFetch = createApiClient(API_URL);

function compactKES(amount: number): string {
  if (amount >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `KES ${(amount / 1_000).toFixed(0)}K`;
  return `KES ${amount.toLocaleString()}`;
}

type RowProps = {
  label: string;
  value: string;
  icon: (typeof IconSet)[keyof typeof IconSet];
  color: string;
  last?: boolean;
};

function Row({ label, value, icon, color, last = false }: RowProps) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowLeft}>
        <Icon name={icon} size={16} color={color} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function ReportsScreen() {
  const { token } = useAuth();

  const [summary, setSummary] = useState<ReportingSummary | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const pipeline = useMemo(() => countByStage(opportunities), [opportunities]);

  const load = useCallback(async () => {
    if (!token) return;

    try {
      setError(null);
      const [summaryData, opportunityData] = await Promise.all([
        apiFetch<ReportingSummary>("/reporting/summary", token),
        apiFetch<Opportunity[]>("/opportunities", token),
      ]);
      setSummary(summaryData);
      setOpportunities(opportunityData);
    } catch (err) {
      console.error("Reports loading error:", err);
      setError(err instanceof Error ? err.message : "Unable to load reports");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.brand} />
          <Text style={styles.loadingText}>Crunching the numbers…</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.center}>
          <EmptyState
            icon={IconSet.Warning}
            title="Unable to load reports"
            subtitle={error}
          />
        </View>
      </Screen>
    );
  }

  if (!summary) {
    return (
      <Screen>
        <View style={styles.center}>
          <EmptyState
            icon={IconSet.Chart}
            title="No reporting data"
            subtitle="Once deals move through the pipeline, you'll see the numbers here."
          />
        </View>
      </Screen>
    );
  }

  const wonValue = toAmount(summary.wonValue);
  const lostValue = toAmount(summary.lostValue);
  const activeValue = toAmount(summary.activeProposalValue);
  const tracked = wonValue + lostValue + activeValue;

  const valueDonut: DonutDatum[] = [
    {
      key: "won",
      label: "Won",
      value: wonValue,
      color: tokens.color.brand,
    },
    {
      key: "active",
      label: "Active proposals",
      value: activeValue,
      color: tokens.color.warning,
    },
    {
      key: "lost",
      label: "Lost",
      value: lostValue,
      color: tokens.color.danger,
    },
  ];

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
          title="Reports"
          subtitle="Business development at a glance"
        />

        <View style={styles.metricRow}>
          <View style={styles.metricItem}>
            <StatCard
              label="Leads"
              value={summary.totalLeads}
              icon={IconSet.Pipeline}
              accent={tokens.color.info}
              soft={tokens.color.infoSoft}
            />
          </View>
          <View style={styles.metricItem}>
            <StatCard
              label="Proposals"
              value={summary.totalProposals}
              icon={IconSet.Doc}
              accent={tokens.color.warning}
              soft={tokens.color.warningSoft}
            />
          </View>
          <View style={styles.metricItem}>
            <StatCard
              label="Clients"
              value={summary.totalClients}
              icon={IconSet.Check}
              accent={tokens.color.success}
              soft={tokens.color.successSoft}
            />
          </View>
        </View>

        <Card style={styles.heroCard}>
          <View style={styles.heroAccent} />
          <Text style={styles.heroLabel}>Tracked pipeline value</Text>
          <Text style={styles.heroValue}>{formatAmount(tracked)}</Text>
          <Text style={styles.heroSub}>
            Won + active proposals + lost across every recorded deal.
          </Text>
        </Card>

        <Section title="Where the value sits" />

        <Card>
          <DonutChart
            data={valueDonut}
            centerValue={compactKES(tracked)}
            centerCaption="tracked value"
            valueFormatter={formatAmount}
          />
        </Card>

        <Section title="Pipeline by stage" />

        <Card>
          <StageBarChart data={pipelineBar(pipeline)} />
        </Card>

        <Section title="Financial summary" />

        <Card>
          <Row
            label="Won value"
            value={formatAmount(wonValue)}
            icon={IconSet.Check}
            color={tokens.color.success}
          />
          <Row
            label="Active proposal value"
            value={formatAmount(activeValue)}
            icon={IconSet.Doc}
            color={tokens.color.warning}
          />
          <Row
            label="Lost value"
            value={formatAmount(lostValue)}
            icon={IconSet.Warning}
            color={tokens.color.danger}
          />
          <Row
            label="Total tracked value"
            value={formatAmount(tracked)}
            icon={IconSet.Wallet}
            color={tokens.color.brand}
            last
          />
        </Card>

        <Section title="Snapshot" />

        <Card>
          <Row
            label="Prospects on file"
            value={`${summary.totalProspects}`}
            icon={IconSet.People}
            color={tokens.color.brand}
          />
          <Row
            label="Clients won"
            value={`${summary.totalClients}`}
            icon={IconSet.Check}
            color={tokens.color.success}
            last
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingText: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 12,
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  metricRow: {
    flexDirection: "row",
    marginHorizontal: -4,
    marginBottom: 4,
  },

  metricItem: {
    flex: 1,
    marginHorizontal: 4,
  },

  heroCard: {
    backgroundColor: tokens.color.brand,
    borderColor: tokens.color.brand,
    marginTop: 8,
    marginBottom: 4,
  },

  heroAccent: {
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.warning,
    marginBottom: 14,
  },

  heroLabel: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    color: tokens.color.brandSoft,
  },

  heroValue: {
    ...tokens.type.h1,
    fontSize: 30,
    color: tokens.color.white,
    marginTop: 10,
  },

  heroSub: {
    ...tokens.type.caption,
    color: tokens.color.brandSoft,
    marginTop: 8,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    gap: 12,
  },

  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },

  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  rowLabel: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  rowValue: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
  },
});