// apps/mobile/src/components/ContactFormSheet.tsx
//
// The add/edit contact form, shared by the Contacts screen and the inline
// client detail on Prospects. Bottom sheet with keyboard avoidance so the
// keyboard never covers the save button on iOS.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  type Contact,
  type Organization,
  tokens,
} from "@crm/core";

import { Button, Icon, IconSet, TextField } from "@crm/ui";

import { apiFetch } from "../api";
import { Alert } from "../lib/dialogs";

type FormState = {
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  notes: string;
  isPrimary: boolean;
};

const emptyForm: FormState = {
  name: "",
  title: "",
  department: "",
  email: "",
  phone: "",
  notes: "",
  isPrimary: false,
};

type ContactFormSheetProps = {
  visible: boolean;
  token: string;
  /** Existing contact to edit, or null to create a new one. */
  contact?: Contact | null;
  /** Client the new contact belongs to. Fixed when editing. */
  organization: Organization;
  onClose: () => void;
  onSaved: () => void;
};

export function ContactFormSheet({
  visible,
  token,
  contact,
  organization,
  onClose,
  onSaved,
}: ContactFormSheetProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Reset each time the sheet opens so a previous edit never leaks into a
  // new "add contact" flow.
  useEffect(() => {
    if (!visible) return;

    setForm(
      contact
        ? {
            name: contact.name,
            title: contact.title ?? "",
            department: contact.department ?? "",
            email: contact.email ?? "",
            phone: contact.phone ?? "",
            notes: contact.notes ?? "",
            isPrimary: contact.isPrimary,
          }
        : emptyForm
    );
  }, [visible, contact]);

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function save() {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Enter the contact person's name.");
      return;
    }

    if (!form.email.trim() && !form.phone.trim()) {
      Alert.alert(
        "Add a way to reach them",
        "Enter at least an email or a phone number."
      );
      return;
    }

    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || undefined,
      department: form.department.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      notes: form.notes.trim() || undefined,
      isPrimary: form.isPrimary,
      organizationId: organization.id,
    };

    try {
      setSaving(true);

      if (contact) {
        await apiFetch(`/contacts/${contact.id}`, token, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/contacts", token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      onSaved();
      onClose();
    } catch (error) {
      Alert.alert(
        "Unable to save contact",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.tapAway} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Text style={styles.sheetTitle}>
              {contact ? "Edit contact" : "New contact"}
            </Text>
            <Text style={styles.sheetSubtitle} numberOfLines={1}>
              {organization.name}
            </Text>

            <TextField
              label="Full name"
              value={form.name}
              onChangeText={(value) => patch({ name: value })}
              placeholder="Jane Mwangi"
              autoCapitalize="words"
            />

            <TextField
              label="Job title"
              value={form.title}
              onChangeText={(value) => patch({ title: value })}
              placeholder="Head of Finance"
            />

            <TextField
              label="Department"
              value={form.department}
              onChangeText={(value) => patch({ department: value })}
              placeholder="Finance"
            />

            <TextField
              label="Email"
              value={form.email}
              onChangeText={(value) => patch({ email: value })}
              placeholder="jane@client.co.ke"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextField
              label="Phone"
              value={form.phone}
              onChangeText={(value) => patch({ phone: value })}
              placeholder="+254 700 000 000"
              keyboardType="phone-pad"
            />

            <TextField
              label="Notes"
              value={form.notes}
              onChangeText={(value) => patch({ notes: value })}
              placeholder="Prefers WhatsApp"
              multiline
            />

            <Pressable
              style={styles.checkRow}
              onPress={() => patch({ isPrimary: !form.isPrimary })}
            >
              <View
                style={[
                  styles.checkbox,
                  form.isPrimary ? styles.checkboxOn : undefined,
                ]}
              >
                {form.isPrimary ? (
                  <Icon
                    name={IconSet.Check}
                    size={13}
                    color={tokens.color.white}
                  />
                ) : null}
              </View>

              <View style={styles.checkTextCol}>
                <Text style={styles.checkLabel}>Primary contact</Text>
                <Text style={styles.checkHint}>
                  The person you reach out to first at this client.
                </Text>
              </View>
            </Pressable>

            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button title="Cancel" onPress={onClose} variant="secondary" />
              </View>

              <View style={styles.flex}>
                {saving ? (
                  <View style={styles.savingRow}>
                    <ActivityIndicator color={tokens.color.brand} />
                  </View>
                ) : (
                  <Button
                    title={contact ? "Save changes" : "Add contact"}
                    onPress={save}
                  />
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },

  tapAway: {
    ...StyleSheet.absoluteFill,
  },

  sheet: {
    backgroundColor: tokens.color.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    ...tokens.shadow.floated,
  },

  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.border,
    marginTop: 10,
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  sheetTitle: {
    ...tokens.type.h3,
    color: tokens.color.ink,
  },

  sheetSubtitle: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 2,
    marginBottom: 18,
  },

  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 16,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: tokens.color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },

  checkboxOn: {
    backgroundColor: tokens.color.brand,
    borderColor: tokens.color.brand,
  },

  checkTextCol: {
    flex: 1,
  },

  checkLabel: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
  },

  checkHint: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginTop: 2,
  },

  actions: {
    flexDirection: "row",
    gap: 10,
  },

  savingRow: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },

  flex: {
    flex: 1,
  },
});
