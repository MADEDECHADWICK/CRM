// packages/ui/src/SearchBar.tsx
//
// A rounded search field with a magnifier glyph and a one-tap clear.

import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { tokens } from "@crm/core";

import { Icon, IconSet } from "./icons";

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search",
  autoFocus = false,
}: SearchBarProps) {
  return (
    <View style={styles.wrap}>
      <Icon
        name={IconSet.Search}
        size={18}
        color={tokens.color.inkFaint}
      />

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.inkFaint}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={8}
          accessibilityLabel="Clear search"
        >
          <Icon
            name={IconSet.Close}
            size={18}
            color={tokens.color.inkFaint}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    minHeight: 46,
    ...tokens.shadow.hairline,
  },

  input: {
    flex: 1,
    ...tokens.type.body,
    color: tokens.color.ink,
    paddingVertical: 0,
  },
});