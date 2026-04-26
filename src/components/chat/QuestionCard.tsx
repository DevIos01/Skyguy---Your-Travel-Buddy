import { useMemo, useState } from "react";
import { format, parseISO, isValid as isValidDate } from "date-fns";
import { HelpCircle, Send, Check, CalendarIcon } from "lucide-react";
import type { QuestionField } from "@/types/chat";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Prefs } from "@/components/preferences/PreferencesForm";

type Answer = boolean | string | string[] | number;
type AnswerMap = Record<string, Answer>;

/**
 * Maps a question id (snake_case) to the matching preference value.
 * Returns `undefined` when no sensible mapping exists — callers should then
 * fall back to the question's own `default`.
 *
 * Matching is intentionally fuzzy (substring on the lowercased id) so the AI
 * can pick natural ids like "adults", "num_adults", "passengers", etc.
 */
function prefDefaultFor(q: QuestionField, prefs: Prefs | null | undefined): Answer | undefined {
  if (!prefs) return undefined;
  const id = q.id.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => id.includes(n));

  // Numeric counts
  if (q.type === "number") {
    if (has("adult", "passenger", "traveler", "traveller", "guest")) return prefs.default_adults;
    if (has("child", "kid")) return prefs.default_children;
    if (has("room")) return prefs.default_rooms;
    if (has("seat")) return prefs.min_car_seats ?? undefined;
    if (has("star")) return prefs.min_hotel_stars ?? undefined;
    if (has("rating")) return prefs.min_hotel_rating ?? undefined;
    if (has("stop")) return prefs.max_stops ?? undefined;
    return undefined;
  }

  // Yes/no toggles
  if (q.type === "boolean") {
    if (has("direct", "nonstop", "non_stop")) return prefs.direct_flights_only;
    if (has("layover", "long_layover")) return prefs.prefer_no_long_layovers;
    return undefined;
  }

  // Single-choice — must match an option (case-insensitive)
  if (q.type === "single") {
    let raw: string | null | undefined;
    if (has("cabin")) raw = prefs.preferred_cabin_class;
    else if (has("transmission")) raw = prefs.preferred_car_transmission;
    else if (has("budget")) raw = prefs.budget_level;
    else if (has("currency")) raw = prefs.preferred_currency;
    else if (has("bag", "luggage", "baggage")) raw = prefs.baggage_preference;
    if (!raw) return undefined;
    const match = q.options.find((o) => o.toLowerCase() === raw!.toLowerCase());
    if (match) return match;
    // Fuzzy match for baggage options labelled in human-friendly text
    // ("Backpack (under seat)", "Cabin bag (overhead bin)", etc).
    if (has("bag", "luggage", "baggage")) {
      const needle: Record<string, string[]> = {
        none: ["nothing", "no bag", "none"],
        personal: ["backpack", "personal", "under seat"],
        carry_on: ["cabin", "carry-on", "carry on", "overhead"],
        checked: ["checked", "hold"],
      };
      const pool = needle[raw] ?? [];
      const fuzzy = q.options.find((o) =>
        pool.some((p) => o.toLowerCase().includes(p)),
      );
      if (fuzzy) return fuzzy;
    }
    return undefined;
  }

  // Free text
  if (q.type === "text") {
    // Origin / "where from instead" follow-ups should default to the saved home city.
    if (has("home", "origin", "from_city", "departure_city", "pickup_city", "alternate_origin", "alt_origin", "where_from"))
      return prefs.home_city ?? undefined;
    if (has("currency")) return prefs.preferred_currency;
    return undefined;
  }

  return undefined;
}

