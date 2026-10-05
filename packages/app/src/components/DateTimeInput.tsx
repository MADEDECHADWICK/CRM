import DateTimePicker from "@react-native-community/datetimepicker";

import type { DateTimeInputProps } from "./DateTimeInput.types";

/**
 * The native date picker, wrapped only to normalise the callback signature.
 *
 * @react-native-community/datetimepicker supports android and ios but not the
 * browser (Expo's own reference lists its platforms as android/ios only), so
 * DateTimeInput.web.tsx provides the browser half. Every call site imports this
 * name unchanged, which is what keeps the three screens that pick dates free of
 * any platform branching.
 */
export function DateTimeInput({
  onValueChange,
  onDismiss,
  ...rest
}: DateTimeInputProps) {
  return (
    <DateTimePicker
      {...rest}
      onValueChange={(event, date) => onValueChange(event, date ?? undefined)}
      onDismiss={onDismiss}
    />
  );
}