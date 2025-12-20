import { useEffect, useMemo, useReducer, useState, useCallback } from "react";
import type { ComponentType, ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Sparkles, Clock, ChevronDown, ChevronUp, Search, Bot, User, Trash2, Edit2, Check, Plus, Pin, MessageSquare, AlertTriangle, X, RefreshCw, Snowflake, Flame } from "lucide-react";
import type { Character, Session, StoredMessage } from "../../../core/storage/schemas";
import { addMemory, removeMemory, updateMemory, getSessionMeta, listPinnedMessages, listSessionPreviews, listCharacters, saveSession, setMemoryColdState, toggleMessagePin, toggleMemoryPin } from "../../../core/storage/repo";

import { storageBridge } from "../../../core/storage/files";
import { typography, radius, cn, interactive, spacing, colors, components } from "../../design-tokens";
import { Routes, useNavigationManager } from "../../navigation";

type MemoryToolEvent = NonNullable<Session["memoryToolEvents"]>[number];

type MemoriesTab = "memories" | "tools" | "pinned";
type RetryStatus = "idle" | "retrying" | "success";
type MemoryStatus = "idle" | "processing" | "failed";

type UiState = {
  activeTab: MemoriesTab;
  searchTerm: string;
  editingIndex: number | null;
  editingValue: string;
  newMemory: string;
  isAdding: boolean;
  summaryDraft: string;
  summaryDirty: boolean;
  isSavingSummary: boolean;
  retryStatus: RetryStatus;
  actionError: string | null;
  memoryStatus: MemoryStatus;
  expandedMemories: Set<number>;
  memoryTempBusy: number | null;
  pendingRefresh: boolean;
};

type UiAction =
  | { type: "SET_TAB"; tab: MemoriesTab }
  | { type: "SET_SEARCH"; value: string }
  | { type: "CLEAR_SEARCH" }
  | { type: "START_EDIT"; index: number; text: string }
  | { type: "SET_EDIT_VALUE"; value: string }
  | { type: "CANCEL_EDIT" }
  | { type: "SET_NEW_MEMORY"; value: string }
  | { type: "SET_IS_ADDING"; value: boolean }
  | { type: "SET_SUMMARY_DRAFT"; value: string }
  | { type: "SYNC_SUMMARY_FROM_SESSION"; value: string }
  | { type: "SET_IS_SAVING_SUMMARY"; value: boolean }
  | { type: "MARK_SUMMARY_SAVED" }
  | { type: "SET_RETRY_STATUS"; value: RetryStatus }
  | { type: "SET_ACTION_ERROR"; value: string | null }
  | { type: "SET_MEMORY_STATUS"; value: MemoryStatus }
  | { type: "TOGGLE_EXPANDED"; index: number }
  | { type: "SHIFT_EXPANDED_AFTER_DELETE"; index: number }
  | { type: "SET_MEMORY_TEMP_BUSY"; value: number | null }
  | { type: "SET_PENDING_REFRESH"; value: boolean };

