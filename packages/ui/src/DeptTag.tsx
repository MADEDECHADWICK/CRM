import { StyleSheet, Text, View } from "react-native";

type DeptTagProps = {
  name: string;
};

export function DeptTag({ name }: DeptTagProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },

  text: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4b5563",
  },
});