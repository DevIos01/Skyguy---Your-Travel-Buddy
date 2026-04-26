import { Plus, MessageSquare, LogOut, X, Trash2, Settings as SettingsIcon, Heart, Moon, Sun, UserCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { Conversation } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { SkyguyLogo } from "@/components/brand/SkyguyLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
}

export function ChatSidebar({ conversations, activeId, onSelect, onNew, onDelete, open, onClose }: Props) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const initials = (user?.user_metadata?.full_name ?? user?.email ?? "Y")
    .split(/\s+/)
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <button
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-foreground/30 backdrop-blur-sm"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl transition-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <button
            onClick={onNew}
            aria-label="Start a new chat"
            title="Start a new chat"
            className="flex items-center gap-2.5 rounded-lg p-1 -m-1 text-left transition-opacity hover:opacity-90"
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-sky text-white shadow-glow ring-1 ring-foreground/10 ring-offset-2 ring-offset-sidebar">
              <SkyguyLogo className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground leading-tight">Skyguy</p>
              <p className="text-[11px] text-muted-foreground leading-tight">Your travel buddy</p>
            </div>
          </button>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-sidebar-border bg-card text-foreground shadow-sm hover:bg-sidebar-accent"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="px-3 pb-3">
          <Button
            onClick={onNew}
            variant="ghost"
            className="w-full justify-start gap-2 border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground shadow-sm hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent
          </p>
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id} className="group/item relative">
                <button
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg py-2 pl-3 pr-9 text-left text-sm transition-colors",
                    activeId === c.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{c.title}</span>
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      aria-label="Delete chat"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover/item:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete chat?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{c.title}" and all of its messages will be permanently removed. This can't be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(c.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
            {conversations.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                No conversations yet
              </li>
            )}
          </ul>
        </div>

        <div className="border-t border-sidebar-border p-3">
          <Link
            to="/favorites"
            onClick={onClose}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Heart className="h-4 w-4" />
            Favorite hotels
          </Link>
          <Link
            to="/profile"
            onClick={onClose}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <UserCircle className="h-4 w-4" />
            Your profile
          </Link>
          <Link
            to="/settings"
            onClick={onClose}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <SettingsIcon className="h-4 w-4" />
            Travel preferences
          </Link>
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
          <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2">
            <div
              role="img"
              aria-label={`Signed in as ${user?.user_metadata?.full_name ?? user?.email ?? "user"}`}
              title={user?.user_metadata?.full_name ?? user?.email ?? "Signed in"}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-sky text-[11px] font-semibold text-white shadow-sm ring-2 ring-sidebar ring-offset-1 ring-offset-sidebar-border"
            >
              <span aria-hidden="true">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{user?.user_metadata?.full_name ?? "You"}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.email ?? "Signed in"}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}