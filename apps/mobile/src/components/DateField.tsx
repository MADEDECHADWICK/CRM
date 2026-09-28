// apps/mobile/src/components/DateField.tsx
//
// A tappable date input backed by the native picker, used everywhere the app
// needs a date. Two behaviours are deliberate and should not be "simplified":
//
//  1. iOS renders `display="compact"` — a calendar grid — rather than a
//     spinner wheel. A spinner's onValueChange streams continuously while
//     scrolling, so closing the picker on change would dismiss it the moment
//     the user starts flicking. A grid reports once, on an actual tap, which
//     is what makes auto-close safe.
//
//  2. `toNoonUTC` anchors the chosen day to noon UTC. The picker returns
//     local midnight; in a positive UTC offset (Kenya is UTC+3) that
//     serialises to the *previous* day in UTC and quietly saves a follow-up
//     a day early. Noon UTC keeps the calendar day intact either way.

import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { tokens } from "@crm/core";
import { Icon, IconSet } from "@crm/ui";

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

export function toNoonUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
  );
}

type DateFieldProps = {
  label?: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  hint?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  formatDate?: (date: Date) => string;
};

export function DateField({
  label,
  value,
  onChange,
  placeholder = "Choose a date…",
  hint,
  minimumDate,
  maximumDate,
  formatDate,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);

  const display = (date: Date) =>
    formatDate
      ? formatDate(date)
      : date.toLocaleDateString("en-KE", DEFAULT_FORMAT);

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        onPress={() => setOpen((current) => !current)}
        style={styles.field}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
      >
        {value ? (
          <Text style={styles.value}>{display(value)}</Text>
        ) : (
          <Text style={styles.placeholder}>{placeholder}</Text>
        )}

        <Icon name={IconSet.Calendar} size={18} color={tokens.color.inkFaint} />
      </Pressable>

      {open ? (
        <View style={styles.pickerWrap}>
          {Platform.OS === "ios" ? (
            <Pressable
              onPress={() => setOpen(false)}
              style={styles.doneRow}
              hitSlop={8}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}

          <DateTimePicker
            value={value ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "compact" : "default"}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onValueChange={(_event, date) => {
              if (date) onChange(date);
              // Collapse as soon as a date lands — matches the way the
              // native Android dialog dismisses itself.
              setOpen(false);
            }}
            onDismiss={() => setOpen(false)}
          />
        </View>
      ) : null}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginBottom: 6,
  },

  field: {
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

  value: {
    ...tokens.type.body,
    color: tokens.color.ink,
  },

  placeholder: {
    ...tokens.type.body,
    color: tokens.color.inkFaint,
  },

  pickerWrap: {
    marginBottom: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: 12,
    ...tokens.shadow.hairline,
  },

  doneRow: {
    alignSelf: "flex-end",
    marginBottom: 6,
  },

  doneText: {
    ...tokens.type.caption,
    fontWeight: "700",
    color: tokens.color.brand,
  },

  hint: {
    ...tokens.type.caption,
    color: tokens.color.inkFaint,
    marginTop: -4,
    marginBottom: 10,
  },
});
