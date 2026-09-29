import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  ALLOWED_TRANSITIONS,
  ApiError,
  createApiClient,
  formatAmount,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  RAG_LABELS,
  type DepartmentDetail,
  type LeadSource,
  type Opportunity,
  type OpportunityDetail,
  type Organization,
  type RagStatus,
  type Stage,
  type UserLite,
  STAGE_COLORS,
  STAGE_LABELS,
  tokens,
} from "@crm/core";

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  IconSet,
  InfoRow,
  RagBadge,
  Screen,
  SearchBar,
  Section,
  Segmented,
} from "@crm/ui";

import { useAuth } from "../auth/AuthContext";

import { DateField, toNoonUTC } from "../components/DateField";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const apiFetch = createApiClient(API_URL);

type FilterKey =
  | "all"
  | "prospect"
  | "lead"
  | "proposal"
  | "awaiting"
  | "notSubmitted"
  | "deferred"
  | "overdue";

const FILTER_STAGE: Partial<Record<FilterKey, Stage>> = {
  prospect: "PROSPECT",
  lead: "LEAD",
  proposal: "PROPOSAL",
  awaiting: "AWAITING_FEEDBACK",
  notSubmitted: "NOT_SUBMITTED",
  deferred: "DEFERRED",
};

const FILTER_RAG: Partial<Record<FilterKey, RagStatus>> = {
  overdue: "OVERDUE",
};

// Short label for the chip — the full "Awaiting Feedback" would crowd the row.
const FILTER_LABEL: Record<FilterKey, string> = {
  all: "All",
  prospect: "Prospect",
  lead: "Lead",
  proposal: "Proposal",
  awaiting: "Awaiting",
  notSubmitted: "Not sent",
  deferred: "Deferred",
  overdue: "Overdue",
};

const FILTER_ORDER: readonly FilterKey[] = [
  "all",
  "prospect",
  "lead",
  "proposal",
  "awaiting",
  "notSubmitted",
  "deferred",
  "overdue",
] as const;

function fmtDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export function OpportunitiesScreen() {
  const { token, user } = useAuth();
  const isBD = user?.role === "MARKETING_BD";

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;

    const data = await apiFetch<Opportunity[]>("/opportunities", token);
    setOpportunities(data);
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

  const counts = useMemo(() => {
    const byStage = (stage: Stage) =>
      opportunities.filter((item) => item.stage === stage).length;

    return {
      all: opportunities.length,
      prospect: byStage("PROSPECT"),
      lead: byStage("LEAD"),
      proposal: byStage("PROPOSAL"),
      awaiting: byStage("AWAITING_FEEDBACK"),
      notSubmitted: byStage("NOT_SUBMITTED"),
      deferred: byStage("DEFERRED"),
      // Computed from the server's rag value rather than recomputed on the
      // phone: the deadline clock is the server's, and a locally recomputed
      // countdown could disagree with the value every other client shows.
      overdue: opportunities.filter(
        (item) => item.rag?.status === "OVERDUE"
      ).length,
    };
  }, [opportunities]);

  const filtered = useMemo(() => {
    const stage = FILTER_STAGE[filter];
    const rag = FILTER_RAG[filter];
    const lower = query.trim().toLowerCase();

    return opportunities.filter((item) => {
      if (stage && item.stage !== stage) return false;
      if (rag && item.rag?.status !== rag) return false;

      if (!lower) return true;

      return (
        item.title.toLowerCase().includes(lower) ||
        (item.organization?.name ?? "").toLowerCase().includes(lower) ||
        item.service.toLowerCase().includes(lower)
      );
    });
  }, [opportunities, filter, query]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.brand} />
        </View>
      </Screen>
    );
  }

  if (selectedId) {
    return (
      <PipelineDetail
        id={selectedId}
        onClose={() => {
          setSelectedId(null);
          load();
        }}
      />
    );
  }

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
          title="Pipeline"
          subtitle="Every opportunity, end to end"
          right={
            isBD ? (
              <IconButton
                name={showAddForm ? IconSet.Close : IconSet.Add}
                label={showAddForm ? "Close deal form" : "Add deal"}
                color={tokens.color.brand}
                bg={tokens.color.brandSoft}
                onPress={() => setShowAddForm((open) => !open)}
              />
            ) : undefined
          }
        />

        <Segmented
          value={filter}
          onChange={setFilter}
          options={FILTER_ORDER.map((key) => ({
            key,
            label: FILTER_LABEL[key],
            count: counts[key],
          }))}
        />

        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search deals, clients, services"
          />
        </View>

        {showAddForm && token ? (
          <AddDealForm
            token={token}
            onSaved={() => {
              setShowAddForm(false);
              load();
            }}
          />
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            icon={IconSet.Search}
            title={counts.all === 0 ? "No deals yet" : "Nothing matches"}
            subtitle={
              counts.all === 0
                ? "Add your first deal to start tracking the pipeline."
                : "Try a different filter or search term."
            }
          />
        ) : (
          filtered.map((opportunity) => (
            <PipelineCard
              key={opportunity.id}
              opportunity={opportunity}
              onPress={() => setSelectedId(opportunity.id)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

type PipelineCardProps = {
  opportunity: Opportunity;
  onPress: () => void;
};

type AddDealFormProps = {
  token: string;
  onSaved: () => void;
};

function AddDealForm({ token, onSaved }: AddDealFormProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [departments, setDepartments] = useState<DepartmentDetail[]>([]);
  const [staff, setStaff] = useState<UserLite[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [stage, setStage] = useState<"PROSPECT" | "LEAD">("LEAD");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  // BR-018: the source is mandatory and has no default, so the picker starts
  // empty. Preselecting something would reintroduce exactly the silent
  // unattributed lead the reporting exists to eliminate.
  const [leadSource, setLeadSource] = useState<LeadSource | null>(null);
  const [leadSourceNote, setLeadSourceNote] = useState("");
  const [leadReceivedAt, setLeadReceivedAt] = useState<Date | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const owners = useMemo(
    () =>
      staff.filter(
        (member) =>
          member.role === "PARTNER" || member.role === "MANAGER"
      ),
    [staff]
  );

  useEffect(() => {
    let active = true;

    Promise.all([
      apiFetch<Organization[]>("/organizations", token),
      apiFetch<DepartmentDetail[]>("/departments", token),
      apiFetch<UserLite[]>("/users", token),
    ])
      .then(([orgs, depts, users]) => {
        if (!active) return;
        setOrganizations(orgs);
        setDepartments(depts);
        setStaff(
          users.filter(
            (member) =>
              member.role === "PARTNER" || member.role === "MANAGER"
          )
        );
      })
      .catch((error) => {
        if (!active) return;
        setOptionsError(
          error instanceof Error ? error.message : "Unable to load options"
        );
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function submit() {
    if (!title.trim() || !service.trim()) {
      Alert.alert("Missing details", "Enter a deal title and the service offered.");
      return;
    }
    if (!organizationId || !departmentId || !ownerId) {
      Alert.alert(
        "Missing details",
        "Pick an organization, a department and an owner (Partner/Manager)."
      );
      return;
    }
    if (!leadSource) {
      Alert.alert(
        "Where did this lead come from?",
        "Every deal needs a source — it is what makes the channel reports worth reading."
      );
      return;
    }
    if (leadSource === "OTHER" && !leadSourceNote.trim()) {
      Alert.alert(
        "Describe the source",
        "Choose 'Other' means describing it — a single unexplained 'Other' is no better than a blank."
      );
      return;
    }
    if (leadReceivedAt && leadReceivedAt.getTime() > Date.now()) {
      Alert.alert("Invalid date", "A lead cannot have arrived in the future.");
      return;
    }

    const parsedAmount = amount.trim() ? Number(amount) : null;
    if (amount.trim() && (!Number.isFinite(parsedAmount) || parsedAmount! <= 0)) {
      Alert.alert("Invalid amount", "Enter a positive number or leave it blank.");
      return;
    }

    try {
      setSubmitting(true);
      await apiFetch("/opportunities", token, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          service: service.trim(),
          organizationId,
          departmentId,
          ownerId,
          stage,
          leadSource,
          ...(leadSource === "OTHER" && leadSourceNote.trim()
            ? { leadSourceNote: leadSourceNote.trim() }
            : {}),
          // Omitted rather than defaulted client-side so the server's
          // "arrived now" default stays the single definition of it.
          ...(leadReceivedAt
            ? { leadReceivedAt: toNoonUTC(leadReceivedAt).toISOString() }
            : {}),
          ...(parsedAmount != null ? { amount: parsedAmount } : {}),
          ...(currency.trim() ? { currency: currency.trim() } : {}),
        }),
      });
      onSaved();
    } catch (error) {
      Alert.alert(
        "Unable to add deal",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={styles.formCard}>
      <Text style={styles.formCardTitle}>Add deal</Text>

      {optionsError ? (
        <Text style={styles.formError}>{optionsError}</Text>
      ) : loadingOptions ? (
        <ActivityIndicator color={tokens.color.brand} style={styles.formBusy} />
      ) : (
        <>
          <TextFieldForm
            label="Deal title"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Annual audit mandate"
          />

          <TextFieldForm
            label="Service offered"
            value={service}
            onChangeText={setService}
            placeholder="e.g. Tax advisory"
          />

          <Text style={styles.formLabel}>Stage</Text>
          <View style={styles.stageSegmented}>
            <Segmented<"PROSPECT" | "LEAD">
              value={stage}
              onChange={setStage}
              options={[
                { key: "LEAD", label: "Lead" },
                { key: "PROSPECT", label: "Prospect" },
              ]}
            />
          </View>

          <Text style={styles.formLabel}>Organization</Text>
          <View style={styles.chipWrap}>
            {organizations.map((org) => (
              <Chip
                key={org.id}
                label={org.name}
                selected={organizationId === org.id}
                onPress={() =>
                  setOrganizationId((current) =>
                    current === org.id ? null : org.id
                  )
                }
              />
            ))}
          </View>

          <Text style={styles.formLabel}>Department</Text>
          <View style={styles.chipWrap}>
            {departments.map((dept) => (
              <Chip
                key={dept.id}
                label={dept.name}
                selected={departmentId === dept.id}
                onPress={() =>
                  setDepartmentId((current) =>
                    current === dept.id ? null : dept.id
                  )
                }
              />
            ))}
          </View>

          <Text style={styles.formLabel}>Owner (Partner/Manager)</Text>
          <View style={styles.chipWrap}>
            {owners.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                selected={ownerId === member.id}
                onPress={() =>
                  setOwnerId((current) =>
                    current === member.id ? null : member.id
                  )
                }
              />
            ))}
          </View>

          <View style={styles.amountRow}>
            <View style={styles.amountFlex}>
              <TextFieldForm
                label="Deal value (optional)"
                value={amount}
                onChangeText={setAmount}
                placeholder="e.g. 750000"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.amountFlex}>
              <TextFieldForm
                label="Currency"
                value={currency}
                onChangeText={setCurrency}
                placeholder="KES"
              />
            </View>
          </View>

          <Text style={styles.formLabel}>
            How did this lead reach us? (required)
          </Text>
          <View style={styles.chipWrap}>
            {LEAD_SOURCES.map((source) => (
              <Chip
                key={source}
                label={LEAD_SOURCE_LABELS[source]}
                selected={leadSource === source}
                onPress={() =>
                  setLeadSource((current) =>
                    current === source ? null : source
                  )
                }
              />
            ))}
          </View>

          {leadSource === "OTHER" ? (
            <TextFieldForm
              label="Describe the source"
              value={leadSourceNote}
              onChangeText={setLeadSourceNote}
              placeholder="e.g. Kenya Accountants Association member"
            />
          ) : null}

          <DateField
            label="Lead received (optional)"
            value={leadReceivedAt}
            onChange={setLeadReceivedAt}
            maximumDate={new Date()}
            hint="Leave blank if this is today's lead. Backdate it if the deal has been in the diary for a while — the velocity reports measure from the first conversation."
          />

          <Button
            title="Add deal"
            onPress={submit}
            loading={submitting}
            disabled={submitting}
            icon={IconSet.Add}
          />
        </>
      )}
    </Card>
  );
}

function PipelineCard({ opportunity, onPress }: PipelineCardProps) {
  const stageColors = STAGE_COLORS[opportunity.stage];
  const owedBreachNote = opportunity.breachNoteRequired;

  return (
    <Card onPress={onPress} style={styles.pipelineCard}>
      <View style={styles.pipelineHeader}>
        <View style={styles.pipelineTitleCol}>
          <Text style={styles.pipelineTitle} numberOfLines={1}>
            {opportunity.title}
          </Text>

          <View style={styles.orgRow}>
            <Icon
              name={IconSet.Building}
              size={13}
              color={tokens.color.inkFaint}
            />
            <Text style={styles.pipelineOrg} numberOfLines={1}>
              {opportunity.organization?.name ?? "Unknown organization"}
            </Text>
          </View>

          <View style={styles.sourceRow}>
            <Text style={styles.sourceText} numberOfLines={1}>
              {LEAD_SOURCE_LABELS[opportunity.leadSource]}
              {opportunity.leadSource === "OTHER" && opportunity.leadSourceNote
                ? ` · ${opportunity.leadSourceNote}`
                : ""}
            </Text>
          </View>
        </View>

        <View style={styles.pipelineStageWrap}>
          <Badge stage={opportunity.stage} />
          <Text style={[styles.valueBrace, { color: stageColors.dot }]}>
            {opportunity.amount != null
              ? formatAmount(opportunity.amount, opportunity.currency)
              : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.pipelineRagRow}>
        <RagBadge rag={opportunity.rag} />
        {owedBreachNote ? (
          <View style={styles.owePill}>
            <Icon
              name={IconSet.Warning}
              size={11}
              color={tokens.color.danger}
            />
            <Text style={styles.owePillText}>Explanation owed</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.pipelineFooter}>
        <View style={styles.serviceChip}>
          <Text style={styles.serviceText}>{opportunity.service}</Text>
        </View>

        <Icon
          name={IconSet.ChevronRight}
          size={15}
          color={tokens.color.inkFaint}
        />
      </View>
    </Card>
  );
}

type PipelineDetailProps = {
  id: string;
  onClose: () => void;
};

function PipelineDetail({ id, onClose }: PipelineDetailProps) {
  const { token, user } = useAuth();
  const isBD = user?.role === "MARKETING_BD";

  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Transition form
  const [target, setTarget] = useState<Stage | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [revisitAt, setRevisitAt] = useState<Date | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // BR-020 completeness gate. The server returns the specific outstanding
  // fields on rejection; they are held here so the user gets a checklist
  // instead of a sentence that tells them a count but not which fields.
  const [missingFields, setMissingFields] = useState<{
    field: string;
    message: string;
    scope: "ORGANIZATION" | "CONTACT";
  }[]>([]);

  // Note form
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  // BR-017 proposal drafting deadline
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [deadlineBusy, setDeadlineBusy] = useState(false);

  // BR-019 post-breach explanation
  const [breachNoteOpen, setBreachNoteOpen] = useState(false);
  const [breachExplanation, setBreachExplanation] = useState("");
  const [breachBusy, setBreachBusy] = useState(false);

  // Reassign owner form (BD only)
  const [owners, setOwners] = useState<UserLite[]>([]);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState<string | null>(null);
  const [reassignNote, setReassignNote] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignLoading, setReassignLoading] = useState(false);

  const openReassign = useCallback(async () => {
    if (!token || reassignOpen) return;

    setReassignOpen(true);
    setReassignLoading(true);
    try {
      const users = await apiFetch<UserLite[]>("/users", token);
      setOwners(
        users.filter(
          (member) =>
            member.role === "PARTNER" || member.role === "MANAGER"
        )
      );
      setNewOwnerId(
        detail?.owner?.id ??
          users.find(
            (member) =>
              member.role === "PARTNER" || member.role === "MANAGER"
          )?.id ??
          null
      );
    } catch (error) {
      Alert.alert(
        "Unable to load owners",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setReassignLoading(false);
    }
  }, [token, reassignOpen, detail?.owner?.id]);

  async function submitReassign() {
    if (!token || !detail || !newOwnerId) return;

    if (newOwnerId === detail.owner?.id) return;

    if (!reassignNote.trim()) {
      Alert.alert("Note required", "Explain why you're moving this deal.");
      return;
    }

    try {
      setReassignBusy(true);
      await apiFetch(`/opportunities/${detail.id}/reassign`, token, {
        method: "POST",
        body: JSON.stringify({
          newOwnerId,
          note: reassignNote.trim(),
        }),
      });
      setReassignOpen(false);
      setNewOwnerId(null);
      setReassignNote("");
      await loadDetail();
    } catch (error) {
      Alert.alert(
        "Unable to reassign",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setReassignBusy(false);
    }
  }

  const loadDetail = useCallback(async () => {
    if (!token) return;

    try {
      const data = await apiFetch<OpportunityDetail>(
        `/opportunities/${id}`,
        token
      );
      setDetail(data);
    } catch (error) {
      Alert.alert(
        "Unable to load",
        error instanceof Error ? error.message : "Unable to load opportunity."
      );
      onClose();
    } finally {
      setLoading(false);
    }
  }, [id, token, onClose]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function submitTransition() {
    if (!token || !detail || !target) return;

    if (!reason.trim()) {
      Alert.alert("Reason required", "Every stage change needs a reason (BR-010).");
      return;
    }

    if (target === "WON") {
      const parsed = Number(amount);
      if (!amount || !Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert("Amount required", "Enter the won deal value (KES).");
        return;
      }
    }

    if (target === "DEFERRED" && !revisitAt) {
      Alert.alert("Revisit date required", "Enter when you'll revisit this deal.");
      return;
    }

    try {
      setSubmitting(true);

      await apiFetch(`/opportunities/${detail.id}/transition`, token, {
        method: "POST",
        body: JSON.stringify({
          toStage: target,
          reason: reason.trim(),
          ...(target === "WON" ? { amount: Number(amount) } : {}),
          ...(target === "DEFERRED" || target === "AWAITING_FEEDBACK"
            ? // Optional for AWAITING_FEEDBACK — omitted entirely when no
              // date was chosen, so the server doesn't reject a missing one.
              // toNoonUTC keeps the picked calendar day from slipping a day
              // backwards when serialised in a UTC+ offset.
              revisitAt
              ? { revisitAt: toNoonUTC(revisitAt).toISOString() }
              : {}
            : {}),
          ...(target === "LOST" && lostReason.trim()
            ? { lostReason: lostReason.trim() }
            : {}),
        }),
      });

      resetForm();
      await loadDetail();
    } catch (error) {
      // The completeness gate is the one rejection with a useful remedy, so
      // it gets a rendered checklist rather than an alert. Everything else
      // falls back to the plain message.
      if (error instanceof ApiError && error.missingFields.length > 0) {
        setMissingFields(error.missingFields);
        setTarget(null);
      } else {
        setMissingFields([]);
        Alert.alert(
          "Unable to move deal",
          error instanceof Error ? error.message : "The transition was rejected."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setTarget(null);
    setReason("");
    setAmount("");
    setRevisitAt(null);
    setLostReason("");
    setMissingFields([]);
  }

  async function saveDeadline() {
    if (!token || !detail || !deadlineDate) return;

    if (deadlineDate.getTime() <= Date.now()) {
      Alert.alert(
        "Pick a future date",
        "A drafting deadline that has already passed would flag the deal as overdue the moment you save it."
      );
      return;
    }

    try {
      setDeadlineBusy(true);
      // End of day, not start: a deadline is "have the draft ready by
      // then", and noon-UTC anchoring keeps the calendar day from shifting
      // backwards in a positive UTC offset.
      const dueAt = new Date(deadlineDate);
      dueAt.setHours(23, 59, 0, 0);

      await apiFetch(`/opportunities/${detail.id}/deadline`, token, {
        method: "POST",
        body: JSON.stringify({ dueAt: dueAt.toISOString() }),
      });

      setDeadlineOpen(false);
      setDeadlineDate(null);
      await loadDetail();
    } catch (error) {
      Alert.alert(
        "Unable to set deadline",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setDeadlineBusy(false);
    }
  }

  async function clearDeadline() {
    if (!token || !detail) return;

    try {
      setDeadlineBusy(true);
      await apiFetch(`/opportunities/${detail.id}/deadline`, token, {
        method: "DELETE",
      });
      await loadDetail();
    } catch (error) {
      Alert.alert(
        "Unable to clear deadline",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setDeadlineBusy(false);
    }
  }

  async function saveBreachNote() {
    if (!token || !detail || !breachExplanation.trim()) return;

    try {
      setBreachBusy(true);
      await apiFetch(`/opportunities/${detail.id}/breach-note`, token, {
        method: "POST",
        body: JSON.stringify({ explanation: breachExplanation.trim() }),
      });

      setBreachNoteOpen(false);
      setBreachExplanation("");
      await loadDetail();
    } catch (error) {
      Alert.alert(
        "Unable to record explanation",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBreachBusy(false);
    }
  }

  async function addNote() {
    if (!token || !detail || !noteBody.trim()) return;

    try {
      setNoteBusy(true);
      await apiFetch("/notes", token, {
        method: "POST",
        body: JSON.stringify({
          body: noteBody.trim(),
          opportunityId: detail.id,
        }),
      });
      setNoteBody("");
      await loadDetail();
    } catch (error) {
      Alert.alert(
        "Unable to add note",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setNoteBusy(false);
    }
  }

  if (loading || !detail) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.brand} />
        </View>
      </Screen>
    );
  }

  const bannerColor = STAGE_COLORS[detail.stage];
  const transitions = ALLOWED_TRANSITIONS[detail.stage];
  const needsAmount = target === "WON";
  // Both DEFERRED and AWAITING_FEEDBACK can carry a chase date. It is
  // mandatory for a deferral, but a soft "I'll check back" nudge when the
  // proposal goes out.
  const followUpStage = target === "DEFERRED" || target === "AWAITING_FEEDBACK";
  const followUpOptional = target === "AWAITING_FEEDBACK";
  const followUpLabel = followUpOptional ? "Follow-up date (optional)" : "Revisit date";
  const needsLostReason = target === "LOST";

  // A deadline is only meaningful while the draft is still being written, so
  // the control hides itself once the proposal is out. NOT_SUBMITTED stays
  // eligible: re-arming the clock is how a flagged deal is recovered.
  const canIssueDeadline =
    (detail.stage === "LEAD" ||
      detail.stage === "PROPOSAL" ||
      detail.stage === "NOT_SUBMITTED") &&
    !detail.proposalSubmittedAt;

  // The sweep can move a deal to NOT_SUBMITTED out from under nobody's
  // attention, so the explanation is surfaced at the top of the detail screen
  // rather than left for someone to remember it exists.
  const owesExplanation = detail.breachNoteRequired;
  const breachNoteLate =
    owesExplanation &&
    detail.breachNoteDueAt != null &&
    new Date(detail.breachNoteDueAt).getTime() < Date.now();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.detailContent}
      >
        <View style={styles.detailTopBar}>
          <IconButton
            name={IconSet.Back}
            label="Back to pipeline"
            onPress={onClose}
          />
          <Text style={styles.detailBarTitle}>Opportunity</Text>
          <View style={styles.detailBarSpacer} />
        </View>

        <View
          style={[
            styles.detailBanner,
            { borderTopColor: bannerColor.dot },
          ]}
        >
          <View style={styles.detailBadgeRow}>
            <Badge stage={detail.stage} />
            <RagBadge rag={detail.rag} showDays />
          </View>

          <Text style={styles.detailTitle}>{detail.title}</Text>

          <View style={styles.detailOrgRow}>
            <Icon
              name={IconSet.Building}
              size={15}
              color={tokens.color.inkMuted}
            />
            <Text style={styles.detailOrg}>
              {detail.organization?.name ?? "Unknown organization"}
            </Text>
          </View>

          {detail.amount != null ? (
            <Text style={styles.detailAmount}>
              {formatAmount(detail.amount, detail.currency)}
            </Text>
          ) : null}
        </View>

        {owesExplanation ? (
          <Card style={styles.breachCard}>
            <View style={styles.breachHeader}>
              <Icon
                name={IconSet.Warning}
                size={16}
                color={breachNoteLate ? tokens.color.danger : tokens.color.warning}
              />
              <Text
                style={[
                  styles.breachTitle,
                  { color: breachNoteLate ? tokens.color.danger : tokens.color.warning },
                ]}
              >
                {breachNoteLate
                  ? "Explanation overdue"
                  : "Explanation owed"}
              </Text>
            </View>

            <Text style={styles.breachBody}>
              The proposal deadline passed on{" "}
              {fmtDate(detail.proposalBreachedAt ?? detail.proposalDueAt ?? "")}
              {detail.breachNoteDueAt
                ? ` and this deal was flagged automatically. ${detail.stage === "NOT_SUBMITTED" ? "Move it back to Proposal once the draft is on its way." : "Recover the draft to clear the flag."} Your explanation is due by ${fmtDate(detail.breachNoteDueAt)}.`
                : "."}
            </Text>

            {breachNoteOpen ? (
              <>
                <TextFieldForm
                  label="Why was the deadline missed?"
                  value={breachExplanation}
                  onChangeText={setBreachExplanation}
                  placeholder="e.g. Client data was incomplete, so drafting could not start"
                />
                <View style={styles.breachActions}>
                  <Button
                    title="Save explanation"
                    onPress={saveBreachNote}
                    loading={breachBusy}
                    disabled={breachBusy || !breachExplanation.trim()}
                    icon={IconSet.Check}
                  />
                  <Pressable onPress={() => setBreachNoteOpen(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Button
                title="Record the explanation"
                onPress={() => setBreachNoteOpen(true)}
                icon={IconSet.Doc}
              />
            )}
          </Card>
        ) : null}

        <Card>
          <InfoRow
            label="Service line"
            value={detail.service}
            icon={IconSet.Doc}
          />
          <InfoRow
            label="Lead source"
            value={
              detail.leadSource === "OTHER" && detail.leadSourceNote
                ? `${LEAD_SOURCE_LABELS[detail.leadSource]} · ${detail.leadSourceNote}`
                : LEAD_SOURCE_LABELS[detail.leadSource]
            }
            icon={IconSet.Search}
          />
          <InfoRow
            label="Lead received"
            value={fmtDate(detail.leadReceivedAt)}
            icon={IconSet.Calendar}
          />
          <InfoRow
            label="Department"
            value={detail.department?.name ?? null}
            icon={IconSet.People}
          />
          <InfoRow
            label="Owner"
            value={detail.owner?.name ?? null}
            icon={IconSet.Pin}
          />
          <InfoRow
            label="Created by"
            value={detail.createdBy?.name ?? null}
            icon={IconSet.Person}
          />
          <InfoRow
            label="In this stage since"
            value={fmtDate(detail.stageEnteredAt)}
            icon={IconSet.Clock}
          />

          {detail.revisitAt ? (
            <InfoRow
              // Same field, different meaning: a revisit date for a
              // deferral, a feedback-chase date for a sent proposal.
              label={
                detail.stage === "AWAITING_FEEDBACK" ? "Feedback due" : "Revisit"
              }
              value={fmtDate(detail.revisitAt)}
              icon={IconSet.Calendar}
            />
          ) : null}

          {detail.lostReason ? (
            <InfoRow
              label="Lost reason"
              value={detail.lostReason}
              icon={IconSet.Warning}
              last
            />
          ) : null}
        </Card>

        {canIssueDeadline || detail.proposalDueAt ? (
          <>
            <Section
              title="Proposal deadline"
              action={
                canIssueDeadline ? (
                  <Pressable
                    onPress={() => {
                      if (deadlineOpen) {
                        setDeadlineOpen(false);
                        setDeadlineDate(null);
                      } else {
                        // Pre-fill with the existing deadline, or a fortnight
                        // out when there is none.
                        setDeadlineDate(
                          detail.proposalDueAt
                            ? new Date(detail.proposalDueAt)
                            : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                        );
                        setDeadlineOpen(true);
                      }
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.cancelText}>
                      {deadlineOpen ? "Cancel" : detail.proposalDueAt ? "Change" : "Set"}
                    </Text>
                  </Pressable>
                ) : null
              }
            />

            <Card>
              <InfoRow
                label="Draft due (internal)"
                value={
                  detail.proposalDueAt ? fmtDate(detail.proposalDueAt) : "Not set"
                }
                icon={IconSet.Clock}
              />
              <InfoRow
                label="Status"
                value={detail.rag ? RAG_LABELS[detail.rag.status] : "Unknown"}
                icon={IconSet.Warning}
              />
              {detail.proposalSubmittedAt ? (
                <InfoRow
                  label="Sent to client"
                  value={fmtDate(detail.proposalSubmittedAt)}
                  icon={IconSet.Check}
                />
              ) : null}

              {deadlineOpen ? (
                <>
                  <DateField
                    label="Draft ready by"
                    value={deadlineDate}
                    onChange={setDeadlineDate}
                    minimumDate={new Date()}
                    hint="Internal only — this is when the draft should be finished, not when it goes to the client."
                  />
                  <Button
                    title="Save deadline"
                    onPress={saveDeadline}
                    loading={deadlineBusy}
                    disabled={deadlineBusy || !deadlineDate}
                    icon={IconSet.Check}
                  />
                </>
              ) : null}

              {detail.proposalDueAt && !deadlineOpen ? (
                <View style={styles.deadlineClear}>
                  <Pressable onPress={clearDeadline} disabled={deadlineBusy}>
                    <Text style={styles.clearDeadlineText}>
                      {deadlineBusy ? "Clearing…" : "Clear deadline"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </Card>
          </>
        ) : null}

        {isBD ? (
          <>
            <Section
              title="Owner"
              action={
                reassignOpen ? (
                  <Pressable
                    onPress={() => {
                      setReassignOpen(false);
                      setNewOwnerId(null);
                      setReassignNote("");
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      if (!reassignOpen) openReassign();
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.cancelText}>Reassign</Text>
                  </Pressable>
                )
              }
            />

            {reassignOpen ? (
              <Card>
                {reassignLoading ? (
                  <ActivityIndicator
                    color={tokens.color.brand}
                    style={styles.reassignBusy}
                  />
                ) : (
                  <>
                    <Text style={styles.formLabel}>
                      New owner (Partner/Manager)
                    </Text>
                    <View style={styles.chipWrap}>
                      {owners.map((member) => (
                        <Chip
                          key={member.id}
                          label={member.name}
                          selected={newOwnerId === member.id}
                          onPress={() => setNewOwnerId(member.id)}
                        />
                      ))}
                    </View>

                    <View style={styles.reassignNote}>
                      <TextFieldForm
                        label="Why this deal is moving"
                        value={reassignNote}
                        onChangeText={setReassignNote}
                        placeholder="e.g. Handed off to the tax team"
                      />
                    </View>

                    <Button
                      title="Transfer ownership"
                      onPress={submitReassign}
                      loading={reassignBusy}
                      disabled={
                        reassignBusy ||
                        !newOwnerId ||
                        newOwnerId === detail.owner?.id
                      }
                      icon={IconSet.Check}
                    />
                  </>
                )}
              </Card>
            ) : null}
          </>
        ) : null}

        {transitions.length > 0 ? (
          <>
            <Section
              title="Advance the deal"
              action={
                target ? (
                  <Pressable onPress={resetForm}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                ) : null
              }
            />

            {missingFields.length > 0 ? (
              <Card style={styles.missingCard}>
                <View style={styles.missingHeader}>
                  <Icon
                    name={IconSet.Warning}
                    size={16}
                    color={tokens.color.warning}
                  />
                  <Text style={styles.missingTitle}>
                    Before this can be a proposal
                  </Text>
                </View>

                <Text style={styles.missingBody}>
                  The client record needs to be complete before the firm
                  commits to a number in writing. {missingFields.length} item
                  {missingFields.length === 1 ? "" : "s"} outstanding:
                </Text>

                {missingFields.map((field) => (
                  <View key={field.field} style={styles.missingRow}>
                    <View
                      style={[
                        styles.missingDot,
                        {
                          backgroundColor:
                            field.scope === "ORGANIZATION"
                              ? tokens.color.info
                              : tokens.color.brand,
                        },
                      ]}
                    />
                    <Text style={styles.missingItem}>{field.message}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {detail.stage === "NOT_SUBMITTED" && !target ? (
              <View style={styles.recoverHint}>
                <Icon
                  name={IconSet.Search}
                  size={14}
                  color={tokens.color.inkMuted}
                />
                <Text style={styles.recoverHintText}>
                  This deal was flagged automatically when its proposal
                  deadline passed. Move it back to Proposal to resume work.
                </Text>
              </View>
            ) : null}

            {target === null ? (
              <View style={styles.transitionRow}>
                {transitions.map((stage) => {
                  const palette = STAGE_COLORS[stage];

                  return (
                    <Pressable
                      key={stage}
                      onPress={() => setTarget(stage)}
                      style={({ pressed }) => [
                        styles.transitionPill,
                        { backgroundColor: palette.bg },
                        pressed && styles.transitionPillPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.transitionDot,
                          { backgroundColor: palette.dot },
                        ]}
                      />
                      <Text
                        style={[
                          styles.transitionPillText,
                          { color: palette.text },
                        ]}
                      >
                        {STAGE_LABELS[stage]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Card>
                <View style={styles.transferTargetRow}>
                  <View
                    style={[
                      styles.transitionDot,
                      {
                        backgroundColor: STAGE_COLORS[target].dot,
                      },
                    ]}
                  />
                  <Text style={styles.transferTargetText}>
                    Move to{" "}
                    {STAGE_LABELS[target].toLowerCase()}
                  </Text>
                </View>

                <TextFieldForm
                  label="Reason for the change"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="e.g. Partner approved terms"
                />

                {needsAmount ? (
                  <TextFieldForm
                    label="Won value (KES)"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="e.g. 750000"
                    keyboardType="numeric"
                  />
                ) : null}

                {followUpStage ? (
                  <DateField
                    label={followUpLabel}
                    value={revisitAt}
                    onChange={setRevisitAt}
                    hint={
                      followUpOptional
                        ? "Optional. If set, we'll remind you to chase for feedback on this date."
                        : "Required to defer."
                    }
                  />
                ) : null}

                {needsLostReason ? (
                  <TextFieldForm
                    label="Reason lost"
                    value={lostReason}
                    onChangeText={setLostReason}
                    placeholder="e.g. Won by competitor"
                  />
                ) : null}

                <Button
                  title={`Move to ${STAGE_LABELS[target]}`}
                  onPress={submitTransition}
                  loading={submitting}
                  disabled={submitting}
                  icon={IconSet.Check}
                />
              </Card>
            )}
          </>
        ) : (
          <Section title="Outcome reached" />
        )}

        <Section title="Notes" />
        <View style={styles.noteInputWrap}>
          <TextInput
            style={styles.noteInput}
            value={noteBody}
            onChangeText={setNoteBody}
            placeholder="Log a note about this deal…"
            placeholderTextColor={tokens.color.inkFaint}
            multiline
          />
          <Pressable
            onPress={addNote}
            disabled={noteBusy || !noteBody.trim()}
            style={styles.noteSend}
          >
            {noteBusy ? (
              <ActivityIndicator size="small" color={tokens.color.white} />
            ) : (
              <Icon name={IconSet.Send} size={18} color={tokens.color.white} />
            )}
          </Pressable>
        </View>

        {detail.notes && detail.notes.length > 0 ? (
          detail.notes.map((note) => (
            <View key={note.id} style={styles.noteCard}>
              <Text style={styles.noteBody}>{note.body}</Text>
              <Text style={styles.noteMeta}>
                {note.author.name} · {fmtDate(note.createdAt)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.noNotes}>
            No notes yet — add the first one above.
          </Text>
        )}

        <Section title="Activity" />
        <Card>
          {detail.stageHistory && detail.stageHistory.length > 0 ? (
            detail.stageHistory.map((entry, index) => (
              <View
                key={entry.id}
                style={[
                  styles.historyItem,
                  index < detail.stageHistory!.length - 1 &&
                    styles.historyItemBorder,
                ]}
              >
                <View
                  style={[
                    styles.historyDot,
                    { backgroundColor: STAGE_COLORS[entry.toStage].dot },
                  ]}
                />
                <View style={styles.historyTextCol}>
                  <Text style={styles.historyTitle}>
                    {entry.fromStage
                      ? `${STAGE_LABELS[entry.fromStage]} → ${STAGE_LABELS[entry.toStage]}`
                      : `${STAGE_LABELS[entry.toStage]}`}
                  </Text>
                  <Text style={styles.historyReason} numberOfLines={2}>
                    {entry.reason}
                  </Text>
                </View>
                <Text style={styles.historyDate}>{fmtDate(entry.changedAt)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noNotes}>No stage activity recorded.</Text>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ---------- tiny inline primitives -------------

function TextFieldForm(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{props.label}</Text>
      <TextInput
        style={styles.formInput}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={tokens.color.inkFaint}
        keyboardType={props.keyboardType ?? "default"}
        autoCapitalize="sentences"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    paddingBottom: 40,
  },

  detailContent: {
    paddingBottom: 48,
  },

  searchWrap: {
    marginTop: 14,
    marginBottom: 16,
  },

  pipelineCard: {
    padding: 14,
  },

  pipelineHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  pipelineTitleCol: {
    flex: 1,
  },

  pipelineTitle: {
    ...tokens.type.bodyStrong,
    fontSize: 17,
    color: tokens.color.ink,
  },

  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },

  pipelineOrg: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    flexShrink: 1,
  },

  pipelineStageWrap: {
    alignItems: "flex-end",
    gap: 7,
  },

  valueBrace: {
    ...tokens.type.bodyStrong,
    fontSize: 14,
  },

  pipelineFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
  },

  serviceChip: {
    backgroundColor: tokens.color.surfaceMuted,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  serviceText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkMuted,
  },

  detailTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 18,
    paddingBottom: 14,
  },

  detailBarTitle: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
  },

  detailBarSpacer: {
    width: 40,
  },

  detailBanner: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: tokens.color.border,
    padding: 20,
    marginBottom: 12,
    ...tokens.shadow.card,
  },

  detailBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  detailId: {
    ...tokens.type.micro,
    letterSpacing: 0.6,
    color: tokens.color.inkFaint,
  },

  detailTitle: {
    ...tokens.type.h2,
    color: tokens.color.ink,
    marginTop: 14,
  },

  detailOrgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },

  detailOrg: {
    ...tokens.type.body,
    color: tokens.color.inkMuted,
  },

  detailAmount: {
    ...tokens.type.h1,
    color: tokens.color.ink,
    marginTop: 16,
  },

  cancelText: {
    ...tokens.type.caption,
    fontWeight: "600",
    color: tokens.color.brand,
  },

  transitionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },

  transitionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },

  transitionPillPressed: {
    opacity: 0.7,
  },

  transitionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  transitionPillText: {
    ...tokens.type.caption,
    fontWeight: "700",
  },

  transferTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },

  transferTargetText: {
    ...tokens.type.h3,
    color: tokens.color.ink,
  },

  formField: {
    marginBottom: 14,
  },

  formLabel: {
    ...tokens.type.caption,
    fontWeight: "600",
    color: tokens.color.inkMuted,
    marginBottom: 7,
  },

  formInput: {
    minHeight: 46,
    backgroundColor: tokens.color.surfacePressed,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: 14,
    ...tokens.type.body,
    color: tokens.color.ink,
  },

  hintText: {
    ...tokens.type.micro,
    color: tokens.color.inkFaint,
    marginTop: -6,
    marginBottom: 12,
  },

  noteInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: 6,
    marginBottom: 12,
    ...tokens.shadow.hairline,
  },

  noteInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...tokens.type.body,
    color: tokens.color.ink,
  },

  noteSend: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },

  noteCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 14,
    marginBottom: 10,
  },

  noteBody: {
    ...tokens.type.body,
    color: tokens.color.ink,
  },

  noteMeta: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkFaint,
    marginTop: 8,
  },

  noNotes: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginBottom: 8,
  },

  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },

  historyItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },

  historyDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },

  historyTextCol: {
    flex: 1,
  },

  historyTitle: {
    ...tokens.type.bodyStrong,
    fontSize: 14,
    color: tokens.color.ink,
  },

  historyReason: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 2,
    lineHeight: 17,
  },

  historyDate: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkFaint,
  },

  formCard: {
    padding: 16,
    marginBottom: 16,
  },

  formCardTitle: {
    ...tokens.type.h3,
    color: tokens.color.ink,
    marginBottom: 14,
  },

  formError: {
    ...tokens.type.caption,
    color: tokens.color.danger,
  },

  formBusy: {
    alignSelf: "center",
    marginVertical: 18,
  },

  sourceRow: {
    marginTop: 5,
  },

  sourceText: {
    ...tokens.type.micro,
    fontWeight: "600",
    letterSpacing: 0,
    color: tokens.color.inkFaint,
  },

  pipelineRagRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  owePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.dangerSoft,
  },

  owePillText: {
    ...tokens.type.micro,
    fontWeight: "700",
    letterSpacing: 0,
    color: tokens.color.danger,
  },

  breachCard: {
    borderColor: tokens.color.danger,
    borderWidth: 1,
    marginBottom: 12,
  },

  breachHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },

  breachTitle: {
    ...tokens.type.h3,
  },

  breachBody: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    lineHeight: 19,
    marginBottom: 14,
  },

  breachActions: {
    alignItems: "center",
    marginTop: 12,
  },

  deadlineClear: {
    alignItems: "center",
    marginTop: 12,
  },

  clearDeadlineText: {
    ...tokens.type.caption,
    fontWeight: "600",
    color: tokens.color.inkMuted,
  },

  missingCard: {
    borderColor: tokens.color.warning,
    borderWidth: 1,
    marginBottom: 12,
  },

  missingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },

  missingTitle: {
    ...tokens.type.h3,
    color: tokens.color.ink,
  },

  missingBody: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    lineHeight: 19,
    marginBottom: 12,
  },

  missingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 7,
  },

  missingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
  },

  missingItem: {
    ...tokens.type.caption,
    flex: 1,
    color: tokens.color.ink,
  },

  recoverHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: tokens.color.surfaceMuted,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 12,
  },

  recoverHintText: {
    ...tokens.type.caption,
    flex: 1,
    color: tokens.color.inkMuted,
    lineHeight: 18,
  },

  stageSegmented: {
    marginBottom: 16,
  },

  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },

  amountRow: {
    flexDirection: "row",
    gap: 10,
  },

  amountFlex: {
    flex: 1,
  },

  reassignBusy: {
    alignSelf: "center",
    marginVertical: 18,
  },

  reassignNote: {
    marginTop: 4,
  },
});