import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PreferencesForm, type Prefs } from "@/components/preferences/PreferencesForm";

interface Props {
  baseline: Prefs;            // saved defaults from Settings
  overrides: Partial<Prefs> | null; // current per-chat overrides (null = none)
  onChange: (next: Partial<Prefs> | null) => void;
}

/**
 * Per-chat filter override. Edits never persist to the user_travel_preferences table —
 * they're only sent with each message in the current conversation.
 */
export function ChatFilterSheet({ baseline, overrides, onChange }: Props) {
  const [open, setOpen] = useState(false);
  // Local working copy of the merged prefs while the sheet is open
  const [draft, setDraft] = useState<Prefs>({ ...baseline, ...(overrides ?? {}) });

  // Re-sync when sheet opens or baseline/overrides change externally
  useEffect(() => {
    setDraft({ ...baseline, ...(overrides ?? {}) });
  }, [open, baseline, overrides]);

  const hasOverride = overrides && Object.keys(overrides).length > 0;

  const apply = () => {
    // Only keep keys that differ from baseline
    const diff: Partial<Prefs> = {};
    (Object.keys(draft) as (keyof Prefs)[]).forEach((k) => {
      if (JSON.stringify(draft[k]) !== JSON.stringify(baseline[k])) {
        // @ts-expect-error generic narrowing
        diff[k] = draft[k];
      }
    });
    onChange(Object.keys(diff).length === 0 ? null : diff);
    setOpen(false);
  };

  const reset = () => {
    setDraft(baseline);
    onChange(null);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Chat filters"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {hasOverride && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary"
              aria-label="Override active"
            />
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Chat filters</SheetTitle>
          <SheetDescription>
            Tweak preferences just for this chat. Changes won't be saved to your defaults — edit those in{" "}
            <span className="font-medium text-foreground">Travel preferences</span>.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <PreferencesForm value={draft} onChange={setDraft} hideNotes />
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-2 border-t border-border bg-background px-6 py-3">
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5" disabled={!hasOverride}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={apply}>
              Apply for this chat
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}