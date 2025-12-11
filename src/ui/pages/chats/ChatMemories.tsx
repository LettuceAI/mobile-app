import { useEffect, useMemo, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Sparkles, Clock, ChevronDown, ChevronUp, Search, Bot, User, Trash2, Edit2, Check, Plus, Pin, MessageSquare, AlertTriangle, X, RefreshCw, Snowflake, Flame } from "lucide-react";
import type { Character, Session } from "../../../core/storage/schemas";
import { addMemory, removeMemory, updateMemory, getSession, listSessionIds, listCharacters, saveSession, toggleMessagePin } from "../../../core/storage/repo";
// ... imports ...

// ... (code omitted) ...


import { storageBridge } from "../../../core/storage/files";
import { typography, radius, cn, interactive, spacing, colors, components } from "../../design-tokens";
import { Routes, useNavigationManager } from "../../navigation";

type MemoryToolEvent = NonNullable<Session["memoryToolEvents"]>[number];

function useSessionData(characterId?: string, requestedSessionId?: string | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!characterId) {
      setError("Missing characterId");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const chars = await listCharacters();
      const foundChar = chars.find((c) => c.id === characterId) ?? null;
      setCharacter(foundChar);

      let targetSession: Session | null = null;
      if (requestedSessionId) {
        targetSession = await getSession(requestedSessionId).catch(() => null);
      }

      if (!targetSession) {
        const sessionIds = await listSessionIds().catch(() => [] as string[]);
        let latest: Session | null = null;
        for (const id of sessionIds) {
          const maybe = await getSession(id).catch(() => null);
          if (maybe?.characterId === characterId) {
            if (!latest || maybe.updatedAt > latest.updatedAt) {
              latest = maybe;
            }
          }
        }
        targetSession = latest;
      }

      if (targetSession) {
        setSession(targetSession);
      } else {
        setError("Session not found");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [characterId, requestedSessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { session, setSession, character, loading, error, reload: load };
}

function useMemoryActions(session: Session | null, reload: () => Promise<void>, setSession: (s: Session) => void) {
  const handleAdd = useCallback(async (memory: string) => {
    if (!session) return;

    window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: true } }));

    try {
      await addMemory(session.id, memory);
      await reload();
      window.dispatchEvent(new CustomEvent("memory:success"));
      window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: false } }));
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent("memory:error", { detail: { error: err?.message || "Failed to add memory" } }));
      window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: false } }));
      throw err;
    }
  }, [reload, session]);

  const handleRemove = useCallback(async (index: number) => {
    if (!session) return;

    window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: true } }));

    try {
      await removeMemory(session.id, index);
      await reload();
      window.dispatchEvent(new CustomEvent("memory:success"));
      window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: false } }));
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent("memory:error", { detail: { error: err?.message || "Failed to remove memory" } }));
      window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: false } }));
      throw err;
    }
  }, [reload, session]);

  const handleUpdate = useCallback(async (index: number, memory: string) => {
    if (!session) return;

    window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: true } }));

    try {
      await updateMemory(session.id, index, memory);
      await reload();
      window.dispatchEvent(new CustomEvent("memory:success"));
      window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: false } }));
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent("memory:error", { detail: { error: err?.message || "Failed to update memory" } }));
      window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: false } }));
      throw err;
    }
  }, [reload, session]);

  const handleSaveSummary = useCallback(async (summary: string) => {
    if (!session) return;

    window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: true } }));

    try {
      const updated: Session = { ...session, memorySummary: summary };
      await saveSession(updated);
      setSession(updated);
      window.dispatchEvent(new CustomEvent("memory:success"));
      window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: false } }));
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent("memory:error", { detail: { error: err?.message || "Failed to save summary" } }));
      window.dispatchEvent(new CustomEvent("memory:busy", { detail: { busy: false } }));
      throw err;
    }
  }, [session, setSession]);

  return { handleAdd, handleRemove, handleUpdate, handleSaveSummary };
}

