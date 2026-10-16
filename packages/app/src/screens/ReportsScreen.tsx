import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  formatAmount,
  FX_TO_KES,
  REPORT_CURRENCIES,
  REPORT_PERIOD_LABELS,
  SCORECARD_DIMENSIONS,
  tokens,
  type ReportPeriod,
  type ScorecardDimension,
} from "@crm/core";

import {
  AppHeader,
  BarList,
  Card,
  IconSet,
  Screen,
  Section,
  Segmented,
} from "@crm/ui";

import { useAuth } from "../auth/AuthContext";
import { apiFetch, getApiUrl } from "../api";
import { DateField } from "../components/DateField";

const PERIODS: ReportPeriod[] = ["week", "month", "quarter", "year", "all", "custom"];

const GROUP_LABELS: Record<ScorecardDimension, string> = {
  department: "Department",
  country: "Country",
  signingPartner: "Signing role",
  industry: "Industry",
};

/**
 * Opens a report as a downloadable file.
 *
 * The token goes in the query string because a browser link / native share
 * cannot set an Authorization header; requireAuth accepts it as a fallback.
 */
function openReport(path: string, token: string, format: "csv" | "word") {
  const url = `${getApiUrl()}${path}${path.includes("?") ? "&" : "?"}format=${format}&token=${encodeURIComponent(token)}`;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank");
  } else {
    Linking.openURL(url);
  }
}

function fmt(v: number | null): string {
  return v == null ? "N/A" : `${(v * 100).toFixed(1)}%`;
}

type ReportSectionProps = {
  title: string;
  path: string;
  headers: string[];
  toCells: (row: Record<string, unknown>) => (string | number)[];
  token: string;
  reloadKey: number;
  controls?: ReactNode;
  note?: string;
};

