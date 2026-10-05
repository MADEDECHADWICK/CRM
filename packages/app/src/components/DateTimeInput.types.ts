/**
 * The prop shape every call site of the date picker uses.
 *
 * This lives in its own file rather than alongside the native implementation
 * because Metro resolves `./DateTimeInput` to `DateTimeInput.web.tsx` when
 * bundling for the browser. A shared type re-exported from the native module
 * would therefore have the web module importing itself, and the bundler would
 * loop.
 */
export type DateTimeInputProps = {
  value: Date;
  mode?: "date" | "time";
  display?: "default" | "compact" | "spinner" | "calendar" | "clock";
  minimumDate?: Date;
  maximumDate?: Date;
  onValueChange: (event: unknown, date?: Date) => void;
  onDismiss?: () => void;
};