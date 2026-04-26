import { SkyguyLogo } from "@/components/brand/SkyguyLogo";

// Prompts are crafted to exercise each result type against the seeded mock
// catalog (hotels + cars). All cities listed below have 4 hotels and 3 cars
// in the Wanderlush database, so every shortcut returns rich preview data.
const suggestedPrompts = [
  {
    icon: "🏨",
    title: "Hotels in Barcelona",
    subtitle: "4★+ stays for 3 nights starting next Friday, 2 adults",
    tag: "Wanderlush Stays",
  },
  {
    icon: "🚗",
    title: "Rent a car in Rome",
    subtitle: "Automatic, 5 seats, picked up next Monday for 4 days",
    tag: "Wanderlush Wheels",
  },
  {
    icon: "🌆",
    title: "Weekend in Amsterdam",
    subtitle: "Hotel + rental car for 3 nights starting next Saturday, 2 adults",
    tag: "Trip bundle",
  },
  {
    icon: "🗼",
    title: "Tokyo trip",
    subtitle: "Flights + 4★ hotel + automatic car for 5 nights next month, 2 adults",
    tag: "Full trip",
  },
  {
    icon: "🏛️",
    title: "City break in Rome",
    subtitle: "Hotel near the centre + car rental for 4 nights next month",
    tag: "Stays + Wheels",
  },
  {
    icon: "🌃",
    title: "Long weekend in New York",
    subtitle: "Hotel in Manhattan + automatic car for 3 nights next Friday, 2 adults",
    tag: "Stays + Wheels",
  },
  {
    icon: "🕌",
    title: "Istanbul getaway",
    subtitle: "4★ hotel for 4 nights starting next Wednesday, 2 adults 1 child",
    tag: "Wanderlush Stays",
  },
  {
    icon: "🌴",
    title: "Singapore stopover",
    subtitle: "Hotel near Marina Bay + rental car for 3 nights next month",
    tag: "Stays + Wheels",
  },
];

interface Props {
  onPick: (prompt: string) => void;
}

export function EmptyState({ onPick }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-8 pt-12 text-center md:pt-20">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-sky text-white shadow-glow ring-1 ring-foreground/10 ring-offset-2 ring-offset-background">
        <SkyguyLogo className="h-8 w-8" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Where are you headed?
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground md:text-base">
        Ask in plain English. Skyguy will find flights, hotels, and the best deals across Skyscanner.
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {suggestedPrompts.map((p) => (
          <button
            key={p.title}
            onClick={() => onPick(`${p.title}: ${p.subtitle}`)}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
          >
            <span className="text-2xl leading-none">{p.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{p.title}</p>
                {p.tag && (
                  <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {p.tag}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{p.subtitle}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}