import { useRef, useState, type FormEvent } from "react";
import { Image } from "react-native";

import { useAuth } from "../auth/AuthContext";
import brandMark from "../assets/ronalds-mark.svg";

import "./login.css";

function Symbol({ kind }: { kind: "mail" | "lock" | "eye" | "hidden" | "arrow" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "mail" && <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>}
      {kind === "lock" && <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>}
      {(kind === "eye" || kind === "hidden") && <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{kind === "hidden" && <path d="m3 3 18 18" />}</>}
      {kind === "arrow" && <path d="M4 12h16m-6-6 6 6-6 6" />}
    </svg>
  );
}

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setLoading(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
    } catch (failure) {
      setError(failure instanceof TypeError
        ? "We couldn’t reach the server. Check your connection and try again."
        : failure instanceof Error ? failure.message : "Unable to sign in. Please try again.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="ra-login">
      <section className="ra-story" aria-label="Ronalds Africa CRM">
        <a className="ra-brand" href="#sign-in" aria-label="Ronalds Africa CRM: go to sign in">
          <Image source={brandMark} style={{ width: 88, height: 88 }} resizeMode="contain" accessible={false} />
          <h1>Ronalds Africa <span>CRM</span></h1>
        </a>
      </section>

      <section className="ra-access" aria-labelledby="sign-in-heading">
        <div className="ra-form-wrap" id="sign-in">
          <h2 id="sign-in-heading">Sign in</h2>

          <form onSubmit={handleSubmit} className="ra-form" aria-busy={loading}>
            <label htmlFor="ra-email">Work email</label>
            <div className="ra-field"><Symbol kind="mail" /><input id="ra-email" name="email" type="email" autoComplete="username" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} readOnly={loading} /></div>

            <label htmlFor="ra-password">Password</label>
            <div className="ra-field"><Symbol kind="lock" /><input id="ra-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(e) => setPassword(e.target.value)} readOnly={loading} /><button className="ra-eye" type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}><Symbol kind={visible ? "hidden" : "eye"} /></button></div>

            {error && <p className="ra-error" role="alert">{error}</p>}
            <button className="ra-submit" type="submit" disabled={loading}><span>{loading ? "Signing in…" : "Sign in"}</span>{loading ? <span className="ra-spinner" aria-hidden="true" /> : <Symbol kind="arrow" />}</button>
          </form>

        </div>
      </section>
    </main>
  );
}
