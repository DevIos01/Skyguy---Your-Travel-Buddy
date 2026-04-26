import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type CurrencyContextValue = {
  /** ISO-4217 code the user wants to see prices in. Defaults to EUR. */
  currency: string;
  /** Force a refresh after the Settings page saves. */
  refresh: () => Promise<void>;
};

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function UserCurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrency] = useState<string>("EUR");

  const load = async () => {
    if (!user) {
      setCurrency("EUR");
      return;
    }
    const { data } = await supabase
      .from("user_travel_preferences")
      .select("preferred_currency")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.preferred_currency) setCurrency(data.preferred_currency.toUpperCase());
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <CurrencyContext.Provider value={{ currency, refresh: load }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useUserCurrency(): string {
  const ctx = useContext(CurrencyContext);
  return ctx?.currency ?? "EUR";
}

export function useUserCurrencyContext(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useUserCurrencyContext must be used inside UserCurrencyProvider");
  return ctx;
}