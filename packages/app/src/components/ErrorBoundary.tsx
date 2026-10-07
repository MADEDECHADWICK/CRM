import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";
import { Button } from "@crm/ui";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Catches render-time errors anywhere below it so a single bad screen can't
 * blank the whole app to a white page. There was no boundary before this, so
 * any uncaught render error took the entire UI down with no recovery.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Logged, not surfaced: the user gets a plain recovery screen, the
    // details stay in the console for whoever is debugging.
    console.error("Unhandled UI error:", error);
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          This screen failed to load. You can try again — your data is safe.
        </Text>
        <View style={styles.action}>
          <Button title="Try again" onPress={this.reset} />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: tokens.color.canvas,
  },
  title: {
    ...tokens.type.h3,
    color: tokens.color.ink,
    marginBottom: 8,
  },
  body: {
    ...tokens.type.body,
    color: tokens.color.inkMuted,
    textAlign: "center",
    marginBottom: 20,
    maxWidth: 320,
  },
  action: {
    minWidth: 160,
  },
});
