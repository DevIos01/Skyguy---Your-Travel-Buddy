import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save, UserCircle, Home, MapPin } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// ----- validation -----
const profileSchema = z.object({
  full_name: z.string().trim().max(120).optional().nullable(),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+0-9 ()\-]*$/u, "Only digits, spaces and + ( ) - are allowed")
    .optional()
    .nullable(),
  date_of_birth: z.string().optional().nullable(),
  passport_country: z.string().trim().max(80).optional().nullable(),
  home_street: z.string().trim().max(200).optional().nullable(),
  home_city: z.string().trim().max(120).optional().nullable(),
  home_postal_code: z.string().trim().max(20).optional().nullable(),
  home_country: z.string().trim().max(80).optional().nullable(),
  ask_before_using_home_address: z.boolean(),
});

type ProfileForm = z.infer<typeof profileSchema>;

const EMPTY_PROFILE: ProfileForm = {
  full_name: "",
  phone: "",
  date_of_birth: "",
  passport_country: "",
  home_street: "",
  home_city: "",
  home_postal_code: "",
  home_country: "",
  ask_before_using_home_address: true,
};

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, phone, date_of_birth, passport_country, home_street, home_city, home_postal_code, home_country, ask_before_using_home_address",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        toast({ title: "Couldn't load profile", description: error.message, variant: "destructive" });
      } else if (data) {
        setForm({
          full_name: data.full_name ?? "",
          phone: data.phone ?? "",
          date_of_birth: (data.date_of_birth as string | null) ?? "",
          passport_country: data.passport_country ?? "",
          home_street: data.home_street ?? "",
          home_city: data.home_city ?? "",
          home_postal_code: data.home_postal_code ?? "",
          home_country: data.home_country ?? "",
          ask_before_using_home_address: data.ask_before_using_home_address ?? true,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!user) return;
    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast({ title: "Check your inputs", description: firstError ?? "Invalid profile", variant: "destructive" });
      return;
    }
    setSaving(true);
    // Convert empty strings to null and DOB string -> ISO date or null
    const payload = {
      id: user.id,
      email: user.email,
      full_name: parsed.data.full_name?.trim() || null,
      phone: parsed.data.phone?.trim() || null,
      date_of_birth: parsed.data.date_of_birth ? parsed.data.date_of_birth : null,
      passport_country: parsed.data.passport_country?.trim() || null,
      home_street: parsed.data.home_street?.trim() || null,
      home_city: parsed.data.home_city?.trim() || null,
      home_postal_code: parsed.data.home_postal_code?.trim() || null,
      home_country: parsed.data.home_country?.trim() || null,
      ask_before_using_home_address: parsed.data.ask_before_using_home_address,
    };
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save profile", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Profile saved", description: "Skyguy will use these details for smarter defaults." });
  };

  return (
    <div className="min-h-screen bg-chat text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-chat/85 px-4 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to chat
            </Link>
          </Button>
          <h1 className="text-sm font-semibold">Your profile</h1>
        </div>
        <Button onClick={save} disabled={loading || saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save"}
        </Button>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6 md:py-10">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Personal */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Personal details</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <Input
                    value={form.full_name ?? ""}
                    onChange={(e) => update("full_name", e.target.value)}
                    maxLength={120}
                    placeholder="Ada Lovelace"
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={form.phone ?? ""}
                    onChange={(e) => update("phone", e.target.value)}
                    maxLength={32}
                    inputMode="tel"
                    placeholder="+44 20 7946 0958"
                  />
                </Field>
                <Field label="Date of birth">
                  <Input
                    type="date"
                    value={form.date_of_birth ?? ""}
                    onChange={(e) => update("date_of_birth", e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </Field>
                <Field label="Passport country">
                  <Input
                    value={form.passport_country ?? ""}
                    onChange={(e) => update("passport_country", e.target.value)}
                    maxLength={80}
                    placeholder="United Kingdom"
                  />
                </Field>
              </div>
            </section>

            {/* Home address */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Home className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Home address</h2>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Used as a default departure for flights and pickup for car rentals when you don't specify one.
              </p>
              <div className="grid gap-4">
                <Field label="Street address">
                  <Input
                    value={form.home_street ?? ""}
                    onChange={(e) => update("home_street", e.target.value)}
                    maxLength={200}
                    placeholder="221B Baker Street"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="City">
                    <Input
                      value={form.home_city ?? ""}
                      onChange={(e) => update("home_city", e.target.value)}
                      maxLength={120}
                      placeholder="London"
                    />
                  </Field>
                  <Field label="Postal code">
                    <Input
                      value={form.home_postal_code ?? ""}
                      onChange={(e) => update("home_postal_code", e.target.value)}
                      maxLength={20}
                      placeholder="NW1 6XE"
                    />
                  </Field>
                  <Field label="Country">
                    <Input
                      value={form.home_country ?? ""}
                      onChange={(e) => update("home_country", e.target.value)}
                      maxLength={80}
                      placeholder="United Kingdom"
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <Label htmlFor="ask-toggle" className="text-sm font-medium">
                      Ask before using my home address
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      When on, Skyguy will confirm before defaulting to your saved home as the departure city.
                    </p>
                  </div>
                </div>
                <Switch
                  id="ask-toggle"
                  checked={form.ask_before_using_home_address}
                  onCheckedChange={(checked) => update("ask_before_using_home_address", checked)}
                />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}