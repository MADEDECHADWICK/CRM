import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";

import {
  createApiClient,
  formatAmount,
  toAmount,
  type Opportunity,
  type ReportingSummary,
  type ReportPeriod,
  REPORT_PERIOD_LABELS,
  REPORT_PERIODS,
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
  Segmented,
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

function fmtRange(summary: ReportingSummary | null): string | null {
  if (!summary?.periodFrom || !summary?.periodTo) return null;

  const from = new Date(summary.periodFrom);
  const to = new Date(summary.periodTo);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }

  const monthDay = { day: "numeric" as const, month: "short" as const };
  const full = {
    day: "numeric" as const,
    month: "short" as const,
    year: "numeric" as const,
  };

  return `${from.toLocaleDateString("en-KE", monthDay)} – ${to.toLocaleDateString(
    "en-KE",
    full
  )}`;
}

function fmtDateShort(date: Date): string {
  return date.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [summary, setSummary] = useState<ReportingSummary | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const customReady = period === "custom" && !!customFrom && !!customTo;

  // Entering "Custom range" with no dates prompts the user by opening the
  // From picker (once per entry), then steps them through To. No request is
  // ever sent for a half-defined range.
  const autoPrompted = useRef(false);
  useEffect(() => {
    if (period !== "custom") {
      autoPrompted.current = false;
      return;
    }
    if (!customReady && !autoPrompted.current) {
      autoPrompted.current = true;
      setPicking("from");
    }
  }, [period, customReady]);

  const load = useCallback(async () => {
    if (!token) return;

    if (period === "custom" && !customReady) {
      setSummary(null);
      setOpportunities([]);
      setError(null);
      setLoading(false);
      return;
    }

    const query =
      period === "custom"
        ? `?period=custom&from=${customFrom!.toISOString()}&to=${customTo!.toISOString()}`
        : `?period=${period}`;

    try {
      setError(null);
      const [summaryData, opportunityData] = await Promise.all([
        apiFetch<ReportingSummary>(`/reporting/summary${query}`, token),
        apiFetch<Opportunity[]>(`/opportunities${query}`, token),
      ]);
      setSummary(summaryData);
      setOpportunities(opportunityData);
    } catch (err) {
      console.error("Reports loading error:", err);
      setError(err instanceof Error ? err.message : "Unable to load reports");
    } finally {
      setLoading(false);
    }
  }, [token, period, customFrom, customTo]);

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

  if (error && period !== "custom") {
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

  const rangeText = fmtRange(summary);
  const periodCaption =
    period === "all"
      ? "Won + active proposals + lost across every recorded deal."
      : period === "custom"
        ? "Won + active proposals + lost between the dates you picked."
        : `Won + active proposals + lost among deals entered ${REPORT_PERIOD_LABELS[
            period
          ].toLowerCase()}.`;

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
          subtitle={REPORT_PERIOD_LABELS[period]}
        />

        <Segmented
          value={period}
          onChange={(key) => {
            setLoading(true);
            setPeriod(key);
          }}
          options={REPORT_PERIODS.map((key) => ({
            key,
            label: REPORT_PERIOD_LABELS[key],
          }))}
        />

        {period === "custom" ? (
          <Card style={styles.customCard}>
            <Text style={styles.customHint}>
              Pick a start and end date. The report covers deals that entered
              their current stage between the two dates.
            </Text>

            <Text style={styles.fieldLabel}>From</Text>
            <Pressable
              onPress={() => setPicking("from")}
              style={styles.dateField}
            >
              {customFrom ? (
                <Text style={styles.dateValue}>{fmtDateShort(customFrom)}</Text>
              ) : (
                <Text style={styles.datePlaceholder}>Choose start date…</Text>
              )}
              <Icon
                name={IconSet.Calendar}
                size={18}
                color={tokens.color.inkFaint}
              />
            </Pressable>

            <Text style={styles.fieldLabel}>To</Text>
            <Pressable
              onPress={() => setPicking("to")}
              style={styles.dateField}
            >
              {customTo ? (
                <Text style={styles.dateValue}>{fmtDateShort(customTo)}</Text>
              ) : (
                <Text style={styles.datePlaceholder}>Choose end date…</Text>
              )}
              <Icon
                name={IconSet.Calendar}
                size={18}
                color={tokens.color.inkFaint}
              />
            </Pressable>

            {error ? <Text style={styles.customError}>{error}</Text> : null}

            {picking ? (
              <View style={styles.datePickerWrap}>
                {Platform.OS === "ios" ? (
                  <Pressable
                    onPress={() => setPicking(null)}
                    style={styles.dateDoneRow}
                    hitSlop={8}
                  >
                    <Text style={styles.dateDoneText}>Done</Text>
                  </Pressable>
                ) : null}

                <DateTimePicker
                  value={
                    picking === "from"
                      ? (customFrom ??
                        (customTo ? new Date(customTo.getTime()) : new Date()))
                      : (customTo ??
                        (customFrom ? new Date(customFrom.getTime()) : new Date()))
                  }
                  mode="date"
                  // "compact" (tappable grid) rather than a wheel, so
                  // onValueChange fires once per tap instead of streaming
                  // while the user scrolls — which is what makes the
                  // auto-close below safe.
                  display={Platform.OS === "ios" ? "compact" : "default"}
                  maximumDate={
                    picking === "from" && customTo ? customTo : undefined
                  }
                  minimumDate={
                    picking === "to" && customFrom ? customFrom : undefined
                  }
                  onValueChange={(_event, date) => {
                    if (!date) return;
                    if (picking === "from") {
                      setCustomFrom(date);
                      if (customTo && date >= customTo) {
                        setCustomTo(null);
                      } else if (!customTo) {
                        // Step through: From chosen → open To next. Keep the
                        // picker mounted, this range needs two dates.
                        setPicking("to");
                        return;
                      }
                    } else {
                      setCustomTo(date);
                      if (customFrom && date <= customFrom) {
                        setCustomFrom(null);
                      }
                    }

                    // Range complete (or no chaining needed) — collapse
                    // instead of leaving the calendar hanging open.
                    setPicking(null);
                  }}
                  onDismiss={() => setPicking(null)}
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        {summary && rangeText ? (
          <Text style={styles.rangeCaption}>{rangeText}</Text>
        ) : null}

        {summary ? (
          <ReportBody
            summary={summary}
            opportunities={opportunities}
            heroSub={periodCaption}
          />
        ) : customReady ? (
          <View style={styles.rangeEmpty}>
            <ActivityIndicator color={tokens.color.brand} />
            <Text style={styles.loadingText}>Crunching the numbers…</Text>
          </View>
        ) : (
          <View style={styles.rangeEmpty}>
            <EmptyState
              icon={IconSet.Chart}
              title="Choose a date range"
              subtitle="Tap the From field for a start date, then the To field for an end date. The report loads on its own once both are set."
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

type ReportBodyProps = {
  summary: ReportingSummary;
  opportunities: Opportunity[];
  heroSub: string;
};

function ReportBody({ summary, opportunities, heroSub }: ReportBodyProps) {
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

  const pipeline = countByStage(opportunities);

  return (
    <>
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
        <Text style={styles.heroSub}>{heroSub}</Text>
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
    </>
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

  rangeCaption: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 8,
    marginBottom: 12,
  },

  customCard: {
    marginTop: 12,
  },

  customHint: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginBottom: 12,
  },

  fieldLabel: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginBottom: 6,
    marginTop: 8,
  },

  dateField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: tokens.color.surface,
  },

  dateValue: {
    ...tokens.type.body,
    color: tokens.color.ink,
  },

  datePlaceholder: {
    ...tokens.type.body,
    color: tokens.color.inkFaint,
  },

  datePickerWrap: {
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },

  dateDoneRow: {
    alignItems: "flex-end",
    padding: 10,
  },

  dateDoneText: {
    ...tokens.type.bodyStrong,
    color: tokens.color.brand,
  },

  customError: {
    ...tokens.type.caption,
    color: tokens.color.danger,
    marginTop: 10,
  },

  rangeEmpty: {
    paddingVertical: 32,
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