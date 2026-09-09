import { View } from "react-native";
import { Badge } from "@crm/ui";

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Badge stage="PROPOSAL" />
    </View>
  );
}