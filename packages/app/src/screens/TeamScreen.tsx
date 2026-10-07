import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  formatAmount,
  type BreakdownRow,
  type DepartmentDetail,
  type ReportPeriod,
  type ReportingBreakdown,
  type Role,
  type StaffUser,
  type UserLite,
  REPORT_PERIOD_LABELS,
  REPORT_PERIODS,
  isOwnerEligible,
  tokens,
} from "@crm/core";

import {
  AppHeader,
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconSet,
  Screen,
  Section,
  Segmented,
  TextField,
} from "@crm/ui";

import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api";

const ROLE_LABELS: Record<Role, string> = {
  MARKETING_BD: "Marketing & BD",
  PARTNER: "Partner",
  MANAGER: "Manager",
};

const STAFF_PERIODS = REPORT_PERIODS.filter((period) => period !== "custom");

type DimKey = "members" | "departments";

const DIM_FOR_API: Record<DimKey, "owner" | "department"> = {
  members: "owner",
  departments: "department",
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

function fmtRange(breakdown: ReportingBreakdown | null): string | null {
  if (!breakdown?.periodFrom || !breakdown?.periodTo) return null;

  const from = new Date(breakdown.periodFrom);
  const to = new Date(breakdown.periodTo);

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

export function TeamScreen() {
  const { token } = useAuth();

  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [dimKey, setDimKey] = useState<DimKey>("members");
  const [breakdown, setBreakdown] = useState<ReportingBreakdown | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showDeptForm, setShowDeptForm] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;

    const dimension = DIM_FOR_API[dimKey];

    try {
      setError(null);
      const [breakdownData, userData, departmentData] = await Promise.all([
        apiFetch<ReportingBreakdown>(
          `/reporting/breakdown?dimension=${dimension}&period=${period}`,
          token
        ),
        apiFetch<UserLite[]>("/users", token),
        apiFetch<DepartmentDetail[]>("/departments", token),
      ]);

      setBreakdown(breakdownData);
      // isOwnerEligible is the same predicate the API validates an owner with,
      // so this list can never offer somebody the server would then refuse.
      setStaff(userData.filter(isOwnerEligible));
      setDepartments(departmentData);
    } catch (err) {
      console.error("Team loading error:", err);
      setError(err instanceof Error ? err.message : "Unable to load team view");
    } finally {
      setLoading(false);
    }
  }, [token, dimKey, period]);

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

  function switchLoad(key: DimKey) {
    setLoading(true);
    setDimKey(key);
  }

  const reloadAfterChange = useCallback(async () => {
    await load();
  }, [load]);

  const rows = useMemo(() => breakdown?.rows ?? [], [breakdown]);
  const rangeText = fmtRange(breakdown);
  const periodCaption =
    period === "all"
      ? "Every recorded deal, grouped by stage."
      : `Deals that entered their current stage ${REPORT_PERIOD_LABELS[
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
          title="Team"
          subtitle="Members, departments and firm-wide performance"
        />

        <Segmented
          value={period}
          onChange={(key) => {
            setLoading(true);
            setPeriod(key);
          }}
          options={STAFF_PERIODS.map((key) => ({
            key,
            label: REPORT_PERIOD_LABELS[key],
          }))}
        />

        <View style={styles.modeWrap}>
          <Segmented<DimKey>
            value={dimKey}
            onChange={switchLoad}
            options={[
              { key: "members", label: "Members" },
              { key: "departments", label: "Departments" },
            ]}
          />
        </View>

        {breakdown && rangeText ? (
          <Text style={styles.rangeCaption}>
            {rangeText} · {periodCaption}
          </Text>
        ) : breakdown ? (
          <Text style={styles.rangeCaption}>{periodCaption}</Text>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={tokens.color.brand} />
            <Text style={styles.loadingText}>Building the scoreboard…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <EmptyState
              icon={IconSet.Warning}
              title="Unable to load team view"
              subtitle={error}
            />
          </View>
        ) : (
          <>
            {breakdown ? (
              <TeamTotals breakdown={breakdown} />
            ) : null}

            {dimKey === "members" ? (
              <>
                <Section
                  title="Members"
                  action={
                    <Pressable
                      onPress={() => {
                        setShowMemberForm((open) => !open);
                        setShowDeptForm(false);
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.actionText}>
                        {showMemberForm ? "Close" : "+ Add member"}
                      </Text>
                    </Pressable>
                  }
                />

                {showMemberForm ? (
                  <AddMemberCard
                    departments={departments}
                    onSaved={() => {
                      setShowMemberForm(false);
                      reloadAfterChange();
                    }}
                  />
                ) : null}

                {rows.length === 0 ? (
                  <EmptyState
                    icon={IconSet.People}
                    title="No members yet"
                    subtitle="Add Partners and Managers to staff your service lines."
                  />
                ) : (
                  rows.map((row) => {
                    const user =
                      staff.find((member) => member.id === row.id) ?? null;
                    // Naming the department somebody runs, not just belongs to.
                    // Membership and command are separate facts, and a reader
                    // scanning this list needs to know which is which — an
                    // unstated "Head of Tax" is the fact the whole ownership
                    // model rests on.
                    const headsName =
                      user?.headsDepartmentId != null
                        ? (departments.find(
                            (dept) => dept.id === user.headsDepartmentId
                          )?.name ?? null)
                        : null;
                    return (
                      <MemberCard
                        key={row.id}
                        name={row.name}
                        subtitle={user ? ROLE_LABELS[user.role] : null}
                        departmentName={
                          row.subtitle ?? user?.department?.name ?? null
                        }
                        headsDepartmentName={headsName}
                        departments={departments}
                        row={row}
                        onChanged={reloadAfterChange}
                      />
                    );
                  })
                )}
              </>
            ) : (
              <>
                <Section
                  title="Departments"
                  action={
                    <Pressable
                      onPress={() => {
                        setShowDeptForm((open) => !open);
                        setShowMemberForm(false);
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.actionText}>
                        {showDeptForm ? "Close" : "+ New department"}
                      </Text>
                    </Pressable>
                  }
                />

                {showDeptForm ? (
                  <AddDepartmentCard
                    onSaved={() => {
                      setShowDeptForm(false);
                      reloadAfterChange();
                    }}
                  />
                ) : null}

                {departments.length === 0 ? (
                  <EmptyState
                    icon={IconSet.Building}
                    title="No departments yet"
                    subtitle="Create departments for each service line."
                  />
                ) : (
                  <>
                    {/* Driven by `departments`, not by the reporting rows.

                        The breakdown only contains departments that have
                        recorded activity, so listing from `rows` meant a newly
                        created department had no card at all — and that card is
                        the only place to appoint its head. A department with no
                        deals is exactly the one that most needs setting up, so
                        it must not be the one that is missing. */}
                    {departments.map((department) => {
                      const row =
                        rows.find((entry) => entry.id === department.id) ??
                        undefined;
                      return (
                        <DepartmentCard
                          key={department.id}
                          department={department}
                          members={staff}
                          row={row}
                          onChanged={reloadAfterChange}
                        />
                      );
                    })}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

type StageStatProps = {
  label: string;
  count: number;
  value: number;
  color: string;
  soft: string;
};

function StageStat({ label, count, value, color, soft }: StageStatProps) {
  return (
    <View style={[styles.statItem, { backgroundColor: soft }]}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statValue}>{formatAmount(value)}</Text>
    </View>
  );
}

function TeamTotals({ breakdown }: { breakdown: ReportingBreakdown }) {
  const { totals } = breakdown;

  return (
    <>
      <Section title="Firm totals" />

      <View style={styles.metricRow}>
        <View style={styles.metricItem}>
          <StageStat
            label="Won"
            count={totals.wonCount}
            value={totals.wonValue}
            color={tokens.color.success}
            soft={tokens.color.successSoft}
          />
        </View>
        <View style={styles.metricItem}>
          <StageStat
            // Count must match the value shown next to it, and that value
            // covers proposals *and* ones awaiting feedback — so count both.
            label="Active prop."
            count={
              totals.counts.PROPOSAL + totals.counts.AWAITING_FEEDBACK
            }
            value={totals.activeProposalValue}
            color={tokens.color.warning}
            soft={tokens.color.warningSoft}
          />
        </View>
        <View style={styles.metricItem}>
          <StageStat
            label="Lost"
            count={totals.lostCount}
            value={totals.lostValue}
            color={tokens.color.danger}
            soft={tokens.color.dangerSoft}
          />
        </View>
      </View>
    </>
  );
}

type BreakdownCardProps = {
  row: NonNullable<ReportingBreakdown["rows"][number]>;
};

function BreakdownBody({ row }: BreakdownCardProps) {
  return (
    <View style={styles.pipelineRow}>
      <View style={styles.pipelineStat}>
        <Text style={styles.pipelineStatLabel}>Leads</Text>
        <Text style={styles.pipelineStatCount}>{row.counts.LEAD}</Text>
      </View>

      <View style={styles.pipelineStat}>
        <Text style={styles.pipelineStatLabel}>Proposals</Text>
        <Text style={styles.pipelineStatCount}>{row.counts.PROPOSAL}</Text>
      </View>

      <View style={styles.pipelineStat}>
        <Text style={styles.pipelineStatLabel}>Awaiting</Text>
        <Text style={styles.pipelineStatCount}>
          {row.counts.AWAITING_FEEDBACK}
        </Text>
      </View>

      <View style={styles.pipelineStat}>
        <Text style={styles.pipelineStatLabel}>Deferred</Text>
        <Text style={styles.pipelineStatCount}>{row.counts.DEFERRED}</Text>
      </View>

      <View style={styles.pipelineStat}>
        <Text style={styles.pipelineStatLabel}>Clients</Text>
        <Text style={styles.pipelineStatCount}>{row.wonCount}</Text>
      </View>
    </View>
  );
}

type MemberCardProps = {
  name: string;
  subtitle: string | null;
  departmentName: string | null;
  /** Set when this member runs a department, as opposed to joining one. */
  headsDepartmentName: string | null;
  departments: DepartmentDetail[];
  row: NonNullable<ReportingBreakdown["rows"][number]>;
  onChanged: () => void;
};

function MemberCard({
  name,
  subtitle,
  departmentName,
  headsDepartmentName,
  departments,
  row,
  onChanged,
}: MemberCardProps) {
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const roleLine = subtitle ?? "Staff member";
  const deptLine = departmentName ?? "No department";

  async function reassign(departmentId: string | null) {
    if (!token) return;

    try {
      setBusy(true);
      await apiFetch(`/users/${row.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ departmentId }),
      });
      onChanged();
    } catch (error) {
      Alert.alert(
        "Unable to move member",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.memberCard}>
      <Pressable
        onPress={() => setExpanded((open) => !open)}
        style={styles.memberHeader}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>

        <View style={styles.memberTextCol}>
          <Text style={styles.memberName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.memberMeta} numberOfLines={1}>
            {roleLine} · {deptLine}
          </Text>
          {headsDepartmentName ? (
            <Text style={styles.headBadge} numberOfLines={1}>
              Head of {headsDepartmentName}
            </Text>
          ) : null}
        </View>

        <Icon
          name={expanded ? IconSet.ChevronUp : IconSet.ChevronDown}
          size={16}
          color={tokens.color.inkFaint}
        />
      </Pressable>

      <BreakdownBody row={row} />

      <View style={styles.valueRow}>
        <Text style={styles.valueText}>
          Won {formatAmount(row.wonValue)}
        </Text>
        <Text style={styles.valueText}>
          Lost {formatAmount(row.lostValue)}
        </Text>
        <Text style={styles.valueText}>
          Active prop. {formatAmount(row.activeProposalValue)}
        </Text>
      </View>

      {expanded ? (
        <View style={styles.expandArea}>
          <Text style={styles.expandLabel}>Move to department</Text>
          <View style={styles.chipWrap}>
            <Chip
              label="Unassigned"
              selected={!departmentName || departmentName === "No department"}
              onPress={() => {
                if (!busy) reassign(null);
              }}
            />

            {departments.map((dept) => (
              <Chip
                key={dept.id}
                label={dept.name}
                selected={departmentName === dept.name}
                onPress={() => {
                  if (!busy) reassign(dept.id);
                }}
              />
            ))}
          </View>
          {busy ? (
            <ActivityIndicator
              color={tokens.color.brand}
              style={styles.busy}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

type DepartmentCardProps = {
  department: DepartmentDetail;
  members: StaffUser[];
  /**
   * The department's reporting row, absent when it has recorded no activity.
   * Optional rather than defaulted to zeros because a fabricated row of zeros
   * and a genuinely inactive department look identical on screen, and only one
   * of them is true.
   */
  row: BreakdownRow | undefined;
  onChanged: () => void;
};

function DepartmentCard({
  department,
  members,
  row,
  onChanged,
}: DepartmentCardProps) {
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const headId = department.headId ?? null;
  const headName = department.head?.name ?? null;

  // Only members of this department can lead it. The server refuses anybody
  // else, so offering them here would produce a picker that looks reasonable
  // and then fails — the worst of both.
  const candidates = members.filter(
    (member) => member.departmentId === department.id
  );

  // A person can lead only one department, so somebody already heading another
  // one is shown struck through rather than hidden. Removing them would make
  // the constraint invisible, and "why isn't Grace an option?" is the question
  // this picker exists to answer.
  const runsElsewhere = (member: StaffUser) =>
    member.headsDepartmentId !== null &&
    member.headsDepartmentId !== undefined &&
    member.headsDepartmentId !== department.id;

  async function appoint(nextHeadId: string | null) {
    if (!token || nextHeadId === headId) return;

    try {
      setBusy(true);
      await apiFetch(`/departments/${department.id}/head`, token, {
        method: "PATCH",
        body: JSON.stringify({ headId: nextHeadId }),
      });
      onChanged();
    } catch (error) {
      Alert.alert(
        "Unable to change head",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const memberLabel = `${department.memberCount} ${
    department.memberCount === 1 ? "member" : "members"
  }`;

  return (
    <Card style={styles.memberCard}>
      <Pressable
        onPress={() => setExpanded((open) => !open)}
        style={styles.memberHeader}
      >
        <View style={[styles.avatar, styles.deptAvatar]}>
          <Icon name={IconSet.Building} size={20} color={tokens.color.brand} />
        </View>

        <View style={styles.memberTextCol}>
          <Text style={styles.memberName} numberOfLines={1}>
            {department.name}
          </Text>
          {/* Naming the head on the collapsed card is the point of the whole
              model: "who runs this?" should be answerable without expanding
              anything, and a department with nobody appointed should say so
              plainly rather than just omitting it. */}
          <Text style={styles.memberMeta} numberOfLines={1}>
            {headName
              ? `${memberLabel} · Headed by ${headName}`
              : `${memberLabel} · No head`}
          </Text>
        </View>

        <Icon
          name={expanded ? IconSet.ChevronUp : IconSet.ChevronDown}
          size={16}
          color={tokens.color.inkFaint}
        />
      </Pressable>

      {row ? <BreakdownBody row={row} /> : null}

      {expanded ? (
        <View style={styles.expandArea}>
          <Text style={styles.expandLabel}>Department head</Text>
          <Text style={styles.memberMeta}>
            The head owns every new deal raised here by default, so Marketing
            does not have to pick an owner each time. Naming somebody else is
            still allowed, with a reason.
          </Text>

          <View style={styles.chipWrap}>
            <Chip
              label="No head"
              selected={headId === null}
              onPress={() => appoint(null)}
            />

            {candidates.map((member) => (
              <Chip
                key={member.id}
                label={
                  runsElsewhere(member)
                    ? `${member.name} — runs another`
                    : member.name
                }
                selected={headId === member.id}
                disabled={runsElsewhere(member)}
                onPress={() => appoint(member.id)}
              />
            ))}
          </View>

          {candidates.length === 0 ? (
            <Text style={styles.emptyHint}>
              No Partners or Managers in this department yet — add members to
              it first.
            </Text>
          ) : null}

          {busy ? (
            <ActivityIndicator
              color={tokens.color.brand}
              style={styles.busy}
            />
          ) : null}

          {row ? (
            <>
              <Text style={styles.expandLabel}>Snapshot</Text>
              <Text style={styles.memberMeta}>
                Clients won {row.wonCount} · Won {formatAmount(row.wonValue)} ·
                Active proposals {formatAmount(row.activeProposalValue)} · Lost{" "}
                {formatAmount(row.lostValue)}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

type AddMemberCardProps = {
  departments: DepartmentDetail[];
  onSaved: () => void;
};

function AddMemberCard({ departments, onSaved }: AddMemberCardProps) {
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"PARTNER" | "MANAGER">("PARTNER");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!token) return;

    if (!name.trim() || !email.trim()) {
      Alert.alert("Missing details", "Enter a name and email address.");
      return;
    }

    if (password.trim().length < 8) {
      Alert.alert(
        "Password required",
        "Set an initial password of at least 8 characters."
      );
      return;
    }

    try {
      setBusy(true);
      await apiFetch("/users", token, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          password: password.trim(),
          ...(departmentId ? { departmentId } : {}),
        }),
      });
      onSaved();
    } catch (error) {
      Alert.alert(
        "Unable to add member",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.formCard}>
      <TextField
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Grace Wanjiku"
        autoCapitalize="words"
      />

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="name@firm.co.ke"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextField
        label="Initial password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Text style={styles.formHint}>
        Set an initial password of at least 8 characters, then tell the new
        member which one you chose.
      </Text>

      <Text style={styles.fieldLabel}>Role</Text>
      <View style={styles.formSegmented}>
        <Segmented<"PARTNER" | "MANAGER">
          value={role}
          onChange={setRole}
          options={[
            { key: "PARTNER", label: "Partner" },
            { key: "MANAGER", label: "Manager" },
          ]}
        />
      </View>

      <Text style={styles.fieldLabel}>Department (optional)</Text>
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
        {departments.length === 0 ? (
          <Text style={styles.emptyHint}>
            Create a department first, or leave unassigned.
          </Text>
        ) : null}
      </View>

      <Button
        title="Add member"
        onPress={submit}
        loading={busy}
        icon={IconSet.Add}
      />
    </Card>
  );
}

type AddDepartmentCardProps = {
  onSaved: () => void;
};

function AddDepartmentCard({ onSaved }: AddDepartmentCardProps) {
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!token) return;

    if (!name.trim()) {
      Alert.alert("Missing details", "Enter a department name.");
      return;
    }

    try {
      setBusy(true);
      await apiFetch("/departments", token, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      onSaved();
    } catch (error) {
      Alert.alert(
        "Unable to create department",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.formCard}>
      <TextField
        label="Department name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Tax Advisory"
      />

      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="What this service line covers"
      />

      <Button
        title="Create department"
        onPress={submit}
        loading={busy}
        icon={IconSet.Add}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: 40,
    alignItems: "center",
  },

  loadingText: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 12,
  },

  modeWrap: {
    marginTop: 10,
  },

  rangeCaption: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 8,
    marginBottom: 12,
  },

  actionText: {
    ...tokens.type.caption,
    fontWeight: "700",
    color: tokens.color.brand,
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

  statItem: {
    borderRadius: 12,
    padding: 12,
    gap: 2,
  },

  statLabel: {
    ...tokens.type.micro,
    letterSpacing: 0,
    fontWeight: "700",
  },

  statCount: {
    ...tokens.type.h3,
    color: tokens.color.ink,
    fontWeight: "800",
  },

  statValue: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  memberCard: {
    padding: 14,
  },

  memberHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  deptAvatar: {
    backgroundColor: tokens.color.infoSoft,
  },

  avatarText: {
    ...tokens.type.bodyStrong,
    fontWeight: "800",
    color: tokens.color.brand,
  },

  memberTextCol: {
    flex: 1,
    gap: 3,
  },

  memberName: {
    ...tokens.type.bodyStrong,
    fontSize: 17,
    color: tokens.color.ink,
  },

  memberMeta: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  headBadge: {
    ...tokens.type.caption,
    fontWeight: "700",
    color: tokens.color.brand,
  },

  pipelineRow: {
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },

  pipelineStat: {
    flex: 1,
    gap: 2,
  },

  pipelineStatLabel: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkFaint,
  },

  pipelineStatCount: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
  },

  valueRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },

  valueText: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  expandArea: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: 8,
  },

  expandLabel: {
    ...tokens.type.micro,
    letterSpacing: 0,
    textTransform: "uppercase",
    color: tokens.color.inkFaint,
  },

  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  busy: {
    alignSelf: "flex-start",
    marginTop: 4,
  },

  emptyHint: {
    ...tokens.type.caption,
    color: tokens.color.inkFaint,
  },

  formCard: {
    padding: 16,
    marginBottom: 16,
  },

  fieldLabel: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginBottom: 6,
    marginTop: 4,
  },

  formHint: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: -6,
    marginBottom: 16,
  },

  formHintStrong: {
    ...tokens.type.caption,
    fontWeight: "700",
    color: tokens.color.ink,
  },

  formSegmented: {
    marginBottom: 16,
  },
});