import { SheetCloseButton } from "./SheetCloseButton";
import { useSheetLayout } from "./useSheetLayout";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { tokens, type Organization } from "@crm/core";
import { Button } from "@crm/ui";
import { apiFetch } from "../api";
import { TeamAssigneePicker } from "./TeamAssigneePicker";
import { DepartmentAssigneePicker } from "./DepartmentAssigneePicker";
import { useAuth } from "../auth/AuthContext";

export function AccountAssignmentSheet({ token, organization, kind = "prospect", onClose, onSaved }: {
  token: string; organization: Organization; kind?: "prospect" | "client"; onClose: () => void; onSaved: () => void;
}) {
  const sheetLayout = useSheetLayout();
  const { user } = useAuth();
  const [selected, setSelected] = useState(organization.assignedToId ?? null);
  const [departmentId, setDepartmentId] = useState(organization.assignedDepartmentId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const changed = selected !== (organization.assignedToId ?? null) || departmentId !== (organization.assignedDepartmentId ?? null);
  async function save() {
    if (!changed || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/organizations/${organization.id}/assignment`, token, { method: "PATCH", body: JSON.stringify({ assignedToId: selected, assignedDepartmentId: departmentId }) });
      onSaved();
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save assignment."); }
    finally { submitting.current = false; setSaving(false); }
  }
  function close() { if (!submitting.current) onClose(); }
  return <Modal visible transparent animationType="slide" onRequestClose={close}>
    <View style={[styles.backdrop, sheetLayout.backdrop]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close assignment" />
      <View style={[styles.sheet, sheetLayout.surface]}>
          <SheetCloseButton onClose={close} disabled={saving} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.title}>{kind === "client" ? "Assign client" : "Assign prospect"}</Text>
          <Text style={styles.subtitle}>{organization.name}</Text>
          <TeamAssigneePicker token={token} value={selected} onChange={setSelected} disabled={saving} includeAdministrators={kind === "prospect"} currentUserId={user?.id} allowUnassigned={user?.role === "MARKETING_BD"} />
          <DepartmentAssigneePicker token={token} value={departmentId} onChange={setDepartmentId} disabled={saving} />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.actions}><Button title="Cancel" onPress={close} disabled={saving} variant="secondary" /><Button title="Save assignment" onPress={save} loading={saving} disabled={!changed || saving} /></View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  sheet: { width: "100%", maxWidth: 640, alignSelf: "center", maxHeight: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: tokens.color.canvas },
  content: { padding: 24, paddingBottom: 36 },
  title: { ...tokens.type.h2, color: tokens.color.ink },
  subtitle: { ...tokens.type.body, color: tokens.color.inkMuted, marginTop: 6, marginBottom: 24 },
  error: { ...tokens.type.caption, color: tokens.color.danger, marginBottom: 16 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-end" },
});
