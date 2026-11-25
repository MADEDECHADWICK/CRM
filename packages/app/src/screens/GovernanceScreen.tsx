import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  PROPOSAL_STATUS_LABELS,
  canConfigureSystem,
  tokens,
  type Organization,
  type ProposalStatus,
  type Role,
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
import { Alert } from "../lib/dialogs";
import { OrganizationPicker } from "../components/OrganizationPicker";

type Tab = "proposals" | "prequalifications" | "configuration";

type OpportunityRow = {
  id: string;
  title: string;
  stage: string;
  outcome: string;
  organization?: { name: string } | null;
};

type ChecklistItem = {
  id: string;
  code: string;
  label: string;
  required: boolean;
  requiresReview: boolean;
  status: string;
  responsibleRole?: string | null;
};

type ApprovalRow = {
  id: string;
  kind: string;
  status: string;
  invalidatedAt?: string | null;
  comment?: string | null;
};

type Revision = {
  id: string;
  revisionNumber: number;
  status: ProposalStatus;
  checklistItems: ChecklistItem[];
  approvals: ApprovalRow[];
  submissions: { id: string; submittedAt: string; channel: string; isFirstSubmission: boolean }[];
  approvalInvalidationReason?: string | null;
  workflowStage: string;
  technicalCompletedAt?: string | null;
  bdReviewedAt?: string | null;
  partnerSignedAt?: string | null;
  returnReason?: string | null;
  technicalCompletedBy?: { id: string; name: string } | null;
  bdReviewedBy?: { id: string; name: string } | null;
  partnerSignedBy?: { id: string; name: string } | null;
};

type Proposal = {
  id: string;
  title: string;
  currentRevisionNumber: number;
  technicalOwnerId?: string | null;
  bdOwnerId?: string | null;
  technicalOwner?: { id: string; name: string; role: string } | null;
  bdOwner?: { id: string; name: string; role: string } | null;
  opportunity?: { signingPartner?: { id: string; name: string } | null } | null;
  revisions: Revision[];
};

type StaffUser = { id: string; name: string; role: Role; isActive?: boolean };

const WORKFLOW_LABELS: Record<string, string> = {
  TECHNICAL_PREPARATION: "Team lead preparing technical work",
  BD_QUALITY_REVIEW: "BD quality review",
  RETURNED_TO_TECHNICAL: "Returned to team lead",
  PARTNER_SIGNOFF: "Awaiting Partner sign-off",
  APPROVED_FOR_SUBMISSION: "Partner approved - ready to send",
  SUBMITTED: "Submitted",
};

type ChecklistResponsibility = "TEAM_LEAD" | "BD" | "PARTNER";

function checklistResponsibility(item: ChecklistItem): ChecklistResponsibility {
  const role = (item as ChecklistItem & { responsibleRole?: string | null }).responsibleRole;
  if (role === "TEAM_LEAD" || role === "BD" || role === "PARTNER") return role;
  return role === "PARTNER" || item.code.startsWith("F") ? "PARTNER" : "BD";
}

type Prequalification = {
  id: string;
  service: string;
  status: string;
  currency: string;
  cost?: string | number | null;
  expiryAt?: string | null;
  organization?: { name: string } | null;
  owner?: { name: string } | null;
};

type Setting = {
  key: string;
  value: unknown;
  category?: string | null;
  source: "database" | "fallback";
};