function ReportSection({ title, path, headers, toCells, token, reloadKey, controls, note }: ReportSectionProps) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(null);
    apiFetch<{ rows: Record<string, unknown>[] }>(path, token)
      .then((data) => {
        if (active) setRows(data.rows);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load report");
      });
    return () => {
      active = false;
    };
  }, [path, token, reloadKey]);

  return (
    <>
      <Section
        title={title}
        action={
          <View style={styles.downloadRow}>
            <Pressable onPress={() => openReport(path, token, "csv")} hitSlop={8}>
              <Text style={styles.download}>CSV</Text>
            </Pressable>
            <Pressable onPress={() => openReport(path, token, "word")} hitSlop={8}>
              <Text style={styles.download}>Word</Text>
            </Pressable>
          </View>
        }
      />
      {controls ? <View style={styles.controls}>{controls}</View> : null}
      <Card>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows === null ? (
          <ActivityIndicator color={tokens.color.brand} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No data for this period.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.tr, styles.thead]}>
                {headers.map((h) => (
                  <Text key={h} style={styles.th}>{h}</Text>
                ))}
              </View>
              {rows.map((row, i) => (
                <View key={i} style={styles.tr}>
                  {toCells(row).map((cell, j) => (
                    <Text key={j} style={styles.td}>{String(cell)}</Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </Card>
    </>
  );
}

type ReportChartProps = {
  title: string;
  path: string;
  token: string;
  reloadKey: number;
  toItem: (row: Record<string, unknown>) => { label: string; value: number; caption?: string };
  color?: string;
  note?: string;
};

function ReportChart({ title, path, token, reloadKey, toItem, color, note }: ReportChartProps) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(null);
    apiFetch<{ rows: Record<string, unknown>[] }>(path, token)
      .then((data) => {
        if (active) setRows(data.rows);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load report");
      });
    return () => {
      active = false;
    };
  }, [path, token, reloadKey]);

  const items = (rows ?? [])
    .map(toItem)
    .filter((item) => item.value !== 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <>
      <Section title={title} />
      <Card>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows === null ? (
          <ActivityIndicator color={tokens.color.brand} />
        ) : (
          <BarList items={items} color={color} />
        )}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </Card>
    </>
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function ReportsScreen() {
  const { token } = useAuth();
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [groupBy, setGroupBy] = useState<ScorecardDimension>("department");
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("KES");

  async function refresh() {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    setRefreshing(false);
  }

  if (!token) return null;

  const customReady = period === "custom" && from != null && to != null;
  const q =
    period === "custom"
      ? customReady
        ? `?period=custom&from=${startOfDay(from!).toISOString()}&to=${endOfDay(to!).toISOString()}`
        : null
      : `?period=${period}`;
  // Reports are computed in KES; the selector re-expresses them in the chosen
  // currency for a partner/manager working in their local currency.
  const rate = FX_TO_KES[displayCurrency] ?? 1;
  const num = (v: unknown) => formatAmount(Math.round((v as number) / rate), displayCurrency);

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={tokens.color.brand} />
        }
      >
        <AppHeader icon={IconSet.Chart} title="Reports" subtitle={`Management reporting — ${displayCurrency}`} />

        <Segmented
          value={period}
          onChange={(key) => setPeriod(key)}
          options={PERIODS.map((key) => ({ key, label: REPORT_PERIOD_LABELS[key] }))}
        />

        {period === "custom" ? (
          <Card>
            <DateField label="From" value={from} onChange={setFrom} maximumDate={to ?? new Date()} />
            <DateField label="To" value={to} onChange={setTo} minimumDate={from ?? undefined} maximumDate={new Date()} />
          </Card>
        ) : null}

        <Segmented
          value={displayCurrency}
          onChange={(key) => setDisplayCurrency(key)}
          options={REPORT_CURRENCIES.map((code) => ({ key: code, label: code }))}
        />

        {q === null ? (
          <Card>
            <Text style={styles.empty}>Pick both a From and a To date to run a custom range.</Text>
          </Card>
        ) : (
          <>
        <ReportSection
          title="Performance scorecard"
          path={`/reporting/scorecard${q}&groupBy=${groupBy}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Group", "Leads", "Quotes", "Sent", "Wins", "Booked", "Wins/sent"]}
          toCells={(r) => [String(r.label), r.leads as number, num(r.quotes), r.sent as number, r.wins as number, num(r.booked), fmt(r.winsPerSent as number | null)]}
          controls={
            <Segmented
              value={groupBy}
              onChange={(key) => setGroupBy(key)}
              options={SCORECARD_DIMENSIONS.map((key) => ({ key, label: GROUP_LABELS[key] }))}
            />
          }
          note="Wins/sent is a period activity ratio, not a matched-cohort conversion rate."
        />

        <ReportChart
          title={`Booked fees by ${GROUP_LABELS[groupBy].toLowerCase()}`}
          path={`/reporting/scorecard${q}&groupBy=${groupBy}`}
          token={token}
          reloadKey={reloadKey}
          toItem={(r) => ({ label: String(r.label), value: r.booked as number, caption: num(r.booked) })}
        />

        <ReportChart
          title="Quoted demand by industry"
          path={`/reporting/industry${q}`}
          token={token}
          reloadKey={reloadKey}
          toItem={(r) => ({ label: String(r.label), value: r.quoted as number, caption: num(r.quoted) })}
        />

        <ReportChart
          title="Customer acquisition"
          path={`/reporting/acquisition${q}`}
          token={token}
          reloadKey={reloadKey}
          toItem={(r) => ({ label: String(r.label), value: r.count as number })}
          color={tokens.color.info}
          note="First-recorded wins per month."
        />

        <ReportSection
          title="Book of business"
          path={`/reporting/book-of-business${q}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Group", "New clients", "Existing", "Cross-sell", "Upsell", "Total"]}
          toCells={(r) => [String(r.label), num(r.new), num(r.existing), num(r.crossSell), num(r.upsell), num(r.total)]}
          note="New = the client's first won job; cross-sell/upsell from the won business type."
        />

        <ReportSection
          title="Industry performance"
          path={`/reporting/industry${q}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Industry", "Quoted", "Booked"]}
          toCells={(r) => [String(r.label), num(r.quoted), num(r.booked)]}
        />

        <ReportSection
          title="Lead sources"
          path={`/reporting/sources${q}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Source", "Leads", "Reached proposal", "Won", "Won value"]}
          toCells={(r) => [String(r.label), r.leads as number, r.reachedProposal as number, r.won as number, num(r.wonValue)]}
        />

        <ReportSection
          title="Prequalifications"
          path={`/reporting/prequalifications${q}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Client", "Country", "Service", "Department", "Stage", "Amount", "Owner", "Submitted"]}
          toCells={(r) => [String(r.client), String(r.country), String(r.service), String(r.department), String(r.stage), num(r.amount), String(r.owner), String(r.submitted)]}
          note="Prequalifications are reported separately from RFP/RFQ tenders."
        />

        <ReportSection
          title="Client priorities"
          path={`/reporting/client-priorities${q}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Client", "Country", "Booked"]}
          toCells={(r) => [String(r.name), String(r.country ?? "Unspecified"), num(r.booked)]}
        />

        <ReportSection
          title="Proposal turnaround"
          path={`/reporting/turnaround${q}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Country", "Valid pairs", "Mean days", "Median days"]}
          toCells={(r) => [
            String(r.label),
            r.validPairs as number,
            r.meanDays == null ? "N/A" : (r.meanDays as number).toFixed(1),
            r.medianDays == null ? "N/A" : (r.medianDays as number).toFixed(1),
          ]}
          note="Calendar days from receipt to submission."
        />

        <ReportSection
          title="Priority follow-ups"
          path={`/reporting/priority-follow-ups${q}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Client", "Partner", "Quoted"]}
          toCells={(r) => [String(r.client), String(r.partner), num(r.quoted)]}
          note="Largest bids submitted and awaiting a decision."
        />

        <ReportSection
          title="All leads"
          path={`/reporting/leads${q}`}
          token={token}
          reloadKey={reloadKey}
          headers={["Client", "Country", "Service", "Source", "Received", "Stage", "Amount", "Owner"]}
          toCells={(r) => [String(r.client), String(r.country), String(r.service), String(r.source), String(r.received), String(r.stage), num(r.amount), String(r.owner)]}
          note="Download CSV/Word for every lead column."
        />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  downloadRow: { flexDirection: "row", gap: 14 },
  download: { ...tokens.type.caption, color: tokens.color.brand, fontWeight: "700" },
  controls: { marginBottom: 12 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  thead: { borderBottomWidth: 2 },
  th: {
    ...tokens.type.micro,
    letterSpacing: 0,
    fontWeight: "800",
    color: tokens.color.ink,
    minWidth: 110,
    paddingVertical: 8,
    paddingRight: 12,
  },
  td: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    minWidth: 110,
    paddingVertical: 8,
    paddingRight: 12,
  },
  error: { ...tokens.type.caption, color: tokens.color.danger },
  empty: { ...tokens.type.caption, color: tokens.color.inkMuted },
  note: { ...tokens.type.micro, letterSpacing: 0, color: tokens.color.inkFaint, marginTop: 12 },
});