function initUi(errorParam: string | null): UiState {
  return {
    activeTab: "memories",
    searchTerm: "",
    editingIndex: null,
    editingValue: "",
    newMemory: "",
    isAdding: false,
    summaryDraft: "",
    summaryDirty: false,
    isSavingSummary: false,
    retryStatus: "idle",
    actionError: errorParam,
    memoryStatus: "idle",
    expandedMemories: new Set<number>(),
    memoryTempBusy: null,
    pendingRefresh: false,
  };
}

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_SEARCH":
      return { ...state, searchTerm: action.value };
    case "CLEAR_SEARCH":
      return { ...state, searchTerm: "" };
    case "START_EDIT":
      return { ...state, editingIndex: action.index, editingValue: action.text };
    case "SET_EDIT_VALUE":
      return { ...state, editingValue: action.value };
    case "CANCEL_EDIT":
      return { ...state, editingIndex: null, editingValue: "" };
    case "SET_NEW_MEMORY":
      return { ...state, newMemory: action.value };
    case "SET_IS_ADDING":
      return { ...state, isAdding: action.value };
    case "SET_SUMMARY_DRAFT":
      return { ...state, summaryDraft: action.value, summaryDirty: true };
    case "SYNC_SUMMARY_FROM_SESSION":
      if (state.summaryDirty) return state;
      return { ...state, summaryDraft: action.value };
    case "SET_IS_SAVING_SUMMARY":
      return { ...state, isSavingSummary: action.value };
    case "MARK_SUMMARY_SAVED":
      return { ...state, summaryDirty: false, isSavingSummary: false };
    case "SET_RETRY_STATUS":
      return { ...state, retryStatus: action.value };
    case "SET_ACTION_ERROR":
      return { ...state, actionError: action.value };
    case "SET_MEMORY_STATUS":
      return { ...state, memoryStatus: action.value };
    case "TOGGLE_EXPANDED": {
      const next = new Set(state.expandedMemories);
      if (next.has(action.index)) next.delete(action.index);
      else next.add(action.index);
      return { ...state, expandedMemories: next };
    }
    case "SHIFT_EXPANDED_AFTER_DELETE": {
      if (state.expandedMemories.size === 0) return state;
      const next = new Set<number>();
      for (const idx of state.expandedMemories) {
        if (idx === action.index) continue;
        next.add(idx > action.index ? idx - 1 : idx);
      }
      return { ...state, expandedMemories: next };
    }
    case "SET_MEMORY_TEMP_BUSY":
      return { ...state, memoryTempBusy: action.value };
    case "SET_PENDING_REFRESH":
      return { ...state, pendingRefresh: action.value };
    default:
      return state;
  }
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  right,
}: {
  icon?: ComponentType<{ size?: string | number; className?: string }>;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {Icon ? <Icon size={16} className="text-white/40" /> : null}
          <h2 className={cn(typography.h2.size, typography.h2.weight, colors.text.primary, "truncate")}>
            {title}
          </h2>
        </div>
        {subtitle ? (
          <p className={cn(typography.bodySmall.size, colors.text.tertiary, "mt-0.5 truncate")}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function useSessionData(characterId?: string, requestedSessionId?: string | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<StoredMessage[]>([]);
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
        targetSession = await getSessionMeta(requestedSessionId).catch(() => null);
      }

      if (!targetSession) {
        const previews = await listSessionPreviews(characterId, 1).catch(() => []);
        const latestId = previews[0]?.id;
        targetSession = latestId ? await getSessionMeta(latestId).catch(() => null) : null;
      }

      if (targetSession) {
        setSession(targetSession);
        const pinned = await listPinnedMessages(targetSession.id).catch(() => [] as StoredMessage[]);
        setPinnedMessages(pinned);
      } else {
        setError("Session not found");
        setPinnedMessages([]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load session");
      setPinnedMessages([]);
    } finally {
      setLoading(false);
    }
  }, [characterId, requestedSessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { session, setSession, pinnedMessages, setPinnedMessages, character, loading, error, reload: load };
}

function useMemoryActions(session: Session | null, setSession: (s: Session) => void) {
  const handleAdd = useCallback(async (memory: string) => {
    if (!session) return;

    try {
      const updated = await addMemory(session.id, memory);
      if (updated) setSession(updated);
    } catch (err: any) {
      throw err;
    }
  }, [session, setSession]);

  const handleRemove = useCallback(async (index: number) => {
    if (!session) return;

    try {
      const updated = await removeMemory(session.id, index);
      if (updated) setSession(updated);
    } catch (err: any) {
      throw err;
    }
  }, [session, setSession]);

  const handleUpdate = useCallback(async (index: number, memory: string) => {
    if (!session) return;

    try {
      const updated = await updateMemory(session.id, index, memory);
      if (updated) setSession(updated);
    } catch (err: any) {
      throw err;
    }
  }, [session, setSession]);

  const handleSaveSummary = useCallback(async (summary: string) => {
    if (!session) return;

    try {
      const updated: Session = { ...session, memorySummary: summary };
      await saveSession(updated);
      setSession(updated);
    } catch (err: any) {
      throw err;
    }
  }, [session, setSession]);

  const handleTogglePin = useCallback(async (index: number) => {
    if (!session) return;

    try {
      const updated = await toggleMemoryPin(session.id, index);
      if (updated) setSession(updated);
    } catch (err: any) {
      throw err;
    }
  }, [session, setSession]);

  return { handleAdd, handleRemove, handleUpdate, handleSaveSummary, handleTogglePin };
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
                "px-3 py-2",
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
  const { session, setSession, pinnedMessages, setPinnedMessages, character, loading, error, reload } = useSessionData(characterId, sessionId);
  const { handleAdd, handleRemove, handleUpdate, handleSaveSummary, handleTogglePin } = useMemoryActions(session, (s) => setSession(s));
  const [ui, dispatch] = useReducer(uiReducer, searchParams.get("error"), initUi);

  const handleSetColdState = useCallback(async (memoryIndex: number, isCold: boolean) => {
    if (!session?.id) return;
    dispatch({ type: "SET_MEMORY_TEMP_BUSY", value: memoryIndex });
    try {
      const updated = await setMemoryColdState(session.id, memoryIndex, isCold);
      if (updated) setSession(updated);
      dispatch({ type: "SET_ACTION_ERROR", value: null });
    } catch (err: any) {
      console.error("Failed to update memory temperature:", err);
      dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to update memory temperature" });
    } finally {
      dispatch({ type: "SET_MEMORY_TEMP_BUSY", value: null });
    }
  }, [session?.id, setSession]);

  useEffect(() => {
    if (!session?.id) return;
    let unlisteners: (() => void)[] = [];

    const setup = async () => {
      try {
        const u1 = await listen("dynamic-memory:processing", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            dispatch({ type: "SET_MEMORY_STATUS", value: "processing" });
            dispatch({ type: "SET_ACTION_ERROR", value: null });
            dispatch({ type: "SET_PENDING_REFRESH", value: false });
          }
        });
        const u2 = await listen("dynamic-memory:success", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            dispatch({ type: "SET_MEMORY_STATUS", value: "idle" });
            dispatch({ type: "SET_PENDING_REFRESH", value: true });
          }
        });
        const u3 = await listen("dynamic-memory:error", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            dispatch({ type: "SET_MEMORY_STATUS", value: "failed" });
            dispatch({ type: "SET_ACTION_ERROR", value: e.payload?.error || "Memory processing failed" });
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
  }, [session?.id]);

  useEffect(() => {
    dispatch({ type: "SYNC_SUMMARY_FROM_SESSION", value: session?.memorySummary ?? "" });
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
    if (!ui.searchTerm.trim()) return memoryItems;
    return memoryItems.filter(item =>
      item.text.toLowerCase().includes(ui.searchTerm.toLowerCase())
    );
  }, [memoryItems, ui.searchTerm]);

  const stats = useMemo(() => {
    const total = memoryItems.length;
    const ai = memoryItems.filter(m => m.isAi).length;
    const user = total - ai;
    const totalMemoryTokens = memoryItems.reduce((sum, m) => sum + m.tokenCount, 0);
    const summaryTokens = session?.memorySummaryTokenCount || 0;
    const totalTokens = totalMemoryTokens + summaryTokens;
    return { total, ai, user, totalMemoryTokens, summaryTokens, totalTokens };
  }, [memoryItems, session?.memorySummaryTokenCount]);

  const refreshPinnedMessages = useCallback(async () => {
    if (!session?.id) return;
    const pinned = await listPinnedMessages(session.id).catch(() => [] as StoredMessage[]);
    setPinnedMessages(pinned);
  }, [session?.id, setPinnedMessages]);

  const handleUnpin = useCallback(async (messageId: string) => {
    if (!session) return;
    try {
      await toggleMessagePin(session.id, messageId);
      await refreshPinnedMessages();
      dispatch({ type: "SET_ACTION_ERROR", value: null });
    } catch (err: any) {
      console.error("Failed to unpin message:", err);
      dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to unpin message" });
    }
  }, [session, refreshPinnedMessages]);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const extra = messageId ? { jumpToMessage: messageId } : undefined;
    go(Routes.chatSession(characterId!, session?.id || undefined, extra));
  }, [go, characterId, session?.id]);

  const handleAddNew = useCallback(async () => {
    const trimmed = ui.newMemory.trim();
    if (!trimmed) return;

    dispatch({ type: "SET_IS_ADDING", value: true });
    try {
      await handleAdd(trimmed);
      dispatch({ type: "SET_NEW_MEMORY", value: "" });
      dispatch({ type: "SET_ACTION_ERROR", value: null });
    } catch (err: any) {
      console.error("Failed to add memory:", err);
      dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to add memory" });
    } finally {
      dispatch({ type: "SET_IS_ADDING", value: false });
    }
  }, [handleAdd, ui.newMemory]);

  const startEdit = useCallback((index: number, text: string) => {
    dispatch({ type: "START_EDIT", index, text });
  }, []);

  const cancelEdit = useCallback(() => {
    dispatch({ type: "CANCEL_EDIT" });
  }, []);

  const saveEdit = useCallback(async (index: number) => {
    const trimmed = ui.editingValue.trim();
    if (!trimmed || trimmed === memoryItems[index]?.text) {
      dispatch({ type: "CANCEL_EDIT" });
      return;
    }
    try {
      await handleUpdate(index, trimmed);
      dispatch({ type: "CANCEL_EDIT" });
      dispatch({ type: "SET_ACTION_ERROR", value: null });
    } catch (err: any) {
      console.error("Failed to update memory:", err);
      dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to update memory" });
    }
  }, [handleUpdate, memoryItems, ui.editingValue]);

  const handleSaveSummaryClick = useCallback(async () => {
    if (ui.summaryDraft === session?.memorySummary) return;
    dispatch({ type: "SET_IS_SAVING_SUMMARY", value: true });
    try {
      await handleSaveSummary(ui.summaryDraft);
      dispatch({ type: "MARK_SUMMARY_SAVED" });
    } catch (err: any) {
      console.error("Failed to save summary:", err);
      dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to save summary" });
      dispatch({ type: "SET_IS_SAVING_SUMMARY", value: false });
    }
  }, [handleSaveSummary, session?.memorySummary, ui.summaryDraft]);

  const handleRetry = useCallback(async () => {
    if (!session?.id) return;
    dispatch({ type: "SET_RETRY_STATUS", value: "retrying" });
    try {
      await storageBridge.retryDynamicMemory(session.id);
      dispatch({ type: "SET_RETRY_STATUS", value: "success" });
      dispatch({ type: "SET_ACTION_ERROR", value: null });
      dispatch({ type: "SET_PENDING_REFRESH", value: true });
      window.setTimeout(() => dispatch({ type: "SET_RETRY_STATUS", value: "idle" }), 3000);
    } catch (err: any) {
      console.error("Failed to retry memory processing:", err);
      dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to retry memory processing" });
      dispatch({ type: "SET_RETRY_STATUS", value: "idle" });
    }
  }, [session?.id]);

  const handleRefresh = useCallback(async () => {
    if (!session?.id) return;
    try {
      await reload();
      dispatch({ type: "SET_PENDING_REFRESH", value: false });
      dispatch({ type: "SET_ACTION_ERROR", value: null });
    } catch (err: any) {
      dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to refresh" });
    }
  }, [reload, session?.id]);

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
          onClick={() => backOrReplace(characterId ? Routes.chatSession(characterId, sessionId) : Routes.chat)}
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
      <header className={cn("border-b border-white/10 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 sticky top-0 z-20", "bg-[#050505]")}>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center min-w-0">
            <button
              onClick={() => backOrReplace(characterId ? Routes.chatSession(characterId, sessionId) : Routes.chat)}
              className="flex shrink-0 items-center justify-center -ml-2 text-white transition hover:text-white/80"
              aria-label="Go back"
            >
              <ArrowLeft size={14} strokeWidth={2.5} />
            </button>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xl font-bold text-white/90">Memories</p>
              <p className="mt-0.5 truncate text-xs text-white/50">{character.name}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 ml-auto">
            {ui.memoryStatus === "processing" && (
              <div className={cn(
                radius.full,
                "border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
                "border-blue-500/30 bg-blue-500/15 text-blue-200"
              )}>
                Processing
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={cn(
            radius.full,
            "border px-2 py-1",
            colors.border.subtle,
            "bg-white/5",
            typography.caption.size,
            colors.text.secondary
          )}>
            {stats.total} {stats.total === 1 ? "memory" : "memories"}
          </span>
          <span className={cn(
            radius.full,
            "border px-2 py-1",
            colors.border.subtle,
            "bg-white/5",
            typography.caption.size,
            colors.text.secondary
          )}>
            {stats.totalTokens.toLocaleString()} tokens
          </span>
          {isDynamic && (
            <span className={cn(
              radius.full,
              "border px-2 py-1",
              "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
              typography.caption.size
            )}>
              Dynamic
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+96px)]">
        {/* Error Banner */}
        {(ui.actionError || ui.retryStatus !== "idle" || ui.memoryStatus === "processing") && (
          <div className="px-3 pt-3">
            {(ui.retryStatus === "retrying" || ui.memoryStatus === "processing") ? (
              <div className={cn(
                radius.md,
                "bg-blue-500/10 border border-blue-500/20 p-3 flex items-center gap-3 animate-pulse"
              )}>
                <RefreshCw className="h-5 w-5 text-blue-400 shrink-0 animate-spin" />
                <div className="flex-1 text-sm text-blue-200">
                  <p className="font-semibold">
                    {ui.memoryStatus === "processing" ? "AI is organizing memories..." : "Retrying Memory Cycle..."}
                  </p>
                </div>
              </div>
            ) : ui.retryStatus === "success" ? (
              <div className={cn(
                radius.md,
                "bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-3"
              )}>
                <Check className="h-5 w-5 text-emerald-400 shrink-0" />
                <div className="flex-1 text-sm text-emerald-200">
                  <p className="font-semibold">Memory Cycle Processed Successfully!</p>
                </div>
                <button
                  onClick={() => dispatch({ type: "SET_RETRY_STATUS", value: "idle" })}
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  <X size={16} />
                </button>
              </div>
            ) : ui.actionError ? (
              <div className={cn(
                radius.md,
                "bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-3"
              )}>
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                <div className="flex-1 text-sm text-red-200">
                  <p className="font-semibold mb-1">Memory System Error</p>
                  <p className="opacity-90">{ui.actionError}</p>
                  {(ui.actionError.toLowerCase().includes("status") || ui.actionError.toLowerCase().includes("limit") || true) && (
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
                  onClick={() => dispatch({ type: "SET_ACTION_ERROR", value: null })}
                  className="text-red-400 hover:text-red-300"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
          </div>
        )}

        {ui.pendingRefresh && ui.memoryStatus !== "processing" && (
          <div className="px-3 pt-3">
            <div className={cn(
              radius.md,
              "bg-white/5 border border-white/10 p-3 flex items-center justify-between gap-3"
            )}>
              <div className={cn(typography.bodySmall.size, colors.text.secondary)}>
                New memory updates available
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                className={cn(
                  typography.caption.size,
                  "font-semibold px-3 py-1",
                  radius.full,
                  "border border-white/15 bg-white/10 text-white/80",
                  interactive.transition.fast,
                  interactive.active.scale
                )}
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {ui.activeTab === "memories" ? (
          <div className={cn("px-3 py-4", "space-y-5")}>

            {/* Context Summary */}
            {isDynamic && (
              <div>
                <SectionHeader
                  icon={Sparkles}
                  title="Context Summary"
                  subtitle="Short recap used to keep context consistent"
                  right={
                    <div className="flex items-center gap-2">
                      {session?.memorySummaryTokenCount && session.memorySummaryTokenCount > 0 ? (
                        <span className={cn(
                          typography.caption.size,
                          "inline-flex items-center gap-1 px-2 py-0.5",
                          radius.full,
                          "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                        )}>
                          {session.memorySummaryTokenCount.toLocaleString()} tokens
                        </span>
                      ) : null}
                      {ui.summaryDraft !== session?.memorySummary ? (
                        <button
                          onClick={handleSaveSummaryClick}
                          disabled={ui.isSavingSummary}
                          className={cn(
                            typography.caption.size,
                            "font-semibold px-3 py-1",
                            radius.full,
                            "border border-emerald-400/30 bg-emerald-400/15 text-emerald-200",
                            "disabled:opacity-50",
                            interactive.transition.fast,
                            interactive.active.scale
                          )}
                        >
                          {ui.isSavingSummary ? "Saving..." : "Save"}
                        </button>
                      ) : null}
                    </div>
                  }
                />
                <div className={cn(
                  components.card.base,
                  "border-emerald-400/20 bg-emerald-400/5",
                  "w-full p-4 text-left"
                )}>
                  <textarea
                    value={ui.summaryDraft}
                    onChange={(e) => dispatch({ type: "SET_SUMMARY_DRAFT", value: e.target.value })}
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
              <SectionHeader
                icon={Bot}
                title={ui.searchTerm.trim() ? `Results (${filteredMemories.length})` : "Saved Memories"}
                subtitle={ui.searchTerm.trim() ? "Filtered by your search" : "Create, search, edit, and delete memories"}
                right={
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      typography.caption.size,
                      "inline-flex items-center gap-1 px-2 py-0.5",
                      radius.full,
                      "border bg-white/5",
                      colors.border.subtle,
                      colors.text.secondary
                    )}>
                      AI {stats.ai}
                    </span>
                    <span className={cn(
                      typography.caption.size,
                      "inline-flex items-center gap-1 px-2 py-0.5",
                      radius.full,
                      "border bg-white/5",
                      colors.border.subtle,
                      colors.text.secondary
                    )}>
                      You {stats.user}
                    </span>
                  </div>
                }
              />

              {/* Search Bar */}
              {memoryItems.length > 0 && (
                <div className="relative mb-3">
                  <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4", colors.text.tertiary)} />
                  <input
                    type="text"
                    value={ui.searchTerm}
                    onChange={(e) => dispatch({ type: "SET_SEARCH", value: e.target.value })}
                    placeholder="Search memories..."
                    className={cn(
                      "w-full pl-10 pr-10 py-2.5",
                      components.input.base,
                      radius.lg,
                      "text-sm text-white placeholder-white/40"
                    )}
                  />
                  {ui.searchTerm.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "CLEAR_SEARCH" })}
                      className={cn(
                        "absolute right-3 top-1/2 -translate-y-1/2",
                        colors.text.tertiary,
                        "hover:text-white",
                        interactive.transition.fast
                      )}
                      aria-label="Clear search"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              )}

              {/* Add New Memory */}
              <div className={cn(
                components.card.base,
                "w-full p-4 text-left",
                interactive.transition.default,
                "mb-4"
              )}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <textarea
                      value={ui.newMemory}
                      onChange={(e) => dispatch({ type: "SET_NEW_MEMORY", value: e.target.value })}
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
                    disabled={!ui.newMemory.trim() || ui.isAdding}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center shrink-0",
                      radius.md,
                      "border border-emerald-400/40 bg-emerald-500/20 text-emerald-100",
                      "hover:bg-emerald-500/30 disabled:opacity-30 disabled:pointer-events-none",
                      interactive.transition.default,
                      interactive.active.scale
                    )}
                    aria-label="Add memory"
                  >
                    {ui.isAdding ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
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
                  {ui.searchTerm ? (
                    <Search className="mb-3 h-12 w-12 text-white/20" />
                  ) : (
                    <Bot className="mb-3 h-12 w-12 text-white/20" />
                  )}
                  <h3 className="mb-1 text-lg font-medium text-white">
                    {ui.searchTerm ? "No matching memories" : "No memories yet"}
                  </h3>
                  {!ui.searchTerm && (
                    <p className="text-center text-sm text-white/50">
                      Add your first memory above
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMemories.map((item) => {
                    const expanded = ui.expandedMemories.has(item.index);
                    const isEditing = ui.editingIndex === item.index;

                    return (
                      <div
                        key={item.index}
                        className={cn(
                          "group relative overflow-hidden rounded-xl",
                          "border transition-all duration-200",
                          isEditing
                            ? "border-white/20 bg-white/3"
                            : expanded
                              ? "border-white/10 bg-white/2"
                              : "border-white/6 bg-white/2 hover:border-white/10 hover:bg-white/3"
                        )}
                      >
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-[3px]",
                          item.isAi ? "bg-blue-400/60" : "bg-emerald-400/60"
                        )} />

                        <div
                          className={cn(
                            "pl-5 pr-4 py-4",
                            !isEditing && "cursor-pointer"
                          )}
                          onClick={() => {
                            if (isEditing) return;
                            dispatch({ type: "TOGGLE_EXPANDED", index: item.index });
                          }}
                          role={isEditing ? undefined : "button"}
                          tabIndex={isEditing ? undefined : 0}
                          onKeyDown={(e) => {
                            if (isEditing) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              dispatch({ type: "TOGGLE_EXPANDED", index: item.index });
                            }
                          }}
                        >
                          {isEditing ? (
                            /* Edit Mode */
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                {item.isAi ? (
                                  <Bot className="h-4 w-4 text-blue-400" />
                                ) : (
                                  <User className="h-4 w-4 text-emerald-400" />
                                )}
                                <span className={cn(
                                  "text-xs font-semibold uppercase tracking-wider",
                                  item.isAi ? "text-blue-400" : "text-emerald-400"
                                )}>
                                  Editing {item.isAi ? "AI Memory" : "Your Note"}
                                </span>
                              </div>
                              <textarea
                                value={ui.editingValue}
                                onChange={(e) => dispatch({ type: "SET_EDIT_VALUE", value: e.target.value })}
                                rows={4}
                                className={cn(
                                  "w-full p-3",
                                  radius.lg,
                                  "border border-white/10 bg-black/30",
                                  "text-sm text-white/90 resize-none leading-relaxed",
                                  "focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10",
                                  "placeholder:text-white/30"
                                )}
                                placeholder="Enter memory content..."
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={cancelEdit}
                                  className={cn(
                                    "flex-1 px-4 py-2.5",
                                    radius.lg,
                                    "border border-white/10 bg-white/5",
                                    "text-sm font-medium text-white/60",
                                    "transition-all hover:border-white/15 hover:bg-white/8 hover:text-white/80",
                                    "active:scale-[0.98]"
                                  )}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => saveEdit(item.index)}
                                  className={cn(
                                    "flex-1 px-4 py-2.5 flex items-center justify-center gap-2",
                                    radius.lg,
                                    "border border-emerald-400/30 bg-emerald-500/15",
                                    "text-sm font-semibold text-emerald-200",
                                    "transition-all hover:border-emerald-400/50 hover:bg-emerald-500/25",
                                    "active:scale-[0.98]"
                                  )}
                                >
                                  <Check size={14} />
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* View Mode */
                            <div className="space-y-3">
                              {/* Header Row */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {item.isAi ? (
                                    <Bot className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                  ) : (
                                    <User className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                  )}
                                  <span className={cn(
                                    "text-[11px] font-semibold uppercase tracking-wider",
                                    item.isAi ? "text-blue-400/90" : "text-emerald-400/90"
                                  )}>
                                    {item.isAi ? "AI Memory" : "Your Note"}
                                  </span>

                                  {/* Status badges */}
                                  {isDynamic && (
                                    item.isCold ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-300/80 border border-blue-500/20">
                                        Cold
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-300/80 border border-amber-500/20">
                                        Hot {item.importanceScore.toFixed(1)}
                                      </span>
                                    )
                                  )}
                                  {item.isPinned && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-pink-500/10 text-pink-300/80 border border-pink-500/20">
                                      <Pin size={8} />
                                      Pinned
                                    </span>
                                  )}
                                </div>

                                {/* Action Buttons */}
                                <div className={cn(
                                  "flex items-center gap-1.5 shrink-0",
                                  "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                )}>
                                  {isDynamic && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleSetColdState(item.index, !item.isCold);
                                      }}
                                      disabled={ui.memoryTempBusy === item.index}
                                      className={cn(
                                        "flex items-center justify-center",
                                        radius.lg,
                                        item.isCold
                                          ? "bg-blue-500/15 text-blue-300/90"
                                          : "bg-amber-500/15 text-amber-300/90",
                                        "transition-all hover:bg-white/10 hover:text-white/80",
                                        "disabled:opacity-60 disabled:pointer-events-none",
                                        "active:scale-95"
                                      )}
                                      aria-label={item.isCold ? "Mark memory as hot" : "Mark memory as cold"}
                                      title={item.isCold ? "Set hot" : "Set cold"}
                                    >
                                      {ui.memoryTempBusy === item.index ? (
                                        <RefreshCw size={13} className="animate-spin" />
                                      ) : item.isCold ? (
                                        <Flame size={13} />
                                      ) : (
                                        <Snowflake size={13} />
                                      )}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await handleTogglePin(item.index);
                                        dispatch({ type: "SET_ACTION_ERROR", value: null });
                                      } catch (err: any) {
                                        console.error("Failed to toggle pin:", err);
                                        dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to toggle pin" });
                                      }
                                    }}
                                    className={cn(
                                      "flex items-center justify-center",
                                      radius.lg,
                                      item.isPinned
                                        ? "bg-pink-500/20 text-pink-400"
                                        : "bg-white/5 text-white/50",
                                      "transition-all hover:bg-pink-500/20 hover:text-pink-400",
                                      "active:scale-95"
                                    )}
                                    aria-label={item.isPinned ? "Unpin memory" : "Pin memory"}
                                  >
                                    <Pin size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(item.index, item.text);
                                    }}
                                    className={cn(
                                      "flex items-center justify-center",
                                      radius.lg,
                                      "bg-white/5 text-white/50",
                                      "transition-all hover:bg-white/10 hover:text-white/80",
                                      "active:scale-95"
                                    )}
                                    aria-label="Edit memory"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await handleRemove(item.index);
                                        dispatch({ type: "SET_ACTION_ERROR", value: null });
                                        dispatch({ type: "SHIFT_EXPANDED_AFTER_DELETE", index: item.index });
                                      } catch (err: any) {
                                        console.error("Failed to remove memory:", err);
                                        dispatch({ type: "SET_ACTION_ERROR", value: err?.message || "Failed to remove memory" });
                                      }
                                    }}
                                    className={cn(
                                      "flex items-center justify-center",
                                      radius.lg,
                                      "bg-red-500/10 text-red-400/70",
                                      "transition-all hover:bg-red-500/20 hover:text-red-400",
                                      "active:scale-95"
                                    )}
                                    aria-label="Delete memory"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Memory Content */}
                              <p className={cn(
                                "text-[13px] text-white/75 leading-[1.6]",
                                expanded ? "whitespace-pre-wrap" : "line-clamp-2"
                              )}>
                                {item.text}
                              </p>

                              {/* Footer / Meta */}
                              <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-3 text-[10px] text-white/35">
                                  {item.tokenCount > 0 && (
                                    <span>{item.tokenCount.toLocaleString()} tokens</span>
                                  )}
                                  {item.cycle && (
                                    <span>Cycle {item.cycle}</span>
                                  )}
                                  {item.lastAccessedAt > 0 && (
                                    <span>Accessed {new Date(item.lastAccessedAt).toLocaleDateString()}</span>
                                  )}
                                </div>

                                {/* Expand hint */}
                                <div className={cn(
                                  "flex items-center gap-1 text-[10px] text-white/30 transition-colors",
                                  "group-hover:text-white/40"
                                )}>
                                  {expanded ? (
                                    <>
                                      <ChevronUp size={12} />
                                      <span>Collapse</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown size={12} />
                                      <span>Expand</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        ) : ui.activeTab === "tools" ? (
          <div className={cn("px-3 py-4", "space-y-5")}>
            <SectionHeader
              icon={Clock}
              title="Activity"
              subtitle="History of AI memory operations"
              right={
                <span className={cn(
                  typography.caption.size,
                  "inline-flex items-center gap-1 px-2 py-0.5",
                  radius.full,
                  "border bg-white/5",
                  colors.border.subtle,
                  colors.text.secondary
                )}>
                  {(session.memoryToolEvents?.length ?? 0).toLocaleString()}
                </span>
              }
            />
            <ToolLog events={(session.memoryToolEvents as MemoryToolEvent[]) || []} />
          </div>
        ) : (
          <div className={cn("px-3 py-4", "space-y-5")}>
            <SectionHeader
              icon={Pin}
              title="Pinned Messages"
              subtitle="Always included in context"
              right={
                <span className={cn(
                  typography.caption.size,
                  "inline-flex items-center gap-1 px-2 py-0.5",
                  radius.full,
                  "border bg-white/5",
                  colors.border.subtle,
                  colors.text.secondary
                )}>
                  {pinnedMessages.length.toLocaleString()}
                </span>
              }
            />
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
                        components.card.base,
                        components.card.interactive,
                        "w-full p-4",
                        isUser ? "border-emerald-400/30" : isAssistant ? "border-blue-400/30" : "border-white/10"
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
                            "leading-relaxed whitespace-pre-wrap wrap-break-word"
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
              onClick={() => dispatch({ type: "SET_TAB", tab: id })}
              className={cn(
                radius.md,
                "px-3 py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2",
                interactive.active.scale,
                ui.activeTab === id
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
