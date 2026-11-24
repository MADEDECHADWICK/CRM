import { useState } from "react";
import { Image } from "react-native";
import { Icon, IconSet } from "@crm/ui";
import { useAuth } from "../auth/AuthContext";
import { MemberEditSheet } from "../components/MemberEditSheet";
import { Alert } from "../lib/dialogs";
import brandMark from "../assets/ronalds-mark.svg";
import type { AppShellProps } from "./AppShell.types";
import "./workspace.css";

const ROLES: Record<string, string> = {
  MARKETING_BD: "Administrator",
  PARTNER: "Partner",
  MANAGER: "Manager",
  PROPOSAL_COORDINATOR: "BD team member",
  TECHNICAL_REVIEWER: "Technical reviewer",
  COUNTRY_LEAD: "Country lead",
  IT_ADMIN: "IT administrator",
};

export function AppShell({ children, items, active, onSelect }: AppShellProps) {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const initials = user?.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const roleLabel = user?.isAdmin ? "Administrator" : user ? ROLES[user.role] : "";
  const current = items.find(i => i.key === active);
  const date = new Date().toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  function signOut() {
    Alert.alert("Sign out?", "You can sign back in to continue your work.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", onPress: logout }]);
  }
  return <div className="crm-shell">
    <a className="crm-skip" href="#workspace-main">Skip to workspace</a>
    <aside className="crm-sidebar">
      <button className="crm-brand" onClick={() => onSelect("HOME")} aria-label="Ronalds Africa CRM home">
        <Image source={brandMark} style={{ width: 45, height: 45 }} resizeMode="contain" />
        <span><strong>Ronalds Africa</strong><small>CRM</small></span>
      </button>
      <span className="crm-nav-caption">Workspace</span>
      <nav className="crm-desktop-nav" aria-label="Main navigation">
        {items.map(item => <button key={item.key} className={`crm-nav-item ${active === item.key ? "is-active" : ""}`} aria-current={active === item.key ? "page" : undefined} onClick={() => onSelect(item.key)}>
          <span aria-hidden="true"><Icon name={item.icon} size={20} color={active === item.key ? "#ffad69" : "#a7bacb"} /></span>
          <span>{item.key === "HOME" ? "Overview" : item.label}</span>
          {active === item.key && <span className="crm-active-dot" />}
        </button>)}
      </nav>
      <div className="crm-sidebar-bottom">
        <div className="crm-workspace-label"><span className="crm-workspace-dot" /> Ronalds Africa workspace</div>
        <button className="crm-account" onClick={() => setProfileOpen(true)} aria-label="Edit my profile">
          <span className="crm-avatar crm-avatar-dark">{initials}</span>
          <span className="crm-account-details"><strong>{user?.name}</strong><small>{roleLabel}</small></span>
          <Icon name={IconSet.Options} size={18} color="#b0c1ce" />
        </button>
      </div>
    </aside>
    <div className="crm-workspace">
      <header className="crm-topbar">
        <div className="crm-breadcrumb"><span>Workspace</span><span className="crm-breadcrumb-slash">/</span><strong>{active === "HOME" ? "Overview" : current?.label}</strong></div>
        <div className="crm-mobile-brand"><Image source={brandMark} style={{ width: 30, height: 30 }} resizeMode="contain" /><span>Ronalds Africa <small>CRM</small></span></div>
        <div className="crm-topbar-actions">
          <time className="crm-today">{date}</time>
          <span className="crm-topbar-divider" />
          <button className="crm-profile-button" onClick={() => setProfileOpen(true)} aria-label="Edit my profile" title="My profile"><span className="crm-avatar">{initials}</span><span className="crm-profile-name">{user?.name.split(" ")[0]}</span><Icon name={IconSet.ChevronDown} size={14} color="#728091" /></button>
          <button className="crm-icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name={IconSet.Logout} size={20} color="#617285" /></button>
        </div>
      </header>
      <main id="workspace-main" tabIndex={-1} className="crm-page" key={user?.id}>{children}</main>
      <nav className="crm-mobile-nav" aria-label="Main navigation">
        {items.map(item => <button key={item.key} className={active === item.key ? "is-active" : ""} aria-current={active === item.key ? "page" : undefined} onClick={() => onSelect(item.key)}><span aria-hidden="true"><Icon name={item.icon} size={20} color={active === item.key ? "#0b2a4a" : "#728091"} /></span><span>{item.label}</span></button>)}
      </nav>
    </div>
    {profileOpen && <MemberEditSheet onClose={() => setProfileOpen(false)} />}
  </div>;
}