export function GovernanceScreen() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("proposals");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [assignmentProposalId, setAssignmentProposalId] = useState<string | null>(null);
  const [assignTechnicalId, setAssignTechnicalId] = useState<string | null>(null);
  const [assignBdId, setAssignBdId] = useState<string | null>(null);
  const [assignPartnerId, setAssignPartnerId] = useState<string | null>(null);
  const [workflowComment, setWorkflowComment] = useState("");
  const [submissionChannel, setSubmissionChannel] = useState("Email");
  const [prequalifications, setPrequalifications] = useState<Prequalification[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [prequalificationOrganization, setPrequalificationOrganization] = useState<Organization | null>(null);
  const [newService, setNewService] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "proposals") {
        const data = await apiFetch<{ items: OpportunityRow[] }>("/opportunities?paginated=true&proposalReached=true&limit=100", token);
        setOpportunities(data.items);
        if (!selectedOpportunityId && data.items[0]) setSelectedOpportunityId(data.items[0].id);
      } else if (tab === "prequalifications") {
        setPrequalifications(await apiFetch<Prequalification[]>("/prequalifications", token));
      } else {
        setSettings(await apiFetch<Setting[]>("/governance/settings", token));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [tab, token, selectedOpportunityId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    apiFetch<StaffUser[]>("/users", token)
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [token]);

  const loadProposals = useCallback(async (opportunityId: string) => {
    if (!token) return;
    try {
      setProposals(await apiFetch<Proposal[]>(`/opportunities/${opportunityId}/proposals`, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load proposals.");
    }
  }, [token]);

  useEffect(() => {
    if (selectedOpportunityId) void loadProposals(selectedOpportunityId);
  }, [selectedOpportunityId, loadProposals]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      Alert.alert("Action failed", message);
    }
  };

  const createProposal = () => {
    if (!token || !selectedOpportunityId) return;
    void run(async () => {
      await apiFetch(`/opportunities/${selectedOpportunityId}/proposals`, token, { method: "POST", body: JSON.stringify({}) });
      await loadProposals(selectedOpportunityId);
    });
  };

  const createRevision = (proposalId: string) => {
    if (!token) return;
    void run(async () => {
      await apiFetch(`/proposals/${proposalId}/revisions`, token, { method: "POST", body: JSON.stringify({}) });
      if (selectedOpportunityId) await loadProposals(selectedOpportunityId);
    });
  };

  const setChecklistStatus = (revision: Revision, item: ChecklistItem) => {
    if (!token) return;
    const checked = ["COMPLETE", "REVIEWED", "NOT_APPLICABLE"].includes(item.status);
    const status = checked ? "PENDING" : "COMPLETE";
    void run(async () => {
      await apiFetch(`/proposal-revisions/${revision.id}/checklist/${item.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (selectedOpportunityId) await loadProposals(selectedOpportunityId);
    });
  };

  const assignTeam = (proposal: Proposal) => {
    if (!token) return;
    void run(async () => {
      await apiFetch(`/proposals/${proposal.id}/assignment`, token, {
        method: "PATCH",
        body: JSON.stringify({
          technicalOwnerId: assignTechnicalId,
          bdOwnerId: assignBdId,
          ...(assignPartnerId ? { signingPartnerId: assignPartnerId } : {}),
        }),
      });
      setAssignmentProposalId(null);
      setWorkflowComment("");
      if (selectedOpportunityId) await loadProposals(selectedOpportunityId);
    });
  };

  const revisionAction = (revision: Revision, path: string, body: Record<string, unknown> = {}) => {
    if (!token) return;
    void run(async () => {
      await apiFetch(`/proposal-revisions/${revision.id}/${path}`, token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setWorkflowComment("");
      if (selectedOpportunityId) await loadProposals(selectedOpportunityId);
    });
  };

  const submitRevision = (revision: Revision) => {
    if (!token) return;
    void run(async () => {
      await apiFetch(`/proposal-revisions/${revision.id}/submit`, token, {
        method: "POST",
        body: JSON.stringify({ channel: submissionChannel || "Email" }),
      });
      if (selectedOpportunityId) await loadProposals(selectedOpportunityId);
    });
  };

  const createPrequalification = () => {
    if (!token || !prequalificationOrganization || !newService.trim()) return;
    void run(async () => {
      await apiFetch("/prequalifications", token, {
        method: "POST",
        body: JSON.stringify({ organizationId: prequalificationOrganization.id, service: newService.trim(), status: "DRAFT" }),
      });
      setPrequalificationOrganization(null);
      setNewService("");
      await load();
    });
  };

  const saveSetting = () => {
    if (!token || !editingKey) return;
    void run(async () => {
      let value: unknown = editingValue;
      try { value = JSON.parse(editingValue); } catch { /* plain string is valid */ }
      await apiFetch(`/governance/settings/${encodeURIComponent(editingKey)}`, token, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      setEditingKey(null);
      setEditingValue("");
      await load();
    });
  };

  const selected = opportunities.find((o) => o.id === selectedOpportunityId) ?? null;
  const configurator = !!user && canConfigureSystem(user.role, user.isAdmin);
  useEffect(() => {
    if (!configurator && tab === "configuration") setTab("proposals");
  }, [configurator, tab]);
  const isPartner = user?.role === "PARTNER";
  const canAssignTeam = !!user && (isPartner || user.role === "MARKETING_BD" || user.isAdmin);
  const teamLeads = staff.filter((person) => person.role === "MANAGER");
  const bdOwners = staff.filter((person) => ["MARKETING_BD", "PROPOSAL_COORDINATOR"].includes(person.role));
  const signingPartners = staff.filter((person) => person.role === "PARTNER");

  return (
    <Screen>
      <AppHeader
        title="Proposal governance"
        subtitle={configurator ? "Checklists, approvals, prequalifications and configuration" : "Checklists, approvals and prequalifications"}
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { key: "proposals", label: "Proposals" },
          { key: "prequalifications", label: "Prequalifications" },
          ...(configurator ? [{ key: "configuration" as const, label: "Configuration" }] : []),
        ]}
      />
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !opportunities.length && !prequalifications.length && !settings.length ? <ActivityIndicator color={tokens.color.brand} /> : null}

        {tab === "proposals" ? (
          <>
            <Section title="Opportunity" />
            <Card>
              {opportunities.length === 0 ? <EmptyState icon={IconSet.People} title="No accessible opportunities" /> : opportunities.map((opp) => (
                <Pressable
                  key={opp.id}
                  onPress={() => setSelectedOpportunityId(opp.id)}
                  style={[styles.row, selectedOpportunityId === opp.id && styles.rowActive]}
                >
                  <Text style={styles.rowTitle}>{opp.title}</Text>
                  <Text style={styles.rowMeta}>{opp.organization?.name ?? ""}  -  {opp.outcome}  -  {opp.stage}</Text>
                </Pressable>
              ))}
            </Card>

            {selected ? (
              <>
                <Section
                  title={`Proposals for ${selected.title}`}
                  action={<Button title="New proposal" size="sm" onPress={createProposal} />}
                />
                {proposals.length === 0 ? <Card><EmptyState icon={IconSet.Doc} title="No proposal record yet" subtitle="Create a proposal, then add a revision." /></Card> : proposals.map((proposal) => (
                  <Card key={proposal.id}>
                    <View style={styles.between}>
                      <Text style={styles.proposalTitle}>{proposal.title}</Text>
                      <Button title="New revision" size="sm" variant="secondary" onPress={() => createRevision(proposal.id)} />
                    </View>
                    <Text style={styles.rowMeta}>
                      Team lead: {proposal.technicalOwner?.name ?? "not assigned"} - BD owner: {proposal.bdOwner?.name ?? "not assigned"}
                    </Text>
                    {canAssignTeam ? (
                      <View style={styles.actions}>
                        <Button
                          title={proposal.technicalOwner && proposal.bdOwner ? "Change team" : "Assign team"}
                          size="sm"
                          variant="secondary"
                          onPress={() => {
                            setAssignmentProposalId(proposal.id);
                            setAssignTechnicalId(proposal.technicalOwnerId ?? null);
                            setAssignBdId(proposal.bdOwnerId ?? null);
                            setAssignPartnerId(null);
                          }}
                        />
                      </View>
                    ) : null}
                    {assignmentProposalId === proposal.id ? (
                      <View style={styles.assignmentPanel}>
                        <Text style={styles.label}>Team lead (Manager)</Text>
                        <View style={styles.chipWrap}>
                          {teamLeads.map((person) => (
                            <Chip key={person.id} label={person.name} selected={assignTechnicalId === person.id} onPress={() => setAssignTechnicalId(person.id)} />
                          ))}
                        </View>
                        <Text style={styles.label}>BD owner</Text>
                        <View style={styles.chipWrap}>
                          {bdOwners.map((person) => (
                            <Chip key={person.id} label={person.name} selected={assignBdId === person.id} onPress={() => setAssignBdId(person.id)} />
                          ))}
                        </View>
                        <Text style={styles.label}>Signing Partner</Text>
                        <View style={styles.chipWrap}>
                          {signingPartners.map((person) => (
                            <Chip key={person.id} label={person.name} selected={assignPartnerId === person.id} onPress={() => setAssignPartnerId(person.id)} />
                          ))}
                        </View>
                        <View style={styles.actions}>
                          <Button title="Save team" size="sm" onPress={() => assignTeam(proposal)} disabled={!assignTechnicalId || !assignBdId} />
                          <Button title="Cancel" size="sm" variant="ghost" onPress={() => setAssignmentProposalId(null)} />
                        </View>
                      </View>
                    ) : null}
                    {proposal.revisions.length === 0 ? <Text style={styles.rowMeta}>No revisions yet.</Text> : proposal.revisions.slice(0, 3).map((revision) => (
                      <View key={revision.id} style={styles.revision}>
                        <Text style={styles.revisionTitle}>Revision {revision.revisionNumber} - {PROPOSAL_STATUS_LABELS[revision.status]}</Text>
                        <Text style={styles.rowMeta}>{WORKFLOW_LABELS[revision.workflowStage] ?? revision.workflowStage}</Text>
                        {revision.returnReason ? <Text style={styles.warning}>Returned: {revision.returnReason}</Text> : null}
                        {revision.approvalInvalidationReason ? <Text style={styles.warning}>{revision.approvalInvalidationReason}</Text> : null}

                        <Text style={styles.label}>Checklist</Text>
                        {revision.checklistItems.length === 0 ? <Text style={styles.rowMeta}>No checklist configured for this revision.</Text> : ([
                          {
                            key: "TEAM_LEAD" as const,
                            title: "Team Lead - Technical Proposal Review",
                            owner: proposal.technicalOwner?.name,
                            canToggle:
                              user?.id === proposal.technicalOwnerId &&
                              ["TECHNICAL_PREPARATION", "RETURNED_TO_TECHNICAL"].includes(revision.workflowStage),
                          },
                          {
                            key: "BD" as const,
                            title: "Business Development - Proposal Review and Submission",
                            owner: proposal.bdOwner?.name,
                            canToggle: user?.id === proposal.bdOwnerId && revision.workflowStage === "BD_QUALITY_REVIEW",
                          },
                          {
                            key: "PARTNER" as const,
                            title: "Partner - Final Review and Approval",
                            owner: proposal.opportunity?.signingPartner?.name,
                            canToggle: isPartner && revision.workflowStage === "PARTNER_SIGNOFF",
                          },
                        ]).map((group) => {
                          const items = revision.checklistItems.filter((item) => checklistResponsibility(item) === group.key);
                          if (!items.length) return null;
                          const completed = items.filter((item) => ["COMPLETE", "REVIEWED", "NOT_APPLICABLE"].includes(item.status)).length;
                          return (
                            <View key={group.key} style={styles.checklistSection}>
                              <Text style={styles.checklistHeading}>
                                {group.title}
                                {group.owner ? ` · ${group.owner}` : ""}
                              </Text>
                              <Text style={styles.rowMeta}>{completed} of {items.length} complete</Text>
                              {items.map((item) => (
                                <Pressable
                                  key={item.id}
                                  onPress={() => { if (group.canToggle) setChecklistStatus(revision, item); }}
                                  disabled={!group.canToggle}
                                  style={[styles.checkRow, !group.canToggle && { opacity: 0.72 }]}
                                >
                                  <View style={[styles.checkbox, ["COMPLETE", "REVIEWED", "NOT_APPLICABLE"].includes(item.status) && styles.checkboxChecked]}>
                                    {["COMPLETE", "REVIEWED", "NOT_APPLICABLE"].includes(item.status) ? (
                                      <Icon name={IconSet.Check} size={13} color="#ffffff" />
                                    ) : null}
                                  </View>
                                  <View style={styles.flex}>
                                    <Text style={styles.rowTitle}>{item.label}</Text>
                                  </View>
                                </Pressable>
                              ))}
                            </View>
                          );
                        })}

                        <Text style={styles.label}>Workflow history</Text>
                        {revision.technicalCompletedBy ? <Text style={styles.rowMeta}>Technical work confirmed by {revision.technicalCompletedBy.name}{revision.technicalCompletedAt ? ` on ${new Date(revision.technicalCompletedAt).toLocaleString()}` : ""}</Text> : null}
                        {revision.bdReviewedBy ? <Text style={styles.rowMeta}>Quality review completed by {revision.bdReviewedBy.name}{revision.bdReviewedAt ? ` on ${new Date(revision.bdReviewedAt).toLocaleString()}` : ""}</Text> : null}
                        {revision.partnerSignedBy ? <Text style={styles.rowMeta}>Partner sign-off by {revision.partnerSignedBy.name}{revision.partnerSignedAt ? ` on ${new Date(revision.partnerSignedAt).toLocaleString()}` : ""}</Text> : null}

                        <Text style={styles.label}>Approvals</Text>
                        {revision.approvals.length === 0 ? <Text style={styles.rowMeta}>No approvals recorded.</Text> : revision.approvals.map((approval) => (
                          <Text key={approval.id} style={styles.rowMeta}>{approval.kind} - {approval.status}{approval.invalidatedAt ? " - invalidated" : ""}</Text>
                        ))}

                        {revision.submissions.length ? (
                          <Text style={styles.success}>Submitted {new Date(revision.submissions[0].submittedAt).toLocaleString()} via {revision.submissions[0].channel}</Text>
                        ) : (
                          <>
                            {!proposal.technicalOwnerId || !proposal.bdOwnerId ? (
                              <Text style={styles.warning}>Assign the team lead and BD owner before the workflow can start.</Text>
                            ) : null}

                            {["TECHNICAL_PREPARATION", "RETURNED_TO_TECHNICAL"].includes(revision.workflowStage) && user?.id === proposal.technicalOwnerId ? (
                              <View style={styles.actions}>
                                <Button title="Confirm technical work complete" size="sm" onPress={() => revisionAction(revision, "technical-complete", { comment: workflowComment })} />
                              </View>
                            ) : null}

                            {revision.workflowStage === "BD_QUALITY_REVIEW" && user?.id === proposal.bdOwnerId ? (
                              <>
                                <TextField label="Quality review comment" value={workflowComment} onChangeText={setWorkflowComment} multiline />
                                <View style={styles.actions}>
                                  <Button title="Send to Partner" size="sm" onPress={() => revisionAction(revision, "bd-review", { decision: "SEND_TO_PARTNER", comment: workflowComment })} />
                                  <Button title="Return to team lead" size="sm" variant="secondary" onPress={() => revisionAction(revision, "bd-review", { decision: "RETURN_TO_TECHNICAL", comment: workflowComment })} />
                                </View>
                              </>
                            ) : null}

                            {revision.workflowStage === "PARTNER_SIGNOFF" && isPartner ? (
                              <>
                                <TextField label="Partner comment" value={workflowComment} onChangeText={setWorkflowComment} multiline />
                                <View style={styles.actions}>
                                  <Button title="Approve for submission" size="sm" onPress={() => revisionAction(revision, "partner-signoff", { decision: "APPROVE", comment: workflowComment })} />
                                  <Button title="Return to BD" size="sm" variant="secondary" onPress={() => revisionAction(revision, "partner-signoff", { decision: "RETURN_TO_BD", comment: workflowComment })} />
                                  <Button title="Return to team lead" size="sm" variant="ghost" onPress={() => revisionAction(revision, "partner-signoff", { decision: "RETURN_TO_TECHNICAL", comment: workflowComment })} />
                                </View>
                              </>
                            ) : null}

                            {revision.workflowStage === "APPROVED_FOR_SUBMISSION" ? (
                              <View style={styles.submitRow}>
                                <TextField
                                  label="Submission channel"
                                  value={submissionChannel}
                                  onChangeText={setSubmissionChannel}
                                  containerStyle={styles.flex}
                                />
                                <Button title="Record dispatch" size="sm" variant="success" onPress={() => submitRevision(revision)} />
                              </View>
                            ) : null}

                            {revision.workflowStage === "PARTNER_SIGNOFF" && !isPartner ? <Text style={styles.rowMeta}>Waiting for the signing Partner.</Text> : null}
                            {revision.workflowStage === "BD_QUALITY_REVIEW" && user?.id !== proposal.bdOwnerId ? <Text style={styles.rowMeta}>Waiting for the BD owner's quality review.</Text> : null}
                            {["TECHNICAL_PREPARATION", "RETURNED_TO_TECHNICAL"].includes(revision.workflowStage) && user?.id !== proposal.technicalOwnerId ? <Text style={styles.rowMeta}>Waiting for the team lead.</Text> : null}
                          </>
                        )}
                      </View>
                    ))}
                  </Card>
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {tab === "prequalifications" ? (
          <>
            <Section title="Applications" />
            <Card>
              <OrganizationPicker
                token={token ?? ""}
                selected={prequalificationOrganization}
                onSelect={setPrequalificationOrganization}
                view="prospects"
              />
              <TextField label="Service" value={newService} onChangeText={setNewService} />
              <Button title="Add draft application" onPress={createPrequalification} disabled={!prequalificationOrganization || !newService.trim()} />
              <Text style={styles.rowMeta}>Panel acceptance is recorded separately and never becomes a win or revenue.</Text>
            </Card>
            {prequalifications.length === 0 ? <Card><EmptyState icon={IconSet.Doc} title="No prequalification applications" /></Card> : prequalifications.map((row) => (
              <Card key={row.id}>
                <Text style={styles.proposalTitle}>{row.organization?.name ?? "Unknown client"}  -  {row.service}</Text>
                <Text style={styles.rowMeta}>{row.status}  -  owner {row.owner?.name ?? "unassigned"}  -  expires {row.expiryAt ? new Date(row.expiryAt).toLocaleDateString() : "not recorded"}</Text>
              </Card>
            ))}
          </>
        ) : null}

        {tab === "configuration" ? (
          <>
            <Section title="Configurable controls" />
            <Text style={styles.rowMeta}>
              These values are stored in the database. Governance and IT administrators can change them without a code deployment. The one-business-hour acknowledgement target is a proposed default, not a confirmed Ronalds policy.
            </Text>
            {settings.map((setting) => (
              <Card key={setting.key}>
                <Text style={styles.rowTitle}>{setting.key}</Text>
                <Text style={styles.rowMeta}>{setting.category ?? "Uncategorised"}  -  {setting.source}</Text>
                {editingKey === setting.key ? (
                  <>
                    <TextField label="Value (JSON or text)" value={editingValue} onChangeText={setEditingValue} multiline />
                    <View style={styles.actions}>
                      <Button title="Save" size="sm" onPress={saveSetting} disabled={!configurator} />
                      <Button title="Cancel" size="sm" variant="ghost" onPress={() => setEditingKey(null)} />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.code}>{JSON.stringify(setting.value)}</Text>
                    {configurator ? (
                      <Button title="Edit" size="sm" variant="secondary" onPress={() => { setEditingKey(setting.key); setEditingValue(JSON.stringify(setting.value)); }} />
                    ) : null}
                  </>
                )}
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40, gap: 12 },
  error: { color: tokens.color.danger, fontSize: 13 },
  warning: { color: tokens.color.warning, fontSize: 12, marginTop: 4 },
  success: { color: tokens.color.success, fontSize: 13, marginTop: 8 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  rowActive: { backgroundColor: tokens.color.brandFaint, borderRadius: 8, paddingHorizontal: 8 },
  rowTitle: { fontSize: 14, fontWeight: "600", color: tokens.color.ink },
  rowMeta: { fontSize: 12, color: tokens.color.inkMuted, marginTop: 2 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  proposalTitle: { fontSize: 15, fontWeight: "700", color: tokens.color.brand },
  revision: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: tokens.color.border },
  revisionTitle: { fontSize: 13, fontWeight: "700", color: tokens.color.ink },
  label: { fontSize: 12, fontWeight: "700", color: tokens.color.inkMuted, marginTop: 12, marginBottom: 4 },
  checklistSection: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: tokens.color.border },
  checklistHeading: { fontSize: 12, fontWeight: "800", color: tokens.color.brand, marginBottom: 2 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: tokens.color.borderStrong,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: tokens.color.success,
    backgroundColor: tokens.color.success,
  },
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  assignmentPanel: { marginTop: 10, padding: 12, borderRadius: 8, backgroundColor: tokens.color.surfaceMuted },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  submitRow: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: 10 },
  code: { fontFamily: "monospace", fontSize: 12, color: tokens.color.inkMuted, marginTop: 6, marginBottom: 8 },
});

