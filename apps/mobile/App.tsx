import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";

import { AppNavigator, AuthProvider, ErrorBoundary, setApiUrl } from "@crm/app";

import { API_URL } from "./src/lib/api";

// Configured once, at import, before the first render. The shared client in
// @crm/app resolves this per request, so no screen can point somewhere else.
setApiUrl(API_URL);

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AuthProvider>
          <ErrorBoundary>
            <AppNavigator />
          </ErrorBoundary>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});