function initialAnswers(questions: QuestionField[], prefs?: Prefs | null): AnswerMap {
  const out: AnswerMap = {};
  for (const q of questions) {
    // Model-supplied default wins; pref-based fallback fills the gap.
    const prefDefault = prefDefaultFor(q, prefs);
    if (q.type === "boolean") {
      out[q.id] = q.default ?? (typeof prefDefault === "boolean" ? prefDefault : false);
    } else if (q.type === "single") {
      out[q.id] = q.default ?? (typeof prefDefault === "string" ? prefDefault : "");
    } else if (q.type === "multi") {
      out[q.id] = q.default ?? [];
    } else if (q.type === "date") {
      out[q.id] = q.default ?? "";
    } else if (q.type === "number") {
      out[q.id] = typeof q.default === "number"
        ? q.default
        : typeof prefDefault === "number"
          ? prefDefault
          : "";
    } else {
      out[q.id] = q.default ?? (typeof prefDefault === "string" ? prefDefault : "");
    }
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns null when the answer is valid, otherwise a short user-facing reason.
 * Empty values for non-required fields are always valid.
 */
function validate(q: QuestionField, value: Answer): string | null {
  const required = q.required !== false;

  if (q.type === "boolean") return null; // toggle always has a value

  if (q.type === "multi") {
    const arr = Array.isArray(value) ? value : [];
    if (required && arr.length === 0) return "Please pick at least one option.";
    return null;
  }

  if (q.type === "single") {
    const v = typeof value === "string" ? value : "";
    if (required && !v) return "Please choose an option.";
    return null;
  }

  if (q.type === "date") {
    const v = typeof value === "string" ? value : "";
    if (!v) return required ? "Please pick a date." : null;
    const d = parseISO(v);
    if (!isValidDate(d)) return "That doesn't look like a valid date.";
    if (q.minDate) {
      const min = parseISO(q.minDate);
      if (isValidDate(min) && d < stripTime(min)) return `Pick a date on or after ${format(min, "PPP")}.`;
    }
    if (q.maxDate) {
      const max = parseISO(q.maxDate);
      if (isValidDate(max) && d > stripTime(max)) return `Pick a date on or before ${format(max, "PPP")}.`;
    }
    return null;
  }

  if (q.type === "number") {
    if (value === "" || value === null || value === undefined) return required ? "Please enter a number." : null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "Enter a valid number.";
    if (typeof q.min === "number" && n < q.min) return `Must be at least ${q.min}.`;
    if (typeof q.max === "number" && n > q.max) return `Must be at most ${q.max}.`;
    return null;
  }

  // text
  const textQ = q as Extract<QuestionField, { type: "text" }>;
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return required ? "Please answer this to continue." : null;
  if (textQ.minLength && v.length < textQ.minLength) return `Use at least ${textQ.minLength} characters.`;
  if (textQ.maxLength && v.length > textQ.maxLength) return `Use at most ${textQ.maxLength} characters.`;
  if (textQ.format === "email" && !EMAIL_RE.test(v)) return "Enter a valid email address.";
  if (textQ.format === "tel") {
    // Allow digits, spaces, +, -, parentheses; require at least 7 digits.
    if (!/^[\d\s+()-]+$/.test(v) || (v.match(/\d/g)?.length ?? 0) < 7)
      return "Enter a valid phone number.";
  }
  if (textQ.format === "number") {
    const n = Number(v);
    if (!Number.isFinite(n)) return "Enter a number.";
    if (typeof textQ.min === "number" && n < textQ.min) return `Must be at least ${textQ.min}.`;
    if (typeof textQ.max === "number" && n > textQ.max) return `Must be at most ${textQ.max}.`;
  }
  return null;
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Returns true if the question should currently be shown given the other
 * answers in the form. Hidden fields are skipped from validation and from the
 * formatted answer payload sent back to the assistant.
 */
function isVisible(q: QuestionField, answers: AnswerMap): boolean {
  if (!q.showIf) return true;
  const dep = answers[q.showIf.id];
  // Loose equality is intentional — the AI may emit `equals: false` while the
  // form holds an actual boolean, or `equals: "yes"` against a string radio.
  // eslint-disable-next-line eqeqeq
  return dep == q.showIf.equals;
}

function formatAnswerForChat(questions: QuestionField[], answers: AnswerMap): string {
  const lines = questions
    .filter((q) => isVisible(q, answers))
    .map((q) => {
    const v = answers[q.id];
    let display: string;
    if (q.type === "boolean") display = v ? "Yes" : "No";
    else if (q.type === "multi") display = Array.isArray(v) && v.length ? v.join(", ") : "(none)";
    else if (q.type === "date") {
      if (typeof v === "string" && v) {
        const d = parseISO(v);
        display = isValidDate(d) ? `${format(d, "PPP")} (${v})` : v;
      } else display = "(skipped)";
    } else if (q.type === "number") {
      display = v === "" || v === null || v === undefined ? "(skipped)" : String(v);
    } else display = typeof v === "string" && v.trim() ? v.trim() : "(skipped)";
    return `- **${q.label}** ${display}`;
  });
  return lines.join("\n");
}

export function QuestionCard({
  prompt,
  questions,
  submitLabel,
  disabled,
  onSubmit,
  prefs,
}: {
  prompt: string;
  questions: QuestionField[];
  submitLabel?: string;
  disabled?: boolean;
  onSubmit: (formattedReply: string, answers: AnswerMap) => void;
  /** Saved baseline + per-chat overrides — used to pre-fill matching fields. */
  prefs?: Prefs | null;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(() => initialAnswers(questions, prefs));
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo<Record<string, string | null>>(() => {
    const out: Record<string, string | null> = {};
    for (const q of questions) {
      // Hidden fields don't block submission — they're considered "skipped".
      out[q.id] = isVisible(q, answers) ? validate(q, answers[q.id]) : null;
    }
    return out;
  }, [questions, answers]);

  const hasErrors = useMemo(() => Object.values(errors).some(Boolean), [errors]);
  const canSubmit = !disabled && !hasErrors;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    onSubmit(formatAnswerForChat(questions, answers), answers);
  };

  const update = (id: string, value: Answer) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 overflow-hidden rounded-2xl border border-border bg-secondary/40"
      aria-label={prompt}
      noValidate
    >
      <div className="flex items-center gap-2 border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-foreground leading-tight">A few quick details</p>
      </div>

      <fieldset disabled={disabled} className="space-y-4 p-4">
        {questions.map((q) => {
          if (!isVisible(q, answers)) return null;
          const value = answers[q.id];
          const error = errors[q.id];
          const errored = showErrors && !!error;
          const fieldId = `q-${q.id}`;
          const requiredStar = q.required !== false && q.type !== "boolean";
          // Conditional fields slide in so the relationship to the controlling
          // toggle/radio is visually obvious.
          const conditionalCls = q.showIf ? "animate-fade-in-up" : "";
          return (
            <div key={q.id} className={cn("space-y-1.5", conditionalCls)}>
              {q.type === "boolean" ? (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={fieldId} className="text-sm font-medium text-foreground">
                      {q.label}
                    </Label>
                    {q.hint && <p className="mt-0.5 text-xs text-muted-foreground">{q.hint}</p>}
                  </div>
                  <Switch id={fieldId} checked={!!value} onCheckedChange={(v) => update(q.id, v)} />
                </div>
              ) : (
                <>
                  <Label htmlFor={fieldId} className="text-sm font-medium text-foreground">
                    {q.label}
                    {requiredStar && <span className="ml-0.5 text-destructive">*</span>}
                  </Label>
                  {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}

                  {q.type === "single" && (
                    <RadioGroup
                      id={fieldId}
                      value={typeof value === "string" ? value : ""}
                      onValueChange={(v) => update(q.id, v)}
                      className={cn(
                        "grid gap-1.5 rounded-lg border border-border bg-card p-2",
                        errored && "border-destructive",
                      )}
                    >
                      {q.options.map((opt) => {
                        const optId = `${fieldId}-${opt}`;
                        return (
                          <Label
                            key={opt}
                            htmlFor={optId}
                            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-normal text-foreground hover:bg-muted"
                          >
                            <RadioGroupItem id={optId} value={opt} />
                            <span>{opt}</span>
                          </Label>
                        );
                      })}
                    </RadioGroup>
                  )}

                  {q.type === "multi" && (
                    <div
                      className={cn(
                        "grid gap-1.5 rounded-lg border border-border bg-card p-2",
                        errored && "border-destructive",
                      )}
                    >
                      {q.options.map((opt) => {
                        const optId = `${fieldId}-${opt}`;
                        const arr = Array.isArray(value) ? value : [];
                        const checked = arr.includes(opt);
                        return (
                          <Label
                            key={opt}
                            htmlFor={optId}
                            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-normal text-foreground hover:bg-muted"
                          >
                            <Checkbox
                              id={optId}
                              checked={checked}
                              onCheckedChange={(v) => {
                                const next = v ? [...arr, opt] : arr.filter((x) => x !== opt);
                                update(q.id, next);
                              }}
                            />
                            <span>{opt}</span>
                          </Label>
                        );
                      })}
                    </div>
                  )}

                  {q.type === "text" && (
                    <Input
                      id={fieldId}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => update(q.id, e.target.value)}
                      placeholder={q.placeholder}
                      type={q.format === "email" ? "email" : q.format === "tel" ? "tel" : q.format === "number" ? "number" : "text"}
                      inputMode={q.format === "number" ? "numeric" : q.format === "tel" ? "tel" : undefined}
                      minLength={q.minLength}
                      maxLength={q.maxLength}
                      min={q.format === "number" ? q.min : undefined}
                      max={q.format === "number" ? q.max : undefined}
                      aria-invalid={errored || undefined}
                      className={cn(errored && "border-destructive focus-visible:ring-destructive")}
                    />
                  )}

                  {q.type === "number" && (
                    <Input
                      id={fieldId}
                      type="number"
                      inputMode="numeric"
                      value={typeof value === "number" ? value : typeof value === "string" ? value : ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") return update(q.id, "");
                        const n = Number(raw);
                        update(q.id, Number.isFinite(n) ? n : raw);
                      }}
                      placeholder={q.placeholder}
                      min={q.min}
                      max={q.max}
                      step={q.step ?? 1}
                      aria-invalid={errored || undefined}
                      className={cn(errored && "border-destructive focus-visible:ring-destructive")}
                    />
                  )}

                  {q.type === "date" && (() => {
                    const dateStr = typeof value === "string" ? value : "";
                    const dateObj = dateStr ? parseISO(dateStr) : undefined;
                    const valid = dateObj && isValidDate(dateObj) ? dateObj : undefined;
                    const minD = q.minDate ? parseISO(q.minDate) : undefined;
                    const maxD = q.maxDate ? parseISO(q.maxDate) : undefined;
                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id={fieldId}
                            type="button"
                            variant="outline"
                            aria-invalid={errored || undefined}
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !valid && "text-muted-foreground",
                              errored && "border-destructive focus-visible:ring-destructive",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
                            {valid ? format(valid, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={valid}
                            onSelect={(d) => update(q.id, d ? format(d, "yyyy-MM-dd") : "")}
                            disabled={(d) => {
                              if (minD && isValidDate(minD) && d < stripTime(minD)) return true;
                              if (maxD && isValidDate(maxD) && d > stripTime(maxD)) return true;
                              return false;
                            }}
                            defaultMonth={valid ?? minD ?? new Date()}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                </>
              )}
              {errored && error && (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}

        <button
          type="submit"
          disabled={disabled}
          aria-disabled={!canSubmit}
          className={cn(
            "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity",
            "hover:opacity-90",
            (!canSubmit || disabled) && "opacity-60",
            disabled && "cursor-not-allowed",
          )}
        >
          {disabled ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Sent
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              {submitLabel ?? "Continue"}
            </>
          )}
        </button>
      </fieldset>
    </form>
  );
}