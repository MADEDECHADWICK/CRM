// packages/app/src/components/OrgFormSheet.tsx
//
// Edit an organization's own record — most importantly its address, which
// BR-020 requires before a deal can become a proposal but which had no way to
// be entered. Mirrors ContactFormSheet so the two forms behave identically.

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

import { type Organization, tokens } from "@crm/core";

import { Button, TextField } from "@crm/ui";

import { apiFetch } from "../api";
import { Alert } from "../lib/dialogs";

type FormState = {
  name: string;
  industry: string;
  country: string;
  email: string;
  phone: string;
  address: string;
  website: string;
};

type OrgFormSheetProps = {
  visible: boolean;
  token: string;
  organization: Organization;
  onClose: () => void;
  onSaved: () => void;
};

export function OrgFormSheet({
  visible,
  token,
  organization,
  onClose,
  onSaved,
}: OrgFormSheetProps) {
  const [form, setForm] = useState<FormState>({
    name: "",
    industry: "",
    country: "",
    email: "",
    phone: "",
    address: "",
    website: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;

    setForm({
      name: organization.name ?? "",
      industry: organization.industry ?? "",
      country: organization.country ?? "",
      email: organization.email ?? "",
      phone: organization.phone ?? "",
      address: organization.address ?? "",
      website: organization.website ?? "",
    });
  }, [visible, organization]);

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function save() {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Enter the organization's name.");
      return;
    }

    try {
      setSaving(true);

      // Empty strings are sent as null so the server clears the field rather
      // than storing a blank one.
      await apiFetch(`/organizations/${organization.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name.trim(),
          industry: form.industry.trim() || null,
          country: form.country.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          website: form.website.trim() || null,
        }),
      });

      onSaved();
      onClose();
    } catch (error) {
      Alert.alert(
        "Unable to save client",
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
            <Text style={styles.sheetTitle}>Edit client</Text>
            <Text style={styles.sheetSubtitle}>{organization.name}</Text>
            {organization.clientNumber ? (
              <Text style={styles.clientNumber}>Client no. {organization.clientNumber}</Text>
            ) : null}

            <TextField
              label="Organization name"
              value={form.name}
              onChangeText={(value) => patch({ name: value })}
              placeholder="ABC Retail Ltd"
              autoCapitalize="words"
            />

            <TextField
              label="Industry"
              value={form.industry}
              onChangeText={(value) => patch({ industry: value })}
              placeholder="Retail"
            />

            <TextField
              label="Country"
              value={form.country}
              onChangeText={(value) => patch({ country: value })}
              placeholder="Kenya"
              autoCapitalize="words"
            />

            <TextField
              label="Switchboard email"
              value={form.email}
              onChangeText={(value) => patch({ email: value })}
              placeholder="info@client.co.ke"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextField
              label="Switchboard phone"
              value={form.phone}
              onChangeText={(value) => patch({ phone: value })}
              placeholder="+254 700 000 000"
              keyboardType="phone-pad"
            />

            <TextField
              label="Address"
              value={form.address}
              onChangeText={(value) => patch({ address: value })}
              placeholder="Street, town"
            />

            <TextField
              label="Website"
              value={form.website}
              onChangeText={(value) => patch({ website: value })}
              placeholder="https://client.co.ke"
              autoCapitalize="none"
              autoCorrect={false}
            />

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
                  <Button title="Save changes" onPress={save} />
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

  clientNumber: {
    ...tokens.type.micro,
    letterSpacing: 0.5,
    color: tokens.color.brand,
    marginTop: -12,
    marginBottom: 16,
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
