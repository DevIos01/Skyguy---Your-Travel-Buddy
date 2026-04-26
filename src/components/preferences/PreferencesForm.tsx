import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Prefs = {
  preferred_cabin_class: string | null;
  direct_flights_only: boolean;
  max_stops: number | null;
  baggage_preference: string | null;       // none | personal | carry_on | checked
  checked_bags: number;                     // 0..3
  max_carry_on_weight_kg: number | null;    // 7, 8, 10, 12 typical
  prefer_no_long_layovers: boolean;
  preferred_airlines: string[];
  avoided_airlines: string[];
  min_hotel_stars: number | null;
  min_hotel_rating: number | null;
  preferred_hotel_amenities: string[];
  preferred_hotel_brands: string[];
  preferred_car_transmission: string | null;
  preferred_car_class: string | null;
  min_car_seats: number | null;
  default_adults: number;
  default_children: number;
  default_rooms: number;
  preferred_currency: string;
  home_city: string | null;
  budget_level: string | null;
  notes: string | null;
};

export const EMPTY_PREFS: Prefs = {
  preferred_cabin_class: null,
  direct_flights_only: false,
  max_stops: null,
  baggage_preference: null,
  checked_bags: 0,
  max_carry_on_weight_kg: null,
  prefer_no_long_layovers: false,
  preferred_airlines: [],
  avoided_airlines: [],
  min_hotel_stars: null,
  min_hotel_rating: null,
  preferred_hotel_amenities: [],
  preferred_hotel_brands: [],
  preferred_car_transmission: null,
  preferred_car_class: null,
  min_car_seats: null,
  default_adults: 1,
  default_children: 0,
  default_rooms: 1,
  preferred_currency: "EUR",
  home_city: null,
  budget_level: null,
  notes: null,
};

const csv = (arr: string[]) => arr.join(", ");
const fromCsv = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

const ALLOWED_CARRY_ON_WEIGHTS = [7, 8, 10, 12] as const;
const MIN_CHECKED_BAGS = 0;
const MAX_CHECKED_BAGS = 3;

const clampCheckedBags = (n: number): number => {
  if (!Number.isFinite(n)) return MIN_CHECKED_BAGS;
  return Math.min(MAX_CHECKED_BAGS, Math.max(MIN_CHECKED_BAGS, Math.trunc(n)));
};

const sanitizeCarryOnWeight = (n: number | null): number | null => {
  if (n == null || !Number.isFinite(n)) return null;
  return (ALLOWED_CARRY_ON_WEIGHTS as readonly number[]).includes(n) ? n : null;
};

