import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  type LayoutChangeEvent,
  type ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  type Contact,
  type Organization,
  tokens,
} from "@crm/core";

import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  Icon,
  IconSet,
  Screen,
  SearchBar,
} from "@crm/ui";

import { useAuth } from "../auth/AuthContext";
import { ContactFormSheet } from "../components/ContactFormSheet";
import { OrgFormSheet } from "../components/OrgFormSheet";
import { apiFetch } from "../api";
import { Alert } from "../lib/dialogs";
import { useDirectoryPage } from "../components/useDirectoryPage";
import { DirectoryPager } from "../components/DirectoryPager";
import { OrganizationSourceDetails } from "../components/OrganizationSourceDetails";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type ProspectsScreenProps = {
  /** Client to expand and scroll to on arrival (e.g. tapped from Home). */
  focusOrganizationId?: string | null;
  /** Called once the focus has been applied, so it can be cleared upstream. */
  onFocusHandled?: () => void;
};

export function ProspectsScreen({
  focusOrganizationId = null,
  onFocusHandled,
}: ProspectsScreenProps) {
  const { token } = useAuth();

  const scrollRef = useRef<ScrollView>(null);
  const cardOffsets = useRef<Record<string, number>>({});
  const pendingFocusRef = useRef<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // A focused directory contact may belong to an existing customer. Include
  // all accounts for that lookup, while the normal tab shows prospects only.
  const [focused, setFocused] = useState<string | null>(null);
  const directory = useDirectoryPage<Organization & { contacts: Contact[] }>(
    focused ? `/organizations?id=${encodeURIComponent(focused)}` : "/organizations?view=prospects", token, query
  );
  const { items: organizations, loading, error: loadError, load } = directory;
  const contacts = useMemo(() => organizations.flatMap((org) => org.contacts), [organizations]);
  const [refreshing, setRefreshing] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [formOrg, setFormOrg] = useState<Organization | null>(null);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [clientFormOrg, setClientFormOrg] = useState<Organization | null>(null);

  async function refresh() {
    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const contactsByOrg = useMemo(() => {
    const grouped = new Map<string, Contact[]>();

    for (const contact of contacts) {
      const list = grouped.get(contact.organizationId);
      if (list) {
        list.push(contact);
      } else {
        grouped.set(contact.organizationId, [contact]);
      }
    }

    return grouped;
  }, [contacts]);

  const filtered = organizations;

  // Arriving from Home with a client selected: drop any active search so the
  // client is definitely in the list, and expand it.
  useEffect(() => {
    if (!focusOrganizationId) return;

    // Stored rather than scrolled to directly — the list may not have loaded
    // yet, so the card has no measured position at this point.
    pendingFocusRef.current = focusOrganizationId;
    setFocused(focusOrganizationId);
    directory.setPage(0);
    setQuery("");
    setExpandedId(focusOrganizationId);
    onFocusHandled?.();
  }, [focusOrganizationId, onFocusHandled]);

  // Once the cards have actually laid out, bring the pending client into view.
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;

    const y = cardOffsets.current[id];
    if (y == null) return;

    pendingFocusRef.current = null;

    // Let the expansion settle before measuring the final position.
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - 12),
        animated: true,
      });
    }, 80);

    return () => clearTimeout(timer);
  }, [organizations, filtered.length, expandedId]);

  function openAdd(organization: Organization) {
    setEditing(null);
    setFormOrg(organization);
    setFormOpen(true);
  }

  function openEdit(organization: Organization, contact: Contact) {
    setEditing(contact);
    setFormOrg(organization);
    setFormOpen(true);
  }

  function confirmDelete(contact: Contact) {
    Alert.alert(
      "Delete contact?",
      `${contact.name} will be removed from this client.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          async onPress() {
            if (!token) return;

            try {
              await apiFetch(`/contacts/${contact.id}`, token, {
                method: "DELETE",
              });
              await load();
            } catch (error) {
              Alert.alert(
                "Unable to delete contact",
                error instanceof Error ? error.message : "Please try again."
              );
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.brand} />
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <View style={styles.center}>
          <EmptyState
            icon={IconSet.Warning}
            title="Unable to load clients"
            subtitle={loadError}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scrollRef={scrollRef}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={tokens.color.brand}
        />
      }
    >
      <>
        <AppHeader
          icon={IconSet.People}
          title="Prospects"
          subtitle={`${directory.total.toLocaleString()} ${focused ? "matching accounts" : "prospects on file"}`}
        />

        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={(value) => { setFocused(null); directory.setPage(0); setQuery(value); }}
            placeholder="Search prospects, countries, partners or people"
          />
        </View>

        <DirectoryPager page={directory.page} total={directory.total} busy={directory.busy} onChange={directory.setPage} />

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
                : "Try a different name, industry or contact person."
            }
          />
        ) : (
          filtered.map((organization) => {
            const expanded = expandedId === organization.id;
            const people = contactsByOrg.get(organization.id) ?? [];

            return (
              <Card
                key={organization.id}
                style={styles.orgCard}
                onLayout={(event: LayoutChangeEvent) => {
                  cardOffsets.current[organization.id] =
                    event.nativeEvent.layout.y;
                }}
              >
                <Pressable
                  onPress={() => setExpandedId(expanded ? null : organization.id)}
                >
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

                      <View style={styles.badgeRow}>
                        {organization.industry ? (
                          <View style={styles.industryChip}>
                            <Text style={styles.industryText}>
                              {organization.industry}
                            </Text>
                          </View>
                        ) : null}

                        <View style={styles.peopleChip}>
                          <Icon
                            name={IconSet.Person}
                            size={10}
                            color={tokens.color.brand}
                          />
                          <Text style={styles.peopleChipText}>
                            {people.length} contact{people.length === 1 ? "" : "s"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Icon
                      name={expanded ? IconSet.ChevronUp : IconSet.ChevronDown}
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
                </Pressable>

                {expanded ? (
                  <View style={styles.detail}>
                    <OrganizationSourceDetails organization={organization} />
                    <Text style={styles.detailHeading}>
                      Contact information
                    </Text>

                    {people.length === 0 ? (
                      <Text style={styles.detailEmpty}>
                        No contacts yet. Add the people you speak to at{" "}
                        {organization.name}.
                      </Text>
                    ) : (
                      people.map((contact) => (
                        <View key={contact.id} style={styles.person}>
                          <View style={styles.personAvatar}>
                            <Text style={styles.personInitials}>
                              {initials(contact.name)}
                            </Text>
                          </View>

                          <View style={styles.personText}>
                            <View style={styles.personNameRow}>
                              <Text
                                style={styles.personName}
                                numberOfLines={1}
                              >
                                {contact.name}
                              </Text>

                              {contact.isPrimary ? (
                                <View style={styles.primaryChip}>
                                  <Text style={styles.primaryText}>
                                    Primary
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            {contact.title ? (
                              <Text
                                style={styles.personTitle}
                                numberOfLines={1}
                              >
                                {contact.title}
                                {contact.department
                                  ? ` · ${contact.department}`
                                  : ""}
                              </Text>
                            ) : null}

                            {contact.email ? (
                              <View style={styles.personRow}>
                                <Icon
                                  name={IconSet.Mail}
                                  size={12}
                                  color={tokens.color.inkFaint}
                                />
                                <Text
                                  style={styles.personContact}
                                  numberOfLines={1}
                                >
                                  {contact.email}
                                </Text>
                              </View>
                            ) : null}

                            {contact.phone ? (
                              <View style={styles.personRow}>
                                <Icon
                                  name={IconSet.Phone}
                                  size={12}
                                  color={tokens.color.inkFaint}
                                />
                                <Text
                                  style={styles.personContact}
                                  numberOfLines={1}
                                >
                                  {contact.phone}
                                </Text>
                              </View>
                            ) : null}

                            {contact.notes ? (
                              <Text style={styles.personNotes}>
                                {contact.notes}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.personActions}>
                            <Button
                              title="Edit"
                              onPress={() => openEdit(organization, contact)}
                              variant="ghost"
                              size="sm"
                            />
                            <Button
                              title="Delete"
                              onPress={() => confirmDelete(contact)}
                              variant="danger"
                              size="sm"
                            />
                          </View>
                        </View>
                      ))
                    )}

                    <Button
                      title="Add contact"
                      onPress={() => openAdd(organization)}
                      icon={IconSet.Add}
                      variant="secondary"
                      size="sm"
                    />

                    <Button
                      title="Edit client details"
                      onPress={() => {
                        setClientFormOrg(organization);
                        setClientFormOpen(true);
                      }}
                      variant="ghost"
                      size="sm"
                    />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </>

      {formOrg ? (
        <ContactFormSheet
          visible={formOpen}
          token={token ?? ""}
          contact={editing}
          organization={formOrg}
          onClose={() => setFormOpen(false)}
          onSaved={load}
        />
      ) : null}

      {clientFormOrg ? (
        <OrgFormSheet
          visible={clientFormOpen}
          token={token ?? ""}
          organization={clientFormOrg}
          onClose={() => setClientFormOpen(false)}
          onSaved={load}
        />
      ) : null}
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

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },

  industryChip: {
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

  peopleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: tokens.color.brandSoft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  peopleChipText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.brand,
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

  detail: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },

  detailHeading: {
    ...tokens.type.micro,
    textTransform: "uppercase",
    color: tokens.color.inkFaint,
    marginBottom: 12,
  },

  detailEmpty: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    marginBottom: 12,
  },

  person: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },

  personAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  personInitials: {
    ...tokens.type.micro,
    letterSpacing: 0,
    fontWeight: "800",
    color: tokens.color.brand,
  },

  personText: {
    flex: 1,
    gap: 3,
  },

  personNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  personName: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
    flexShrink: 1,
  },

  primaryChip: {
    backgroundColor: tokens.color.brandSoft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },

  primaryText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.brand,
  },

  personTitle: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },

  personContact: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
    flexShrink: 1,
  },

  personNotes: {
    ...tokens.type.caption,
    color: tokens.color.inkFaint,
    marginTop: 4,
  },

  personActions: {
    gap: 4,
    alignItems: "flex-end",
  },
});
