import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({
  label,
  error,
  style,
  ...props
}: TextFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <TextInput
        {...props}
        style={[styles.input, error ? styles.inputError : undefined, style]}
        placeholderTextColor="#94A3B8"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 7,
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#0F172A",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  error: {
    marginTop: 5,
    fontSize: 12,
    color: "#DC2626",
  },
});