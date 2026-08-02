import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, LogOut, UserRound, X } from "lucide-react";
import { useAuth } from "@/context/useAuth";

export default function AuthPanel() {
  const { configured, loading, user, error, signIn, signUp, signOut, clearError } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading) return <span className="text-xs text-muted">checking account…</span>;
  if (user) return <div className="flex items-center gap-3"><Link className="hidden items-center gap-1 text-xs text-muted hover:text-gold sm:flex" to="/account"><UserRound size={14} /> history</Link><span className="hidden max-w-32 truncate text-xs text-muted md:inline">{user.email}</span><button className="icon-button" aria-label="Sign out" onClick={() => void signOut()}><LogOut size={15} /></button></div>;
  return <div className="relative"><button className="button button-ghost px-3 py-2 text-xs" onClick={() => { setOpen((value) => !value); clearError(); }}><LogIn size={14} /> sign in</button>{open && <div className="panel absolute right-0 top-12 z-40 w-80 p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="eyebrow text-gold">optional account</p><h2 className="display mt-1 text-2xl">keep your progress</h2></div><button className="icon-button" aria-label="Close sign in" onClick={() => setOpen(false)}><X size={15} /></button></div>{!configured ? <p className="mt-4 text-sm leading-6 text-muted">Supabase Auth is not configured on this deployment. Guest play works without it.</p> : <form className="mt-4 space-y-3" onSubmit={async (event) => { event.preventDefault(); setBusy(true); if (mode === "signin") await signIn(email, password); else await signUp(email, password); setBusy(false); }}><label className="field-label" htmlFor="auth-email">email</label><input id="auth-email" className="field" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /><label className="field-label" htmlFor="auth-password">password</label><input id="auth-password" className="field" type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} />{error && <p className="text-sm text-red-300" role="alert">{error}</p>}<button className="button button-primary w-full" disabled={busy}>{busy ? "working…" : mode === "signin" ? "sign in" : "create account"}</button><button type="button" className="w-full text-xs text-muted underline-offset-4 hover:text-gold hover:underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); clearError(); }}>{mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</button></form>}</div>}</div>;
}
