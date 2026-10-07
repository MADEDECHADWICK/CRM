import { StyleSheet, View } from "react-native";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";

import { AppNavigator, AuthProvider, ErrorBoundary, setApiUrl } from "@crm/app";

import { API_URL } from "./src/apiUrl";

// Same shared shell the phone runs, mounted by this app. The only thing that
// differs is the base URL above and the browser-specific implementations Metro
// substitutes for the handful of components the web platform cannot run.
setApiUrl(API_URL);

export default function App() {
  return (
    <View style={styles.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AuthProvider>
          <ErrorBoundary>
            <AppNavigator />
          </ErrorBoundary>
        </AuthProvider>
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});