export function PreferencesForm({
  value,
  onChange,
  hideNotes = false,
}: {
  value: Prefs;
  onChange: (next: Prefs) => void;
  hideNotes?: boolean;
}) {
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) =>
    onChange({ ...value, [k]: v });

  const cabinValue = useMemo(() => value.preferred_cabin_class ?? "any", [value.preferred_cabin_class]);
  const transmissionValue = useMemo(
    () => value.preferred_car_transmission ?? "any",
    [value.preferred_car_transmission],
  );
  const budgetValue = useMemo(() => value.budget_level ?? "any", [value.budget_level]);
  const stopsValue = useMemo(() => {
    if (value.direct_flights_only) return "0";
    if (value.max_stops === 0) return "0";
    if (value.max_stops === 1) return "1";
    if (value.max_stops === 2) return "2";
    return "any";
  }, [value.direct_flights_only, value.max_stops]);
  const baggageValue = useMemo(() => value.baggage_preference ?? "any", [value.baggage_preference]);
  const carryOnWeightValue = useMemo(
    () => {
      const sanitized = sanitizeCarryOnWeight(value.max_carry_on_weight_kg);
      return sanitized == null ? "any" : String(sanitized);
    },
    [value.max_carry_on_weight_kg],
  );

  return (
    <div className="space-y-6">
      {/* General */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">General</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Home city">
            <Input
              value={value.home_city ?? ""}
              onChange={(e) => set("home_city", e.target.value || null)}
              placeholder="e.g. Berlin"
            />
          </Field>
          <Field label="Currency">
            <Input
              value={value.preferred_currency}
              onChange={(e) => set("preferred_currency", e.target.value.toUpperCase().slice(0, 3))}
              placeholder="EUR"
            />
          </Field>
          <Field label="Default adults">
            <Input
              type="number"
              min={1}
              value={value.default_adults}
              onChange={(e) => set("default_adults", Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Default children">
            <Input
              type="number"
              min={0}
              value={value.default_children}
              onChange={(e) => set("default_children", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Default rooms">
            <Input
              type="number"
              min={1}
              value={value.default_rooms}
              onChange={(e) => set("default_rooms", Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Budget level">
            <Select value={budgetValue} onValueChange={(v) => set("budget_level", v === "any" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No preference</SelectItem>
                <SelectItem value="budget">Budget</SelectItem>
                <SelectItem value="mid">Mid-range</SelectItem>
                <SelectItem value="luxury">Luxury</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      {/* Flights */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Flights</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cabin class">
            <Select value={cabinValue} onValueChange={(v) => set("preferred_cabin_class", v === "any" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No preference</SelectItem>
                <SelectItem value="economy">Economy</SelectItem>
                <SelectItem value="premium-economy">Premium Economy</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="first">First</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Stops">
            <Select
              value={stopsValue}
              onValueChange={(v) => {
                if (v === "any") {
                  onChange({ ...value, direct_flights_only: false, max_stops: null });
                } else if (v === "0") {
                  onChange({ ...value, direct_flights_only: true, max_stops: 0 });
                } else {
                  onChange({ ...value, direct_flights_only: false, max_stops: Number(v) });
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any (cheapest first)</SelectItem>
                <SelectItem value="0">Direct flights only</SelectItem>
                <SelectItem value="1">Up to 1 stop</SelectItem>
                <SelectItem value="2">Up to 2 stops</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 sm:col-span-2">
            <div>
              <Label className="text-sm">Avoid long layovers</Label>
              <p className="text-xs text-muted-foreground">
                Skip itineraries with layovers longer than ~4 hours.
              </p>
            </div>
            <Switch
              checked={value.prefer_no_long_layovers}
              onCheckedChange={(v) => set("prefer_no_long_layovers", v)}
            />
          </div>
          <Field label="Preferred airlines (comma-separated)" className="sm:col-span-2">
            <Input
              value={csv(value.preferred_airlines)}
              onChange={(e) => set("preferred_airlines", fromCsv(e.target.value))}
              placeholder="Lufthansa, ANA"
            />
          </Field>
          <Field label="Avoid airlines (comma-separated)" className="sm:col-span-2">
            <Input
              value={csv(value.avoided_airlines)}
              onChange={(e) => set("avoided_airlines", fromCsv(e.target.value))}
              placeholder="Spirit"
            />
          </Field>
        </div>
      </section>

      {/* Baggage */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Baggage</h2>
        <p className="text-xs text-muted-foreground -mt-2">
          Skyguy uses these to filter out fares that don't include the bag you usually
          bring (and to warn about strict carry-on weight limits).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What I usually bring" className="sm:col-span-2">
            <Select
              value={baggageValue}
              onValueChange={(v) => set("baggage_preference", v === "any" ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Ask me each time</SelectItem>
                <SelectItem value="none">
                  Nothing — just the clothes I'm wearing
                </SelectItem>
                <SelectItem value="personal">
                  Personal item · backpack (~40 × 20 × 25 cm, fits under seat)
                </SelectItem>
                <SelectItem value="carry_on">
                  Cabin bag · carry-on (~55 × 40 × 20 cm, overhead bin)
                </SelectItem>
                <SelectItem value="checked">
                  Checked bag (158 cm linear · ~23 kg)
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {value.baggage_preference === "checked" && (
            <Field label="How many checked bags">
              <Input
                type="number"
                min={1}
                max={MAX_CHECKED_BAGS}
                step={1}
                value={value.checked_bags || 1}
                onChange={(e) => {
                  const raw = e.target.value === "" ? 1 : Number(e.target.value);
                  set("checked_bags", clampCheckedBags(raw));
                }}
              />
            </Field>
          )}

          {(value.baggage_preference === "personal" || value.baggage_preference === "carry_on") && (
            <Field label="My carry-on weight is around">
              <Select
                value={carryOnWeightValue}
                onValueChange={(v) =>
                  set(
                    "max_carry_on_weight_kg",
                    v === "any" ? null : sanitizeCarryOnWeight(Number(v)),
                  )
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">No preference</SelectItem>
                  <SelectItem value="7">Up to 7 kg (Ryanair / Wizz strict)</SelectItem>
                  <SelectItem value="8">Up to 8 kg (most low-cost)</SelectItem>
                  <SelectItem value="10">Up to 10 kg (most legacy)</SelectItem>
                  <SelectItem value="12">Up to 12 kg (premium / business)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
      </section>

      {/* Hotels */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Hotels</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Min stars">
            <Input
              type="number"
              min={1}
              max={5}
              value={value.min_hotel_stars ?? ""}
              onChange={(e) => set("min_hotel_stars", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="Any"
            />
          </Field>
          <Field label="Min guest rating (0–5)">
            <Input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={value.min_hotel_rating ?? ""}
              onChange={(e) => set("min_hotel_rating", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="Any"
            />
          </Field>
          <Field label="Wanted amenities (comma-separated)" className="sm:col-span-2">
            <Input
              value={csv(value.preferred_hotel_amenities)}
              onChange={(e) => set("preferred_hotel_amenities", fromCsv(e.target.value))}
              placeholder="Free WiFi, Pool, Breakfast"
            />
          </Field>
          <Field label="Preferred brands (comma-separated)" className="sm:col-span-2">
            <Input
              value={csv(value.preferred_hotel_brands)}
              onChange={(e) => set("preferred_hotel_brands", fromCsv(e.target.value))}
              placeholder="Wanderlush Stays"
            />
          </Field>
        </div>
      </section>

      {/* Cars */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Rental cars</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Transmission">
            <Select
              value={transmissionValue}
              onValueChange={(v) => set("preferred_car_transmission", v === "any" ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No preference</SelectItem>
                <SelectItem value="automatic">Automatic</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Vehicle class">
            <Input
              value={value.preferred_car_class ?? ""}
              onChange={(e) => set("preferred_car_class", e.target.value || null)}
              placeholder="suv, economy, luxury…"
            />
          </Field>
          <Field label="Min seats">
            <Input
              type="number"
              min={1}
              value={value.min_car_seats ?? ""}
              onChange={(e) => set("min_car_seats", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="Any"
            />
          </Field>
        </div>
      </section>

      {!hideNotes && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Notes for Skyguy</h2>
          <p className="text-xs text-muted-foreground">
            Free-form bias the AI will read on every request.
          </p>
          <Textarea
            value={value.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            rows={4}
            placeholder="Anything Skyguy should keep in mind…"
          />
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}