import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { DateTimeInput as DateTimePicker } from "../components/DateTimeInput";

import {
  type Followup,
  type FollowupType,
  type Opportunity,
  type Organization,
  FOLLOWUP_TYPE_LABELS,
  tokens,
} from "@crm/core";

import {
  AppHeader,
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  IconSet,
  Screen,
  SearchBar,
  Section,
  Segmented,
  TextField,
} from "@crm/ui";

import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api";
import { Alert } from "../lib/dialogs";

type TabKey = "pending" | "done";

// GET /organizations returns each org with its opportunities included, so
// the client/prospect status below can be derived from the pipeline.
type OrgOption = Organization & { opportunities?: Opportunity[] };

type OrgBucket = "Client" | "Prospect" | "Account";

const ORG_BUCKET_STYLES: Record<
  OrgBucket,
  { label: string; color: string; bg: string }
> = {
  Client: {
    label: "Client",
    color: tokens.color.success,
    bg: tokens.color.successSoft,
  },
  Prospect: {
    label: "Prospect",
    color: tokens.color.brand,
    bg: tokens.color.brandSoft,
  },
  Account: {
    label: "Account",
    color: tokens.color.inkFaint,
    bg: tokens.color.surfaceMuted,
  },
};

function orgBucket(org: OrgOption): OrgBucket {
  const stages = (org.opportunities ?? []).map((item) => item.stage);
  if (stages.includes("WON")) return "Client";
  if (stages.some((stage) => stage !== "WON" && stage !== "LOST"))
    return "Prospect";
  return "Account";
}

const TYPE_ICONS: Record<FollowupType, (typeof IconSet)[keyof typeof IconSet]> = {
  CALL: IconSet.Phone,
  EMAIL: IconSet.Mail,
  MEETING: IconSet.Calendar,
};

