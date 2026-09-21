import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createApiClient,
  type Organization,
  tokens,
} from "@crm/core";

import {
  AppHeader,
  Card,
  EmptyState,
  Icon,
  IconSet,
  Screen,
  SearchBar,
} from "@crm/ui";

import { useAuth } from "../auth/AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const apiFetch = createApiClient(API_URL);

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ProspectsScreen() {
  const { token } = useAuth();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;

    const data = await apiFetch<Organization[]>("/organizations", token);
    setOrganizations(data);
  }, [token]);

  useEffect(() => {
    load()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();

    if (!lower) return organizations;

    return organizations.filter(
      (organization) =>
        organization.name.toLowerCase().includes(lower) ||
        (organization.industry ?? "").toLowerCase().includes(lower) ||
        (organization.email ?? "").toLowerCase().includes(lower)
    );
  }, [organizations, query]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={tokens.color.brand}
          />
        }
      >
        <AppHeader
          title="Prospects"
          subtitle={`${organizations.length} organisations on file`}
        />

        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search prospects"
          />
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon={IconSet.People}
            title={
              organizations.length === 0
                ? "No prospects yet"
                : "Nothing matches"
            }
            subtitle={
              organizations.length === 0
                ? "Organisations you engage become prospects here."
                : "Try a different name, industry or email."
            }
          />
        ) : (
          filtered.map((organization) => (
            <Card key={organization.id} style={styles.orgCard}>
              <View style={styles.orgHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {initials(organization.name)}
                  </Text>
                </View>

                <View style={styles.orgTextCol}>
                  <Text style={styles.orgName} numberOfLines={1}>
                    {organization.name}
                  </Text>

                  {organization.industry ? (
                    <View style={styles.industryChip}>
                      <Text style={styles.industryText}>
                        {organization.industry}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Icon
                  name={IconSet.ChevronRight}
                  size={16}
                  color={tokens.color.inkFaint}
                />
              </View>

              {(organization.email || organization.phone) ? (
                <View style={styles.contactRows}>
                  {organization.email ? (
                    <View style={styles.contactRow}>
                      <Icon
                        name={IconSet.Mail}
                        size={14}
                        color={tokens.color.inkFaint}
                      />
                      <Text style={styles.contactText} numberOfLines={1}>
                        {organization.email}
                      </Text>
                    </View>
                  ) : null}

                  {organization.phone ? (
                    <View style={styles.contactRow}>
                      <Icon
                        name={IconSet.Phone}
                        size={14}
                        color={tokens.color.inkFaint}
                      />
                      <Text style={styles.contactText} numberOfLines={1}>
                        {organization.phone}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  searchWrap: {
    marginBottom: 16,
  },

  orgCard: {
    padding: 14,
  },

  orgHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    ...tokens.type.bodyStrong,
    fontWeight: "800",
    color: tokens.color.brand,
  },

  orgTextCol: {
    flex: 1,
    gap: 5,
  },

  orgName: {
    ...tokens.type.bodyStrong,
    fontSize: 17,
    color: tokens.color.ink,
  },

  industryChip: {
    alignSelf: "flex-start",
    backgroundColor: tokens.color.surfaceMuted,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },

  industryText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkMuted,
  },

  contactRows: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: 8,
  },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  contactText: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    flexShrink: 1,
  },
});