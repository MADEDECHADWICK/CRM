import { SheetCloseButton } from "./SheetCloseButton";
import { useSheetLayout } from "./useSheetLayout";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { tokens, type UserLite, type DepartmentDetail } from "@crm/core";
import { Button, Chip, Icon, IconSet, Segmented, TextField } from "@crm/ui";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api";

export function MemberEditSheet({ member, departments = [], onClose, onSaved }: {
  member?: UserLite; departments?: DepartmentDetail[]; onClose: () => void; onSaved?: () => void;
}) {
  const sheetLayout = useSheetLayout();
  const { token, updateProfile } = useAuth();
  const self = !member;
  const [initial, setInitial] = useState<UserLite | null>(member ?? null);
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<"PARTNER" | "MANAGER">(member?.role === "MANAGER" ? "MANAGER" : "PARTNER");
  const [departmentId, setDepartmentId] = useState(member?.departmentId ?? null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!self || !token) return;
    let active = true;
    apiFetch<UserLite>("/users/me", token).then(user => {
      if (!active) return;
      setInitial(user); setName(user.name); setEmail(user.email);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [self, token]);
  function close() { if (!busy.current) onClose(); }
  const identityChanged = email.trim().toLowerCase() !== initial?.email.toLowerCase();
  const changed = initial && (name.trim() !== initial.name || identityChanged || !!newPassword || (!self && (role !== initial.role || departmentId !== (initial.departmentId ?? null))));
  async function save() {
    if (!token || !initial || busy.current) return;
    if (!name.trim() || !email.trim()) { setError("Enter a name and email address."); return; }
    if (self && newPassword && (newPassword.length < 8 || newPassword !== confirmPassword)) { setError("Use at least 8 characters and make both new passwords match."); return; }
    if (self && (identityChanged || newPassword) && !currentPassword) { setError("Enter your current password to change your email or password."); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const updated = await apiFetch<UserLite>(self ? "/users/me" : `/users/${initial.id}`, token, {
        method: "PATCH", body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(),
          ...(self ? { ...(currentPassword ? { currentPassword } : {}), ...(newPassword ? { newPassword } : {}) } : { role, departmentId }),
        }),
      });
      updateProfile(updated); onSaved?.(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save changes."); }
    finally { busy.current = false; setSaving(false); }
  }
  const eye = <Pressable onPress={() => setVisible(v => !v)} accessibilityRole="button" accessibilityLabel={visible ? "Hide passwords" : "Show passwords"} style={{ padding: 8 }}><Icon name={visible ? IconSet.EyeOff : IconSet.Eye} size={20} color={tokens.color.inkMuted} /></Pressable>;
  return <Modal visible transparent animationType="slide" onRequestClose={close}>
    <View style={[styles.backdrop, sheetLayout.backdrop]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close profile editor" />
      <View style={[styles.sheet, sheetLayout.surface]}>
          <SheetCloseButton onClose={close} disabled={saving} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.title}>{self ? "My profile" : "Edit team member"}</Text>
        {!initial ? <ActivityIndicator color={tokens.color.brand} /> : <>
          <TextField label="Full name" value={name} onChangeText={setName} editable={!saving} autoCapitalize="words" />
          <TextField label="Work email" value={email} onChangeText={setEmail} editable={!saving} autoCapitalize="none" keyboardType="email-address" />
          {self ? <>
            <Text style={styles.note}>{initial.role === "MARKETING_BD" ? "Marketing & BD" : initial.role === "PARTNER" ? "Partner" : "Manager"} · {initial.department?.name ?? "No primary department"}</Text>
            {!!initial.headedDepartments?.length && <Text style={styles.note}>Heads: {initial.headedDepartments.map(d => d.name).join(", ")}</Text>}
            <Text style={styles.note}>Your administrator manages roles and department assignments.</Text>
            <TextField label="New password (optional)" value={newPassword} onChangeText={setNewPassword} editable={!saving} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" right={eye} />
            {!!newPassword && <TextField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} editable={!saving} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" />}
            {(identityChanged || !!newPassword) && <TextField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} editable={!saving} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" right={eye} />}
          </> : <>
            <Text style={styles.note}>Role</Text>
            <Segmented value={role} onChange={v => { if (!saving) setRole(v); }} options={[{ key: "PARTNER", label: "Partner" }, { key: "MANAGER", label: "Manager" }]} />
            <Text style={styles.note}>Primary department</Text>
            <View style={styles.chips}>
              <Chip label="No department" selected={departmentId === null} disabled={saving} onPress={() => setDepartmentId(null)} />
              {departments.map(d => <Chip key={d.id} label={d.name} selected={departmentId === d.id} disabled={saving} onPress={() => setDepartmentId(d.id)} />)}
            </View>
            <Text style={styles.note}>Partners can head several departments. Appoint them in Team → Departments; changing primary membership keeps those appointments.</Text>
          </>}
        </>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.actions}><Button title="Cancel" variant="secondary" onPress={close} disabled={saving} /><Button title="Save changes" onPress={save} loading={saving} disabled={!changed || saving} /></View>
      </ScrollView></View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { width: "100%", maxWidth: 640, alignSelf: "center", maxHeight: "90%", backgroundColor: tokens.color.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  content: { padding: 24, paddingBottom: 36, gap: 12 },
  title: { ...tokens.type.h2, color: tokens.color.ink, marginBottom: 12 },
  note: { ...tokens.type.caption, color: tokens.color.inkMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 12, marginTop: 12 },
  error: { ...tokens.type.caption, color: tokens.color.danger },
});
