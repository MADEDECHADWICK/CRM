import { fromInputDateValue, toInputDateValue } from "./dateUtils";
import type { DateTimeInputProps } from "./DateTimeInput.types";

/**
 * The browser half of the date picker.
 *
 * react-native-web renders the React Native tree to real DOM, so a native
 * <input type="date"> can sit directly inside a <View> and inherits the
 * browser's own date UI — which is both better on a desktop and impossible to
 * reproduce with a hand-rolled RN calendar.
 *
 * The chosen day is run through toNoonUTC, exactly as the native path does, so
 * the Date that reaches the API is identical whichever device picked it. That
 * is the whole point of the shim: same field, same value, same instant.
 */
export function DateTimeInput({
  value,
  minimumDate,
  maximumDate,
  onValueChange,
  onDismiss,
}: DateTimeInputProps) {
  return (
    <input
      type="date"
      // Attribute names survive minification, which makes this a cheap way to
      // confirm from the built bundle that the browser shim really was
      // substituted and the native picker really was left out.
      data-crm-date-input="web"
      value={toInputDateValue(value)}
      min={minimumDate ? toInputDateValue(minimumDate) : undefined}
      max={maximumDate ? toInputDateValue(maximumDate) : undefined}
      onChange={(event) => {
        const next = fromInputDateValue(event.currentTarget.value);

        onValueChange(undefined, next ?? undefined);

        // The native picker collapses itself once a date lands; this one is a
        // single control that stays open, but callers still close their wrapper
        // on this event, so the callback has to fire either way.
        onDismiss?.();
      }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        minHeight: 44,
        padding: "8px 10px",
        fontSize: 15,
        color: "#1b1b1f",
        backgroundColor: "#ffffff",
        border: "1px solid #d8d8de",
        borderRadius: 8,
        fontFamily: "inherit",
      }}
    />
  );
}