function noonUtc(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T12:00:00.000Z`;
}

function fmtDateOnly(date: Date): string {
  return date.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDue(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-KE", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function FollowupsScreen() {
  const { token } = useAuth();

  const [followups, setFollowups] = useState<Followup[]>([]);
  const [tab, setTab] = useState<TabKey>("pending");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [note, setNote] = useState("");
  const [type, setType] = useState<FollowupType>("CALL");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgLoading, setOrgLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<OrgOption | null>(null);
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [orgQuery, setOrgQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;

    try {
      const data = await apiFetch<Followup[]>("/followups", token);
      setFollowups(data);
      setLoadError(null);
    } catch (err) {
      console.error("Followups loading error:", err);
      setLoadError(err instanceof Error ? err.message : "Unable to load follow-ups.");
    }
  }, [token]);

  const loadOrgs = useCallback(async () => {
    if (!token) return;

    const data = await apiFetch<OrgOption[]>("/organizations", token);
    setOrgs(data);
  }, [token]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    loadOrgs()
      .catch(console.error)
      .finally(() => setOrgLoading(false));
  }, [loadOrgs]);

  async function refresh() {
    try {
      setRefreshing(true);
      await Promise.all([load(), loadOrgs()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function createFollowup() {
    if (!token) return;

    if (!note.trim() || !dueDate) {
      Alert.alert("Missing details", "A note and a due date are required.");
      return;
    }

    try {
      setCreating(true);

      await apiFetch<Followup>("/followups", token, {
        method: "POST",
        body: JSON.stringify({
          note: note.trim(),
          type,
          dueAt: noonUtc(dueDate),
          organizationId: selectedOrg?.id,
        }),
      });

      setNote("");
      setType("CALL");
      setDueDate(null);
      setPickerOpen(false);
      setSelectedOrg(null);
      setOrgPickerOpen(false);
      setOrgQuery("");
      setShowCreate(false);
      setTab("pending");

      await load();
    } catch (error) {
      Alert.alert(
        "Unable to create",
        error instanceof Error ? error.message : "Unable to create follow-up."
      );
    } finally {
      setCreating(false);
    }
  }

  async function completeFollowup(id: string) {
    if (!token) return;

    try {
      await apiFetch(`/followups/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      await load();
    } catch (error) {
      Alert.alert(
        "Unable to update",
        error instanceof Error ? error.message : "Unable to update follow-up."
      );
    }
  }

  const filteredOrgs = useMemo(() => {
    const lower = orgQuery.trim().toLowerCase();

    if (!lower) return orgs;

    return orgs.filter(
      (org) =>
        org.name.toLowerCase().includes(lower) ||
        (org.industry ?? "").toLowerCase().includes(lower)
    );
  }, [orgs, orgQuery]);

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
          <EmptyState
            icon={IconSet.Warning}
            title="Unable to load follow-ups"
            subtitle={loadError}
          />
        </View>
      </Screen>
    );
  }

  const pendingCount = followups.filter(
    (item) => item.status === "PENDING"
  ).length;

  const completedCount = followups.filter(
    (item) => item.status === "COMPLETED"
  ).length;

  const shown =
    tab === "pending"
      ? followups.filter((item) => item.status === "PENDING")
      : followups.filter((item) => item.status === "COMPLETED");

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
          title="Follow-ups"
          subtitle={
            pendingCount > 0
              ? `${pendingCount} awaiting action`
              : "Nothing due right now"
          }
          right={
            <IconButton
              name={IconSet.Add}
              label="New follow-up"
              color={tokens.color.white}
              bg={tokens.color.brand}
              onPress={() => setShowCreate((value) => !value)}
            />
          }
        />

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: "pending", label: "Pending", count: pendingCount },
            { key: "done", label: "Completed", count: completedCount },
          ]}
        />

        {showCreate ? (
          <View style={styles.createWrap}>
            <Section title="New follow-up" />

            <Card>
              <Text style={styles.fieldLabel}>Kind</Text>

              <View style={styles.typeRow}>
                {(Object.keys(FOLLOWUP_TYPE_LABELS) as FollowupType[]).map(
                  (option) => (
                    <Chip
                      key={option}
                      label={FOLLOWUP_TYPE_LABELS[option]}
                      selected={type === option}
                      onPress={() => setType(option)}
                    />
                  )
                )}
              </View>

              <TextField
                label="Note"
                value={note}
                onChangeText={setNote}
                placeholder="e.g. Call the partner about the proposal"
              />

              <Text style={styles.fieldLabel}>Due date</Text>

              <Pressable
                onPress={() => setPickerOpen((value) => !value)}
                style={styles.dateField}
              >
                {dueDate ? (
                  <Text style={styles.dateValue}>
                    {fmtDateOnly(dueDate)}
                  </Text>
                ) : (
                  <Text style={styles.datePlaceholder}>
                    Choose a date…
                  </Text>
                )}

                <Icon
                  name={IconSet.Calendar}
                  size={18}
                  color={tokens.color.inkFaint}
                />
              </Pressable>

              {pickerOpen ? (
                <View style={styles.datePickerWrap}>
                  {Platform.OS === "ios" ? (
                    <Pressable
                      onPress={() => setPickerOpen(false)}
                      style={styles.dateDoneRow}
                      hitSlop={8}
                    >
                      <Text style={styles.dateDoneText}>Done</Text>
                    </Pressable>
                  ) : null}

                  <DateTimePicker
                    value={dueDate ?? new Date()}
                    mode="date"
                    // "compact" renders a tappable calendar grid on iOS
                    // instead of a wheel. That matters for auto-close: a
                    // spinner's onValueChange fires continuously while
                    // scrolling, so closing on it would dismiss the picker
                    // the instant the user starts flicking. A grid only
                    // reports once, on an actual tap.
                    display={Platform.OS === "ios" ? "compact" : "default"}
                    onValueChange={(_event, date) => {
                      if (date) setDueDate(date);
                      // Collapse as soon as a date is chosen — same as the
                      // native Android dialog dismissing itself.
                      setPickerOpen(false);
                    }}
                    onDismiss={() => setPickerOpen(false)}
                  />
                </View>
              ) : null}

              <View style={styles.field}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Client / Prospect</Text>

                  {selectedOrg ? (
                    <Pressable
                      onPress={() => setSelectedOrg(null)}
                      hitSlop={8}
                    >
                      <Text style={styles.clearText}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  onPress={() => setOrgPickerOpen((value) => !value)}
                  style={styles.orgSelector}
                >
                  {selectedOrg ? (
                    <View style={styles.orgSelectorValue}>
                      <Text
                        style={styles.orgSelectorName}
                        numberOfLines={1}
                      >
                        {selectedOrg.name}
                      </Text>

                      <View
                        style={[
                          styles.orgTag,
                          {
                            backgroundColor:
                              ORG_BUCKET_STYLES[orgBucket(selectedOrg)].bg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.orgTagText,
                            {
                              color:
                                ORG_BUCKET_STYLES[orgBucket(selectedOrg)]
                                  .color,
                            },
                          ]}
                        >
                          {ORG_BUCKET_STYLES[orgBucket(selectedOrg)].label}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.orgSelectorPlaceholder}>
                      {orgLoading
                        ? "Loading clients & prospects…"
                        : "Choose a client or prospect…"}
                    </Text>
                  )}

                  <Icon
                    name={
                      orgPickerOpen
                        ? IconSet.ChevronUp
                        : IconSet.ChevronDown
                    }
                    size={18}
                    color={tokens.color.inkFaint}
                  />
                </Pressable>

                {orgPickerOpen ? (
                  <View style={styles.orgPicker}>
                    <SearchBar
                      value={orgQuery}
                      onChangeText={setOrgQuery}
                      placeholder="Search clients & prospects"
                    />

                    {filteredOrgs.length === 0 ? (
                      <Text style={styles.orgEmpty}>
                        No clients or prospects found.
                      </Text>
                    ) : (
                      filteredOrgs.map((org) => {
                        const active = org.id === selectedOrg?.id;

                        return (
                          <Pressable
                            key={org.id}
                            onPress={() => {
                              setSelectedOrg(org);
                              setOrgPickerOpen(false);
                            }}
                            style={({ pressed }) => [
                              styles.orgRow,
                              active && styles.orgRowActive,
                              pressed && styles.orgRowPressed,
                            ]}
                          >
                            <View style={styles.orgRowText}>
                              <Text
                                style={styles.orgName}
                                numberOfLines={1}
                              >
                                {org.name}
                              </Text>

                              {org.industry ? (
                                <Text
                                  style={styles.orgIndustry}
                                  numberOfLines={1}
                                >
                                  {org.industry}
                                </Text>
                              ) : null}
                            </View>

                            <View
                              style={[
                                styles.orgTag,
                                {
                                  backgroundColor:
                                    ORG_BUCKET_STYLES[
                                      orgBucket(org)
                                    ].bg,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.orgTagText,
                                  {
                                    color:
                                      ORG_BUCKET_STYLES[
                                        orgBucket(org)
                                      ].color,
                                  },
                                ]}
                              >
                                {ORG_BUCKET_STYLES[orgBucket(org)].label}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                ) : null}
              </View>

              <Button
                title="Create follow-up"
                onPress={createFollowup}
                loading={creating}
                disabled={creating}
                icon={IconSet.Add}
              />
            </Card>
          </View>
        ) : null}

        <View style={styles.listGap}>
          {shown.length === 0 ? (
            <EmptyState
              icon={tab === "pending" ? IconSet.Bell : IconSet.Check}
              title={tab === "pending" ? "All caught up" : "Nothing completed yet"}
              subtitle={
                tab === "pending"
                  ? "Create a follow-up to keep momentum on your deals."
                  : "Completed follow-ups will show up here."
              }
              action={
                tab === "pending" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    title="New follow-up"
                    icon={IconSet.Add}
                    onPress={() => setShowCreate(true)}
                  />
                ) : null
              }
            />
          ) : (
            shown.map((followup) => {
              const overdue =
                followup.status === "PENDING" &&
                new Date(followup.dueAt).getTime() < Date.now();

              return (
                <Card key={followup.id} style={styles.followupCard}>
                  <View style={styles.followupHeader}>
                    <View
                      style={[
                        styles.typeIcon,
                        overdue && styles.typeIconOverdue,
                      ]}
                    >
                      <Icon
                        name={TYPE_ICONS[followup.type]}
                        size={16}
                        color={
                          overdue
                            ? tokens.color.danger
                            : tokens.color.brand
                        }
                      />
                    </View>

                    <View style={styles.followupTextCol}>
                      <Text style={styles.followupTitle} numberOfLines={2}>
                        {followup.note}
                      </Text>

                      <Text style={styles.followupMeta}>
                        {FOLLOWUP_TYPE_LABELS[followup.type]}
                        {" · "}
                        {followup.organization?.name ??
                          followup.opportunity?.organization?.name ??
                          "No client linked"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.followupFooter}>
                    <Text
                      style={[
                        styles.dueText,
                        overdue && styles.dueTextOverdue,
                      ]}
                    >
                      {overdue ? "Overdue · " : ""}
                      {fmtDue(followup.dueAt)}
                    </Text>

                    {followup.status === "PENDING" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        title="Done"
                        icon={IconSet.Check}
                        onPress={() => completeFollowup(followup.id)}
                      />
                    ) : (
                      <View style={styles.completedChip}>
                        <Icon
                          name={IconSet.Check}
                          size={13}
                          color={tokens.color.success}
                        />
                        <Text style={styles.completedText}>Completed</Text>
                      </View>
                    )}
                  </View>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  createWrap: {
    marginTop: 16,
  },

  fieldLabel: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    color: tokens.color.inkFaint,
    marginBottom: 10,
  },

  field: {
    marginBottom: 16,
  },

  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  clearText: {
    ...tokens.type.caption,
    fontWeight: "600",
    color: tokens.color.brand,
  },

  dateField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 46,
    backgroundColor: tokens.color.surfacePressed,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: 14,
    marginBottom: 10,
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
    marginBottom: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: 12,
    ...tokens.shadow.hairline,
  },

  dateDoneRow: {
    alignSelf: "flex-end",
    marginBottom: 6,
  },

  dateDoneText: {
    ...tokens.type.caption,
    fontWeight: "700",
    color: tokens.color.brand,
  },

  orgSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 46,
    backgroundColor: tokens.color.surfacePressed,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: 14,
  },

  orgSelectorValue: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  orgSelectorName: {
    flexShrink: 1,
    ...tokens.type.body,
    color: tokens.color.ink,
  },

  orgSelectorPlaceholder: {
    flex: 1,
    ...tokens.type.body,
    color: tokens.color.inkFaint,
  },

  orgPicker: {
    marginTop: 10,
    marginBottom: 4,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: 8,
    ...tokens.shadow.hairline,
  },

  orgEmpty: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    paddingVertical: 14,
    textAlign: "center",
  },

  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.sm,
  },

  orgRowActive: {
    backgroundColor: tokens.color.brandSoft,
  },

  orgRowPressed: {
    backgroundColor: tokens.color.surfacePressed,
  },

  orgRowText: {
    flex: 1,
  },

  orgName: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
  },

  orgIndustry: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkFaint,
    marginTop: 2,
  },

  orgTag: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  orgTagText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    fontWeight: "700",
  },

  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },

  listGap: {
    marginTop: 16,
  },

  followupCard: {
    padding: 14,
  },

  followupHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },

  typeIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  typeIconOverdue: {
    backgroundColor: tokens.color.dangerSoft,
  },

  followupTextCol: {
    flex: 1,
  },

  followupTitle: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
  },

  followupMeta: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 4,
  },

  followupFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },

  dueText: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  dueTextOverdue: {
    color: tokens.color.danger,
    fontWeight: "600",
  },

  completedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tokens.color.successSoft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  completedText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.success,
    fontWeight: "700",
  },
});