function UpdatedMemoriesList({ memories }: { memories: string[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!memories || memories.length === 0) return null;

  return (
    <div className="pt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between",
          components.listItem.base,
          "px-3 py-2",
          interactive.hover.brightness
        )}
      >
        <div className="flex items-center gap-2">
          <div className={cn("h-1.5 w-1.5 rounded-full", isOpen ? "bg-emerald-400" : "bg-emerald-400/50")} />
          <span className={cn(typography.caption.size, colors.text.secondary, "font-medium")}>
            Updated Memory State ({memories.length})
          </span>
        </div>
        {isOpen ? (
          <ChevronUp size={14} className={colors.text.tertiary} />
        ) : (
          <ChevronDown size={14} className={colors.text.tertiary} />
        )}
      </button>

      {isOpen && (
        <div className={cn("mt-2 space-y-2 pl-1", spacing.tight)}>
          {memories.map((m, i) => (
            <div
              key={i}
              className={cn(
                radius.sm,
                colors.accent.emerald.subtle,
                "px-3 py-2"
              )}
            >
              <p className={cn(typography.caption.size, "leading-relaxed")}>
                {m}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolLog({ events }: { events: MemoryToolEvent[] }) {
  if (!events.length) {
    return (
      <div className={cn(
        components.card.base,
        "px-6 py-8 text-center"
      )}>
        <p className={cn(typography.bodySmall.size, colors.text.tertiary)}>
          No tool calls captured yet. Tool calls appear when AI manages memories in dynamic mode.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(spacing.item, "space-y-3")}>
      {events.map((event) => (
        <div
          key={event.id}
          className={cn(
            components.card.base,
            "p-4 space-y-3"
          )}
        >
          {/* Event Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className={colors.text.tertiary} />
              <span className={cn(typography.caption.size, colors.text.tertiary)}>
                Messages {event.windowStart}–{event.windowEnd}
              </span>
            </div>
            <span className={cn(typography.caption.size, colors.text.disabled)}>
              {new Date(event.createdAt || 0).toLocaleDateString()}
            </span>
          </div>

          {/* Summary */}
          {event.summary && (
            <div className={cn(
              radius.md,
              "border border-blue-400/20 bg-blue-400/10 px-3 py-3"
            )}>
              <p className={cn(typography.bodySmall.size, "text-blue-200/90")}>
                {event.summary}
              </p>
            </div>
          )}

          {/* Actions */}
          {event.actions && event.actions.length > 0 && (
            <div className={spacing.field}>
              <p className={cn(typography.caption.size, colors.text.tertiary, "font-semibold")}>
                Actions ({event.actions.length})
              </p>
              {event.actions.map((action, idx) => (
                <div
                  key={idx}
                  className={cn(
                    radius.md,
                    "border border-white/5 bg-black/20 p-3",
                    spacing.field
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      typography.bodySmall.size,
                      "font-semibold uppercase tracking-wide text-emerald-300"
                    )}>
                      {action.name}
                    </span>
                    {action.timestamp && (
                      <span className={cn(typography.caption.size, colors.text.disabled)}>
                        {new Date(action.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {action.arguments && (
                    <div className={cn(
                      radius.sm,
                      "bg-black/40 p-3 overflow-x-auto"
                    )}>
                      <pre className={cn(typography.caption.size, colors.text.secondary, "font-mono")}>
                        {JSON.stringify(action.arguments, null, 2)}
                      </pre>
                    </div>
                  )}

                  {action.updatedMemories?.length ? (
                    <UpdatedMemoriesList memories={action.updatedMemories} />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ChatMemoriesPage() {
  const { go, backOrReplace } = useNavigationManager();
  const { characterId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const { session, setSession, character, loading, error, reload } = useSessionData(characterId, sessionId);
  const { handleAdd, handleRemove, handleUpdate, handleSaveSummary } = useMemoryActions(session, reload, (s) => setSession(s));
  const [activeTab, setActiveTab] = useState<"memories" | "tools" | "pinned">("memories");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newMemory, setNewMemory] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [retryStatus, setRetryStatus] = useState<"idle" | "retrying" | "success">("idle");

  const [actionError, setActionError] = useState<string | null>(searchParams.get("error"));
  const [memoryStatus, setMemoryStatus] = useState<"idle" | "processing" | "failed">("idle");

  useEffect(() => {
    if (!session?.id) return;
    let unlisteners: (() => void)[] = [];

    const setup = async () => {
      try {
        const u1 = await listen("dynamic-memory:processing", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            setMemoryStatus("processing");
            setActionError(null);
          }
        });
        const u2 = await listen("dynamic-memory:success", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            setMemoryStatus("idle");
            reload();
          }
        });
        const u3 = await listen("dynamic-memory:error", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            setMemoryStatus("failed");
            setActionError(e.payload?.error || "Memory processing failed");
          }
        });
        unlisteners.push(u1, u2, u3);
      } catch (err) {
        console.error("Failed to setup memory event listeners", err);
      }
    };

    setup();
    return () => {
      unlisteners.forEach(u => u());
    };
  }, [session?.id, reload]);

  useEffect(() => {
    setSummaryDraft(session?.memorySummary ?? "");
  }, [session?.memorySummary]);

  const isDynamic = useMemo(() => {
    return character?.memoryType === "dynamic";
  }, [character?.memoryType]);

  const cycleMap = useMemo(() => {
    const map = new Map<string, string>();
    const textMap = new Map<string, string>();

    if (session?.memoryToolEvents) {
      session.memoryToolEvents.forEach((event: any) => {
        const cycleStr = `${event.windowStart}-${event.windowEnd}`;
        if (event.actions) {
          event.actions.forEach((action: any) => {
            if (action.name === 'create_memory') {
              if (action.memoryId) {
                map.set(action.memoryId, cycleStr);
              }
              const text = action.arguments?.text;
              if (text) {
                textMap.set(text, cycleStr);
              }
            }
          });
        }
      });
    }
    return { map, textMap };
  }, [session?.memoryToolEvents]);

  const memoryItems = useMemo(() => {
    if (!session?.memories) return [];
    return session.memories.map((text, index) => {
      const emb = session.memoryEmbeddings?.[index];
      const id = emb?.id || `mem-${index}`;
      const isAi = id.length <= 6;
      const tokenCount = emb?.tokenCount || 0;

      let cycle = cycleMap.map.get(id);
      if (!cycle && cycleMap.textMap.has(text)) {
        cycle = cycleMap.textMap.get(text);
      }

      return {
        text,
        index,
        isAi,
        id,
        tokenCount,
        isCold: emb?.isCold ?? false,
        importanceScore: emb?.importanceScore ?? 1.0,
        createdAt: emb?.createdAt ?? 0,
        lastAccessedAt: emb?.lastAccessedAt ?? 0,
        isPinned: emb?.isPinned ?? false,
        cycle
      };
    });
  }, [session, cycleMap]);

  const filteredMemories = useMemo(() => {
    if (!searchTerm.trim()) return memoryItems;
    return memoryItems.filter(item =>
      item.text.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [memoryItems, searchTerm]);

  const stats = useMemo(() => {
    const total = memoryItems.length;
    const ai = memoryItems.filter(m => m.isAi).length;
    const user = total - ai;
    const totalMemoryTokens = memoryItems.reduce((sum, m) => sum + m.tokenCount, 0);
    const summaryTokens = session?.memorySummaryTokenCount || 0;
    const totalTokens = totalMemoryTokens + summaryTokens;
    return { total, ai, user, totalMemoryTokens, summaryTokens, totalTokens };
  }, [memoryItems, session?.memorySummaryTokenCount]);

  const pinnedMessages = useMemo(() => {
    return session?.messages.filter(m => m.isPinned) || [];
  }, [session?.messages]);

  const handleUnpin = useCallback(async (messageId: string) => {
    if (!session) return;
    try {
      await toggleMessagePin(session.id, messageId);
      await reload();
      setActionError(null);
    } catch (err: any) {
      console.error("Failed to unpin message:", err);
      setActionError(err?.message || "Failed to unpin message");
    }
  }, [session, reload]);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const extra = messageId ? { highlightMessage: messageId } : undefined;
    go(Routes.chatSession(characterId!, session?.id || undefined, extra));
  }, [go, characterId, session?.id]);

  const handleAddNew = async () => {
    const trimmed = newMemory.trim();
    if (trimmed.length > 0) {
      setIsAdding(true);
      try {
        await handleAdd(trimmed);
        setNewMemory("");
        setActionError(null);
      } catch (err: any) {
        console.error("Failed to add memory:", err);
        setActionError(err?.message || "Failed to add memory");
      } finally {
        setIsAdding(false);
      }
    }
  };

  const startEdit = (index: number, text: string) => {
    setEditingIndex(index);
    setEditingValue(text);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValue("");
  };

  const saveEdit = async (index: number) => {
    const trimmed = editingValue.trim();
    if (trimmed.length > 0 && trimmed !== memoryItems[index]?.text) {
      try {
        await handleUpdate(index, trimmed);
        setEditingIndex(null);
        setEditingValue("");
        setActionError(null);
      } catch (err: any) {
        console.error("Failed to update memory:", err);
        setActionError(err?.message || "Failed to update memory");
      }
    } else {
      setEditingIndex(null);
      setEditingValue("");
    }
  };

  const handleSaveSummaryClick = async () => {
    if (summaryDraft === session?.memorySummary) return;
    setIsSavingSummary(true);
    try {
      await handleSaveSummary(summaryDraft);
    } catch (err: any) {
      console.error("Failed to save summary:", err);
      setActionError(err?.message || "Failed to save summary");
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleRetry = async () => {
    if (!session?.id) return;
    setRetryStatus("retrying");
    try {
      await storageBridge.retryDynamicMemory(session.id);
      await reload();
      setRetryStatus("success");
      setActionError(null);
      setTimeout(() => setRetryStatus("idle"), 3000);
    } catch (err: any) {
      console.error("Failed to retry memory processing:", err);
      setActionError(err?.message || "Failed to retry memory processing");
      setRetryStatus("idle");
    }
  };

  if (loading) {
    return (
      <div className={cn("flex h-screen items-center justify-center", colors.surface.base)}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      </div>
    );
  }

  if (error || !session || !character) {
    return (
      <div className={cn("flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center", colors.surface.base)}>
        <p className={cn("text-sm", colors.text.secondary)}>{error || "Session not found"}</p>
        <button
          onClick={() => backOrReplace(characterId ? Routes.chatSettings(characterId) : Routes.chat)}
          className={cn(
            components.button.primary,
            components.button.sizes.md,
            "bg-white/5 text-white hover:bg-white/10"
          )}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-screen flex-col", colors.surface.base, colors.text.primary)}>
      {/* Header */}
      <div className={cn(
        "border-b px-3 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 sticky top-0 z-20",
        colors.glass.strong
      )}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => backOrReplace(characterId ? Routes.chatSettings(characterId) : Routes.chat)}
            className={cn(
              "flex items-center justify-center",
              radius.full,
              "border bg-white/5",
              colors.border.subtle,
              colors.text.primary,
              interactive.hover.brightness,
              interactive.active.scale,
              interactive.focus.ring
            )}
            aria-label="Go back"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="flex-1 min-w-0">
            <div className={cn(typography.body.size, typography.body.weight, colors.text.primary, "truncate")}>
              {character.name}
            </div>
            <div className={cn(typography.caption.size, colors.text.tertiary, "flex items-center gap-2")}>
              <span>
                {stats.total} {stats.total === 1 ? 'memory' : 'memories'}
              </span>
              {stats.totalTokens > 0 && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="flex items-center gap-1">
                    {stats.totalTokens.toLocaleString()} tokens
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-16">
        {/* Error Banner */}
        {/* Status Banner (Error / Retry / Success) */}
        {(actionError || retryStatus !== "idle" || memoryStatus === "processing") && (
          <div className="px-3 pt-3">
            {(retryStatus === "retrying" || memoryStatus === "processing") ? (
              <div className={cn(
                radius.md,
                "bg-blue-500/10 border border-blue-500/20 p-3 flex items-center gap-3 animate-pulse"
              )}>
                <RefreshCw className="h-5 w-5 text-blue-400 shrink-0 animate-spin" />
                <div className="flex-1 text-sm text-blue-200">
                  <p className="font-semibold">
                    {memoryStatus === "processing" ? "AI is organizing memories..." : "Retrying Memory Cycle..."}
                  </p>
                </div>
              </div>
            ) : retryStatus === "success" ? (
              <div className={cn(
                radius.md,
                "bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-3"
              )}>
                <Check className="h-5 w-5 text-emerald-400 shrink-0" />
                <div className="flex-1 text-sm text-emerald-200">
                  <p className="font-semibold">Memory Cycle Processed Successfully!</p>
                </div>
                <button
                  onClick={() => setRetryStatus("idle")}
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  <X size={16} />
                </button>
              </div>
            ) : actionError ? (
              <div className={cn(
                radius.md,
                "bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-3"
              )}>
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                <div className="flex-1 text-sm text-red-200">
                  <p className="font-semibold mb-1">Memory System Error</p>
                  <p className="opacity-90">{actionError}</p>
                  {/* Retry Button for Memory Errors */}
                  {(actionError.toLowerCase().includes("status") || actionError.toLowerCase().includes("limit") || true) && (
                    <button
                      onClick={handleRetry}
                      className="mt-2 flex items-center gap-1.5 rounded-md bg-red-500/20 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/30 active:scale-95"
                    >
                      <RefreshCw size={12} />
                      Try Again
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setActionError(null)}
                  className="text-red-400 hover:text-red-300"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === "memories" ? (
          <div className={cn("px-3 py-4", spacing.section)}>

            {/* Context Summary */}
            {isDynamic && (
              <div>
                <h2 className={cn(
                  "mb-2 px-1",
                  typography.overline.size,
                  typography.overline.weight,
                  typography.overline.tracking,
                  typography.overline.transform,
                  "text-white/35"
                )}>
                  Context Summary
                </h2>
                <div className={cn(
                  "w-full px-4 py-3 text-left",
                  radius.md,
                  "border border-emerald-400/30 bg-emerald-400/10",
                  interactive.transition.default
                )}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-emerald-400" />
                      <span className={cn(typography.body.size, typography.body.weight, "text-emerald-100")}>
                        AI Summary
                      </span>
                      {session?.memorySummaryTokenCount && session.memorySummaryTokenCount > 0 && (
                        <span className={cn(
                          typography.caption.size,
                          "inline-flex items-center gap-1 px-2 py-0.5 ml-1",
                          radius.md,
                          "bg-emerald-400/20 text-emerald-200"
                        )}>
                          {session.memorySummaryTokenCount.toLocaleString()} tokens
                        </span>
                      )}
                    </div>
                    {summaryDraft !== session?.memorySummary && (
                      <button
                        onClick={handleSaveSummaryClick}
                        disabled={isSavingSummary}
                        className={cn(
                          typography.caption.size,
                          "font-medium text-emerald-300 hover:text-emerald-200 transition-colors disabled:opacity-50"
                        )}
                      >
                        {isSavingSummary ? "Saving..." : "Save"}
                      </button>
                    )}
                  </div>
                  <textarea
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    rows={4}
                    className={cn(
                      "w-full resize-none bg-transparent focus:outline-none",
                      typography.bodySmall.size,
                      "text-emerald-50/90",
                      "placeholder-emerald-200/30 leading-relaxed"
                    )}
                    placeholder="AI will generate a summary of the conversation context here..."
                  />
                </div>
              </div>
            )}

            {/* Memories Section */}
            <div>
              <h2 className={cn(
                "mb-2 px-1",
                typography.overline.size,
                typography.overline.weight,
                typography.overline.tracking,
                typography.overline.transform,
                "text-white/35"
              )}>
                Memories
              </h2>

              {/* Search Bar */}
              {memoryItems.length > 0 && (
                <div className="relative mb-3">
                  <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4", colors.text.tertiary)} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search memories..."
                    className={cn(
                      "w-full pl-10 pr-3 py-2.5",
                      radius.lg,
                      "border border-white/10 bg-black/20",
                      "text-sm text-white placeholder-white/40",
                      "focus:border-white/30 focus:outline-none",
                      interactive.transition.default
                    )}
                  />
                </div>
              )}

              {/* Add New Memory */}
              <div className={cn(
                "w-full px-4 py-3 text-left",
                radius.md,
                "border border-white/10 bg-white/5",
                interactive.transition.default,
                "pb-6 mb-4"
              )}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <textarea
                      value={newMemory}
                      onChange={(e) => setNewMemory(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddNew();
                        }
                      }}
                      placeholder="Add a new memory..."
                      rows={2}
                      className={cn(
                        "w-full resize-none bg-transparent focus:outline-none",
                        typography.bodySmall.size,
                        colors.text.primary,
                        "placeholder-white/40 leading-relaxed"
                      )}
                    />
                  </div>
                  <button
                    onClick={handleAddNew}
                    disabled={!newMemory.trim() || isAdding}
                    className={cn(
                      "flex items-center justify-center shrink-0",
                      radius.md,
                      "border border-emerald-400/40 bg-emerald-500/20 text-emerald-100",
                      "hover:bg-emerald-500/30 disabled:opacity-30 disabled:pointer-events-none",
                      interactive.transition.default,
                      interactive.active.scale
                    )}
                  >
                    {isAdding ? (
                      <div className="animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
                    ) : (
                      <Plus size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="h-3" aria-hidden />

              {/* Memory List */}
              {filteredMemories.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center">
                  {searchTerm ? (
                    <Search className="mb-3 h-12 w-12 text-white/20" />
                  ) : (
                    <Bot className="mb-3 h-12 w-12 text-white/20" />
                  )}
                  <h3 className="mb-1 text-lg font-medium text-white">
                    {searchTerm ? "No matching memories" : "No memories yet"}
                  </h3>
                  {!searchTerm && (
                    <p className="text-center text-sm text-white/50">
                      Add your first memory above
                    </p>
                  )}
                </div>
              ) : (
                <div className={spacing.field}>
                  {filteredMemories.map((item) => (
                    <div
                      key={item.index}
                      className={cn(
                        "w-full px-4 py-3",
                        radius.md,
                        "border border-white/10 bg-white/5",
                        interactive.transition.default
                      )}
                    >
                      {/* Metadata Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isDynamic ? (
                            item.isCold ? (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-[10px] font-medium text-blue-200 uppercase tracking-wider">
                                <Snowflake size={10} />
                                Cold
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-[10px] font-medium text-amber-200 uppercase tracking-wider">
                                <Flame size={10} />
                                Hot ({item.importanceScore.toFixed(2)})
                              </div>
                            )
                          ) : null}
                          {item.isPinned && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-500/20 border border-pink-500/30 text-[10px] font-medium text-pink-200 uppercase tracking-wider">
                              <Pin size={10} />
                              Pinned
                            </div>
                          )}
                        </div>
                        {item.createdAt > 0 && (
                          <div className="flex items-center gap-3 text-[10px] text-white/30 font-medium">
                            {item.cycle && (
                              <span className="flex items-center gap-1" title="Creation Cycle">
                                <RefreshCw size={10} />
                                Cycle {item.cycle}
                              </span>
                            )}
                            {item.lastAccessedAt > 0 && (
                              <span title="Last Accessed">
                                Accessed {new Date(item.lastAccessedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {editingIndex === item.index ? (
                        <div className={spacing.field}>
                          <textarea
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            rows={3}
                            className={cn(
                              "w-full p-3",
                              radius.lg,
                              "border border-white/10 bg-black/20",
                              "text-sm text-white resize-none",
                              "focus:border-white/30 focus:outline-none"
                            )}
                            autoFocus
                          />
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={cancelEdit}
                              className={cn(
                                "flex-1 px-4 py-2",
                                radius.lg,
                                "border border-white/10 bg-white/5",
                                "text-sm font-medium text-white/70",
                                "transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                              )}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(item.index)}
                              className={cn(
                                "flex-1 px-4 py-2",
                                radius.lg,
                                "border border-emerald-400/40 bg-emerald-500/20",
                                "text-sm font-semibold text-emerald-100",
                                "transition hover:border-emerald-400/60 hover:bg-emerald-500/30"
                              )}
                            >
                              <Check size={14} className="mr-1.5 inline" />
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center",
                              radius.full,
                              "border text-white/70",
                              interactive.transition.default,
                              item.isAi
                                ? "border-blue-400/30 bg-blue-400/10"
                                : "border-emerald-400/30 bg-emerald-400/10"
                            )}>
                              {item.isAi ? (
                                <Bot className="h-4 w-4 text-blue-400" />
                              ) : (
                                <User className="h-4 w-4 text-emerald-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                typography.bodySmall.size,
                                colors.text.secondary,
                                "leading-relaxed wrap-break-word"
                              )}>
                                {item.text}
                              </p>
                              {item.tokenCount > 0 && (
                                <div className="mt-1.5">
                                  <span className={cn(
                                    typography.caption.size,
                                    "inline-flex items-center gap-1 px-2 py-0.5",
                                    radius.md,
                                    "bg-white/5 text-white/50"
                                  )}>
                                    {item.tokenCount.toLocaleString()} tokens
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-3 pl-11">
                            <button
                              onClick={() => startEdit(item.index, item.text)}
                              className={cn(
                                typography.caption.size,
                                "font-medium flex items-center gap-1.5",
                                colors.text.tertiary,
                                "hover:text-white transition-colors"
                              )}
                            >
                              <Edit2 size={12} />
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await handleRemove(item.index);
                                  setActionError(null);
                                } catch (err: any) {
                                  console.error("Failed to remove memory:", err);
                                  setActionError(err?.message || "Failed to remove memory");
                                }
                              }}
                              className={cn(
                                typography.caption.size,
                                "font-medium flex items-center gap-1.5",
                                colors.text.tertiary,
                                "hover:text-red-400 transition-colors"
                              )}
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : activeTab === "tools" ? (
          <div className={cn("px-3 py-4", spacing.section)}>
            <div>
              <h2 className={cn(
                "mb-2 px-1",
                typography.overline.size,
                typography.overline.weight,
                typography.overline.tracking,
                typography.overline.transform,
                "text-white/35"
              )}>
                Activity Log
              </h2>
              <p className={cn(typography.caption.size, colors.text.tertiary, "mb-3 px-1")}>
                History of AI memory operations
              </p>
            </div>
            <ToolLog events={(session.memoryToolEvents as MemoryToolEvent[]) || []} />
          </div>
        ) : (
          <div className={cn("px-3 py-4", spacing.section)}>
            <div>
              <h2 className={cn(
                "mb-2 px-1",
                typography.overline.size,
                typography.overline.weight,
                typography.overline.tracking,
                typography.overline.transform,
                "text-white/35"
              )}>
                Pinned Messages
              </h2>
              <p className={cn(typography.caption.size, colors.text.tertiary, "mb-3 px-1")}>
                Messages that are always included in context
              </p>
            </div>
            {pinnedMessages.length === 0 ? (
              <div className={cn(
                components.card.base,
                "px-6 py-8 text-center"
              )}>
                <Pin className="mx-auto mb-3 h-12 w-12 text-white/20" />
                <h3 className="mb-1 text-lg font-medium text-white">
                  No pinned messages
                </h3>
                <p className="text-center text-sm text-white/50">
                  Pin important messages from the chat to always include them in the AI's context
                </p>
              </div>
            ) : (
              <div className={cn(spacing.field)}>
                {pinnedMessages.map((msg) => {
                  const isUser = msg.role === "user";
                  const isAssistant = msg.role === "assistant";
                  const timestamp = new Date(msg.createdAt).toLocaleString();

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "w-full px-4 py-3",
                        radius.md,
                        "border bg-white/5",
                        isUser ? "border-emerald-400/30" : isAssistant ? "border-blue-400/30" : "border-white/10",
                        interactive.transition.default
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center",
                          radius.full,
                          "border text-white/70",
                          interactive.transition.default,
                          isUser
                            ? "border-emerald-400/30 bg-emerald-400/10"
                            : isAssistant
                              ? "border-blue-400/30 bg-blue-400/10"
                              : "border-white/10 bg-white/5"
                        )}>
                          {isUser ? (
                            <User className="h-4 w-4 text-emerald-400" />
                          ) : isAssistant ? (
                            <Bot className="h-4 w-4 text-blue-400" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-white/60" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              typography.caption.size,
                              "font-semibold uppercase tracking-wide",
                              isUser ? "text-emerald-400" : isAssistant ? "text-blue-400" : colors.text.tertiary
                            )}>
                              {isUser ? "User" : isAssistant ? "Assistant" : msg.role}
                            </span>
                            <span className={cn(typography.caption.size, colors.text.disabled)}>
                              {timestamp}
                            </span>
                          </div>
                          <p className={cn(
                            typography.bodySmall.size,
                            colors.text.secondary,
                            "leading-relaxed wrap-break-word whitespace-pre-wrap"
                          )}>
                            {msg.content}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 pl-11">
                        <button
                          onClick={() => handleScrollToMessage(msg.id)}
                          className={cn(
                            typography.caption.size,
                            "font-medium flex items-center gap-1.5",
                            colors.text.tertiary,
                            "hover:text-white transition-colors"
                          )}
                        >
                          <MessageSquare size={12} />
                          Scroll to message
                        </button>
                        <button
                          onClick={() => handleUnpin(msg.id)}
                          className={cn(
                            typography.caption.size,
                            "font-medium flex items-center gap-1.5",
                            colors.text.tertiary,
                            "hover:text-amber-400 transition-colors"
                          )}
                        >
                          <Pin size={12} />
                          Unpin
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Tab Bar */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 border-t px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3",
        colors.glass.strong
      )}>
        <div className={cn(
          radius.lg,
          "grid grid-cols-3 gap-2 p-1",
          colors.surface.elevated
        )}>
          {[
            { id: "memories" as const, icon: Bot, label: "Memories" },
            { id: "pinned" as const, icon: Pin, label: "Pinned" },
            { id: "tools" as const, icon: Clock, label: "Activity" }
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                radius.md,
                "px-3 py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2",
                interactive.active.scale,
                activeTab === id
                  ? "bg-white/10 text-white"
                  : cn(colors.text.tertiary, "hover:text-white")
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
