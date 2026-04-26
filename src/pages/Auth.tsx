import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MailCheck, MessageSquare, Plus, Heart, Settings as SettingsIcon, UserCircle } from "lucide-react";
import { SkyguyLogo } from "@/components/brand/SkyguyLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { getRememberMe, persistSessionAfterSignIn } from "@/lib/sessionPersistence";

const Auth = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // "Remember me" — persists across browser restarts when on, evaporates with
  // the tab when off. Defaults to whatever the user picked last time (or true
  // for first-time visitors).
  const [rememberMe, setRememberMeState] = useState<boolean>(() => getRememberMe());
  // After a successful sign-up we hide the form and show a "check your email"
  // confirmation panel so the user can't miss the verification step.
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
      return;
    }
    await persistSessionAfterSignIn(rememberMe);
    setBusy(false);
    navigate("/", { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: name },
      },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      return;
    }
    // Supabase returns a session immediately when email confirmation is OFF.
    // In that case skip the verify screen and just route the user in.
    if (data.session) {
      navigate("/", { replace: true });
      return;
    }
    setVerificationSentTo(email);
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-chat">
      {/* ============================================================
          Faux-dashboard backdrop. Mirrors the real sidebar + chat so
          the auth card feels like it's floating above the app the user
          is about to enter. Blurred + dimmed so it stays decorative.
          ============================================================ */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 select-none [filter:blur(6px)_saturate(0.9)] opacity-60"
      >
        <div className="flex h-full w-full">
          {/* Mock sidebar */}
          <div className="hidden w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
            <div className="flex items-center gap-2.5 px-4 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-sky text-white shadow-glow ring-1 ring-foreground/10">
                <SkyguyLogo className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Skyguy</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Your travel buddy</p>
              </div>
            </div>
            <div className="px-3 pb-3">
              <div className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm">
                <Plus className="h-4 w-4" />
                New chat
              </div>
            </div>
            <div className="flex-1 space-y-0.5 px-2">
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </p>
              {["Tokyo in April", "Family trip to Rome", "Weekend in Lisbon", "Ski week, Chamonix"].map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80">
                  <MessageSquare className="h-3.5 w-3.5 opacity-70" />
                  <span className="truncate">{t}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-sidebar-border p-3 space-y-1">
              {[
                { Icon: Heart, label: "Favorite hotels" },
                { Icon: UserCircle, label: "Your profile" },
                { Icon: SettingsIcon, label: "Travel preferences" },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80">
                  <Icon className="h-4 w-4" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Mock chat area */}
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-8 w-8 rounded-lg bg-muted" />
            </div>
            <div className="flex-1 space-y-4 p-6">
              <div className="max-w-md rounded-2xl rounded-tl-sm border border-border bg-card p-4 shadow-sm">
                <div className="h-3 w-44 rounded bg-muted" />
                <div className="mt-2 h-3 w-64 rounded bg-muted" />
              </div>
              <div className="ml-auto max-w-sm rounded-2xl rounded-tr-sm bg-primary/80 p-4 text-primary-foreground shadow-sm">
                <div className="h-3 w-40 rounded bg-primary-foreground/40" />
                <div className="mt-2 h-3 w-52 rounded bg-primary-foreground/40" />
              </div>
              <div className="max-w-md rounded-2xl rounded-tl-sm border border-border bg-card p-4 shadow-sm">
                <div className="h-3 w-56 rounded bg-muted" />
                <div className="mt-2 h-3 w-72 rounded bg-muted" />
                <div className="mt-2 h-3 w-48 rounded bg-muted" />
              </div>
              <div className="grid max-w-2xl grid-cols-2 gap-3 pt-2">
                <div className="h-32 rounded-xl border border-border bg-card shadow-sm" />
                <div className="h-32 rounded-xl border border-border bg-card shadow-sm" />
              </div>
            </div>
            <div className="p-4">
              <div className="mx-auto h-12 max-w-2xl rounded-2xl border border-border bg-card shadow-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Soft wash so the card pops against the blurred dashboard */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-background/40"
      />

      {/* ============================================================
          Foreground: the actual auth card.
          ============================================================ */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/95 p-8 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-card/80">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-sky text-white shadow-glow ring-1 ring-foreground/10">
            <SkyguyLogo className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Welcome to Skyguy</h1>
            <p className="text-xs text-muted-foreground">Your travel buddy</p>
          </div>
        </div>

        {verificationSentTo ? (
          <div className="space-y-5 pt-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MailCheck className="h-7 w-7" strokeWidth={2} />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">Check your inbox</h2>
              <p className="text-sm text-muted-foreground">
                We sent a verification link to{" "}
                <span className="font-medium text-foreground">{verificationSentTo}</span>.
                Click it to activate your account, then come back here to sign in.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
              Didn't get it? Check your spam folder, or wait a minute and try again — emails can take a moment to arrive.
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setVerificationSentTo(null);
                setPassword("");
              }}
            >
              Back to sign in
            </Button>
          </div>
        ) : (
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input id="signin-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(c) => setRememberMeState(c === true)}
                />
                <Label
                  htmlFor="remember-me"
                  className="cursor-pointer select-none text-sm font-normal text-muted-foreground"
                >
                  Remember me on this device
                </Label>
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Name</Label>
                <Input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input id="signup-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        )}
        </div>
      </main>
    </div>
  );
};

export default Auth;