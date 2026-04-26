import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PreferencesForm, EMPTY_PREFS, type Prefs } from "@/components/preferences/PreferencesForm";
import { useUserCurrencyContext } from "@/hooks/useUserCurrency";

export default function Settings() {
  const { user } = useAuth();
  const { refresh: refreshCurrency } = useUserCurrencyContext();
  const [prefs, setPrefs] = useState<Prefs>(EMPTY_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_travel_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPrefs({ ...EMPTY_PREFS, ...(data as Partial<Prefs>) });
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_travel_preferences")
      .upsert({ ...prefs, user_id: user.id }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    await refreshCurrency();
    toast({ title: "Preferences saved", description: "Skyguy will use these as bias." });
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
          <h1 className="text-sm font-semibold">Travel preferences</h1>
        </div>
        <Button onClick={save} disabled={saving || loading} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 md:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading your preferences…
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Your defaults. Skyguy will silently apply these as bias on every chat. You can override them per chat from the chat header.
            </p>
            <PreferencesForm value={prefs} onChange={setPrefs} />
          </>
        )}
      </main>
    </div>
  );
}