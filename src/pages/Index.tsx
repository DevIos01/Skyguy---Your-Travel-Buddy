import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Share2 } from "lucide-react";
import { SkyguyLogo } from "@/components/brand/SkyguyLogo";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { Composer } from "@/components/chat/Composer";
import { EmptyState } from "@/components/chat/EmptyState";
import { MessageBubble, TypingBubble } from "@/components/chat/MessageBubble";
import { ChatFilterSheet } from "@/components/chat/ChatFilterSheet";
import { EMPTY_PREFS, type Prefs } from "@/components/preferences/PreferencesForm";
import type { ChatMessage, Conversation, ResultBlock } from "@/types/chat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const Index = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => {
    // Restore the last-opened chat across full page reloads. We only store the
    // id locally — actual messages are still loaded from Supabase on mount.
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("skyscout:activeConversationId");
  });
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Tracks the message id whose retry button is currently sending, plus a
  // dedupe set of "<conversationId>:<content>" payloads that are in flight or
  // already retried in this session — prevents double-clicks and duplicate
  // submissions for the same previous message.
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const inFlightRetries = useRef<Set<string>>(new Set());

  // Saved defaults (from /settings) — loaded once per user.
  const [baselinePrefs, setBaselinePrefs] = useState<Prefs>(EMPTY_PREFS);
  // Per-conversation, transient overrides. Never persisted.
  const [overridesByConv, setOverridesByConv] = useState<Record<string, Partial<Prefs>>>({});
  const activeOverrides = activeId ? (overridesByConv[activeId] ?? null) : null;
  // Effective prefs sent to the chat — baseline merged with current overrides.
  // Used to pre-fill interactive question cards so the user can just confirm.
  const effectivePrefs = useMemo<Prefs>(
    () => ({ ...baselinePrefs, ...(activeOverrides ?? {}) }),
    [baselinePrefs, activeOverrides],
  );

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, thinking]);

  // Persist the active conversation id so refreshes don't drop the user back
  // into a fresh draft. Cleared when activeId is null (draft / new chat).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeId) {
      window.localStorage.setItem("skyscout:activeConversationId", activeId);
    } else {
      window.localStorage.removeItem("skyscout:activeConversationId");
    }
  }, [activeId]);

  // Load saved baseline preferences once per user
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_travel_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setBaselinePrefs({ ...EMPTY_PREFS, ...(data as Partial<Prefs>) });
    })();
    // Depend on the stable user id — Supabase fires onAuthStateChange (and
    // hands us a new User object) on tab focus / token refresh, which would
    // otherwise re-run this effect for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Load conversation list on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (error) {
        toast({ title: "Failed to load chats", description: error.message, variant: "destructive" });
        return;
      }
      const fetched = (data ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: new Date(c.updated_at).getTime(),
      }));
      // Merge with any conversations we've already hydrated this session so
      // we don't wipe loaded messages when the list refetches (e.g. on auth
      // token refresh when the tab regains focus).
      setConversations((prev) => {
        const prevById = new Map(prev.map((c) => [c.id, c]));
        return fetched.map((c) => {
          const existing = prevById.get(c.id);
          return existing
            ? { ...existing, title: c.title, updatedAt: c.updatedAt }
            : { ...c, messages: [] };
        });
      });
      // Restore the previously-open chat if it still exists; otherwise drop
      // into draft mode (no conversation is created until the first message).
      setActiveId((prev) => (prev && fetched.some((c) => c.id === prev) ? prev : null));
    })();
    // Stable user id only — see note on the prefs effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Load messages whenever active conversation changes (and they aren't loaded yet)
  useEffect(() => {
    if (!activeId) return;
    const conv = conversations.find((c) => c.id === activeId);
    if (!conv || conv.messages.length > 0) return;
    (async () => {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content, results, created_at")
        .eq("conversation_id", activeId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      setLoadingMessages(false);
      if (error) {
        toast({ title: "Failed to load messages", description: error.message, variant: "destructive" });
        return;
      }
      const msgs: ChatMessage[] = (data ?? [])
        .filter((m) => m.content && m.content.length > 0)
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          results: (m.results as ResultBlock | null) ?? undefined,
          createdAt: new Date(m.created_at).getTime(),
        }));
      setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, messages: msgs } : c)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, conversations.length]);

  const createConversation = async (): Promise<Conversation | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: "New chat" })
      .select("id, title, updated_at")
      .single();
    if (error || !data) {
      toast({ title: "Couldn't create chat", description: error?.message, variant: "destructive" });
      return null;
    }
    return {
      id: data.id,
      title: data.title,
      updatedAt: new Date(data.updated_at).getTime(),
      messages: [],
    };
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || !user) return;
    setDraft("");

    // If we're in draft mode (no active conversation yet), create one now —
    // this is the moment the chat actually exists.
    let conv = active;
    if (!conv) {
      const created = await createConversation();
      if (!created) return;
      conv = created;
      setConversations((prev) => [created, ...prev]);
      setActiveId(created.id);
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const isFirst = conv.messages.length === 0;
    const optimisticTitle = isFirst ? (content.length > 50 ? content.slice(0, 50) + "…" : content) : conv.title;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conv!.id
          ? { ...c, messages: [...c.messages, userMsg], title: optimisticTitle, updatedAt: Date.now() }
          : c,
      ),
    );
    setThinking(true);

    const { data, error } = await supabase.functions.invoke("travel-chat", {
      body: {
        conversationId: conv.id,
        content,
        // Per-chat override sent every message. Server merges over saved prefs (no DB write).
        overrides: overridesByConv[conv.id] ?? undefined,
      },
    });
    setThinking(false);

    if (error) {
      toast({ title: "Skyguy couldn't reply", description: error.message, variant: "destructive" });
      return;
    }

    const reply = data?.message;
    if (!reply) return;

    const assistantMsg: ChatMessage = {
      id: reply.id,
      role: "assistant",
      content: reply.content,
      results: reply.results ?? undefined,
      createdAt: reply.createdAt,
    };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conv!.id
          ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() }
          : c,
      ),
    );
  };

  const handleRetry = async (messageId: string, prevUserContent: string) => {
    if (!active) return;
    if (thinking || retryingId) return;
    const dedupeKey = `${active.id}:${prevUserContent}`;
    if (inFlightRetries.current.has(dedupeKey)) return;
    inFlightRetries.current.add(dedupeKey);
    setRetryingId(messageId);
    try {
      await handleSend(prevUserContent);
    } finally {
      setRetryingId(null);
      // Keep the dedupe key — once retried for this previous message, don't
      // allow another identical retry from the same failed bubble.
    }
  };

  const handleNewChat = () => {
    // Enter draft mode — actual conversation is created when the user sends the first message.
    setActiveId(null);
    setDraft("");
    setSidebarOpen(false);
  };

  const handlePickConversation = (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) {
      toast({ title: "Couldn't delete chat", description: error.message, variant: "destructive" });
      return;
    }
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (activeId === id) {
      // Drop into draft mode rather than auto-creating a new chat.
      setActiveId(null);
    }
    toast({ title: "Chat deleted" });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-chat text-foreground">
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handlePickConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-chat/85 px-3 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Open menu"
              title="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h2 className="truncate text-sm font-semibold text-foreground">
              {active?.title ?? "New chat"}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <ChatFilterSheet
              baseline={baselinePrefs}
              overrides={activeOverrides}
              onChange={(next) => {
                if (!activeId) return;
                setOverridesByConv((prev) => {
                  const copy = { ...prev };
                  if (!next) delete copy[activeId];
                  else copy[activeId] = next;
                  return copy;
                });
              }}
            />
            <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <button
              onClick={handleNewChat}
              aria-label="Start a new chat"
              title="Start a new chat"
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-sky text-white shadow-glow ring-1 ring-foreground/10 ring-offset-2 ring-offset-background transition-transform hover:scale-105 active:scale-95"
            >
              <SkyguyLogo className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Scrollable conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {(!active || active.messages.length === 0) && !loadingMessages ? (
            <EmptyState onPick={(p) => handleSend(p)} />
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-6 md:py-8">
              {active?.messages.map((m, idx) => {
                // Find the user message that produced this assistant reply (so retry resends it)
                const prevUser = (() => {
                  if (m.role !== "assistant") return undefined;
                  for (let i = idx - 1; i >= 0; i--) {
                    const p = active.messages[i];
                    if (p.role === "user") return p.content;
                  }
                  return undefined;
                })();
                const dedupeKey = prevUser ? `${active.id}:${prevUser}` : "";
                const alreadyRetried = dedupeKey ? inFlightRetries.current.has(dedupeKey) : false;
                const canRetry = !!prevUser && !thinking && !retryingId && !alreadyRetried;
                // A question card is "live" only on the latest assistant message that
                // has no follow-up user message yet — once the user has answered (or
                // sent any new message), older cards become read-only.
                const isQuestions = m.role === "assistant" && m.results?.kind === "questions";
                const hasLaterUserMsg = isQuestions
                  ? active.messages.slice(idx + 1).some((mm) => mm.role === "user")
                  : false;
                const questionsDisabled = isQuestions ? thinking || hasLaterUserMsg : false;
                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onRetry={canRetry ? () => handleRetry(m.id, prevUser!) : undefined}
                    retrying={retryingId === m.id}
                    onAnswerQuestions={isQuestions ? (formatted) => handleSend(formatted) : undefined}
                    questionsDisabled={questionsDisabled}
                    prefs={effectivePrefs}
                  />
                );
              })}
              {thinking && (
                <TypingBubble
                  lastUserMessage={
                    [...(active?.messages ?? [])].reverse().find((mm) => mm.role === "user")?.content
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => handleSend()}
          disabled={thinking || !user}
        />
      </main>
    </div>
  );
};

export default Index;
