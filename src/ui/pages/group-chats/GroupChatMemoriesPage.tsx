import { useEffect, useMemo, useReducer, useState, useCallback } from "react";
import type { ComponentType, ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Bot,
  User,
  Trash2,
  Edit2,
  Check,
  Plus,
  Pin,
  AlertTriangle,
  X,
  RefreshCw,
  Snowflake,
  Flame,
  Cpu,
} from "lucide-react";
import type { GroupSession } from "../../../core/storage/schemas";
import {
  groupSessionAddMemory,
  groupSessionRemoveMemory,
  groupSessionUpdateMemory,
  groupSessionToggleMemoryPin,
  groupSessionSetMemoryColdState,
  getGroupSession,
} from "../../../core/storage/repo";

import { storageBridge } from "../../../core/storage/files";
import {
  typography,
  radius,
  cn,
  interactive,
  spacing,
  colors,
  components,
} from "../../design-tokens";
import { Routes, useNavigationManager } from "../../navigation";

type MemoryToolEvent = NonNullable<GroupSession["memoryToolEvents"]>[number];

type MemoriesTab = "memories" | "tools";
type RetryStatus = "idle" | "retrying" | "success";

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
  | { type: "TOGGLE_EXPANDED"; index: number }
  | { type: "SHIFT_EXPANDED_AFTER_DELETE"; index: number }
  | { type: "SET_MEMORY_TEMP_BUSY"; value: number | null }
  | { type: "SET_PENDING_REFRESH"; value: boolean };

function initUi(): UiState {
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
    actionError: null,
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
          <h2
            className={cn(
              typography.h2.size,
              typography.h2.weight,
              colors.text.primary,
              "truncate",
            )}
          >
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

function useGroupSessionData(sessionId?: string) {
  const [session, setSession] = useState<GroupSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setError("Missing sessionId");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const targetSession = await getGroupSession(sessionId);
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
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { session, setSession, loading, error, reload: load };
}

function useGroupMemoryActions(
  session: GroupSession | null,
  setSession: (s: GroupSession) => void,
) {
  const handleAdd = useCallback(
    async (memory: string) => {
      if (!session) return;
      try {
        const updated = await groupSessionAddMemory(session.id, memory);
        if (updated) setSession(updated);
      } catch (err: any) {
        throw err;
      }
    },
    [session, setSession],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      if (!session) return;
      try {
        const updated = await groupSessionRemoveMemory(session.id, index);
        if (updated) setSession(updated);
      } catch (err: any) {
        throw err;
      }
    },
    [session, setSession],
  );

  const handleUpdate = useCallback(
    async (index: number, memory: string) => {
      if (!session) return;
      try {
        const updated = await groupSessionUpdateMemory(session.id, index, memory);
        if (updated) setSession(updated);
      } catch (err: any) {
        throw err;
      }
    },
    [session, setSession],
  );

  const handleTogglePin = useCallback(
    async (index: number) => {
      if (!session) return;
      try {
        const updated = await groupSessionToggleMemoryPin(session.id, index);
        if (updated) setSession(updated);
      } catch (err: any) {
        throw err;
      }
    },
    [session, setSession],
  );

  return { handleAdd, handleRemove, handleUpdate, handleTogglePin };
}

function ToolLog({ events }: { events: MemoryToolEvent[] }) {
  if (!events.length) {
    return (
      <div className={cn(components.card.base, "px-6 py-8 text-center")}>
        <p className={cn(typography.bodySmall.size, colors.text.tertiary)}>
          No memory cycles recorded yet. Memory cycles run automatically after enough new messages.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(spacing.item, "space-y-3")}>
      {events.map((event, index) => (
        <div
          key={index}
          className={cn(components.card.base, "overflow-hidden border border-white/5")}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Cpu size={14} className={colors.text.tertiary} />
              <span className={cn(typography.caption.size, "font-medium", colors.text.secondary)}>
                Memory Cycle #{events.length - index}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {event.windowEnd && (
                <span className={cn(typography.caption.size, colors.text.tertiary)}>
                  Window End: {event.windowEnd}
                </span>
              )}
              {event.timestamp && (
                <span className={cn(typography.caption.size, colors.text.tertiary)}>
                  {new Date(event.timestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="px-4 py-3 space-y-2">
            {event.memoriesCount !== undefined && (
              <div className="flex items-center gap-2">
                <span className={cn(typography.caption.size, colors.text.tertiary)}>
                  Total Memories:
                </span>
                <span className={cn(typography.caption.size, colors.text.secondary)}>
                  {event.memoriesCount}
                </span>
              </div>
            )}

            {event.actions && event.actions.length > 0 && (
              <div className="pt-2 space-y-2">
                <span className={cn(typography.caption.size, "font-medium", colors.text.secondary)}>
                  Actions:
                </span>
                {event.actions.map((action, actionIndex) => (
                  <div key={actionIndex} className={cn(radius.sm, "bg-white/[0.03] px-3 py-2")}>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          typography.caption.size,
                          "font-mono font-medium",
                          action.name === "create_memory"
                            ? "text-emerald-400"
                            : action.name === "update_memory"
                              ? "text-amber-400"
                              : action.name === "delete_memory"
                                ? "text-rose-400"
                                : colors.text.secondary,
                        )}
                      >
                        {action.name}
                      </span>
                    </div>
                    {action.updatedMemories && action.updatedMemories.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {action.updatedMemories.map((mem, memIdx) => (
                          <p
                            key={memIdx}
                            className={cn(
                              typography.caption.size,
                              colors.text.tertiary,
                              "leading-relaxed",
                            )}
                          >
                            {mem}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GroupChatMemoriesPage() {
  const { backOrReplace } = useNavigationManager();
  const { groupSessionId } = useParams();
  const { session, setSession, loading, error, reload } = useGroupSessionData(groupSessionId);
  const { handleAdd, handleRemove, handleUpdate, handleTogglePin } = useGroupMemoryActions(
    session,
    (s) => setSession(s),
  );
  const [ui, dispatch] = useReducer(uiReducer, undefined, initUi);

  const handleSetColdState = useCallback(
    async (memoryIndex: number, isCold: boolean) => {
      if (!session?.id) return;
      dispatch({ type: "SET_MEMORY_TEMP_BUSY", value: memoryIndex });
      try {
        const updated = await groupSessionSetMemoryColdState(session.id, memoryIndex, isCold);
        if (updated) setSession(updated);
        dispatch({ type: "SET_ACTION_ERROR", value: null });
      } catch (err: any) {
        console.error("Failed to update memory temperature:", err);
        dispatch({
          type: "SET_ACTION_ERROR",
          value: err?.message || "Failed to update memory temperature",
        });
      } finally {
        dispatch({ type: "SET_MEMORY_TEMP_BUSY", value: null });
      }
    },
    [session?.id, setSession],
  );

  useEffect(() => {
    if (!session?.id) return;
    let unlisteners: (() => void)[] = [];

    const setup = async () => {
      try {
        const u1 = await listen("group-dynamic-memory:processing", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            void reload();
          }
        });
        const u2 = await listen("group-dynamic-memory:success", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            dispatch({ type: "SET_PENDING_REFRESH", value: true });
            void reload();
          }
        });
        const u3 = await listen("group-dynamic-memory:error", (e: any) => {
          if (e.payload?.sessionId === session.id) {
            void reload();
          }
        });
        unlisteners.push(u1, u2, u3);
      } catch (err) {
        console.error("Failed to setup memory event listeners", err);
      }
    };

    setup();
    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [session?.id, reload]);

  useEffect(() => {
    dispatch({ type: "SYNC_SUMMARY_FROM_SESSION", value: session?.memorySummary ?? "" });
  }, [session?.memorySummary]);

  const cycleMap = useMemo(() => {
    const map = new Map<string, string>();
    const textMap = new Map<string, string>();

    if (session?.memoryToolEvents) {
      session.memoryToolEvents.forEach((event: any) => {
        const cycleStr = `${event.windowStart || 0}-${event.windowEnd || 0}`;
        if (event.actions) {
          event.actions.forEach((action: any) => {
            if (action.name === "create_memory") {
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
    if (!session?.memoryEmbeddings) return [];
    return session.memoryEmbeddings.map((emb, index) => {
      const id = emb.id || `mem-${index}`;
      const isAi = id.length <= 6;
      const tokenCount = emb.tokenCount || 0;

      let cycle = cycleMap.map.get(id);
      if (!cycle && cycleMap.textMap.has(emb.text)) {
        cycle = cycleMap.textMap.get(emb.text);
      }

      return {
        text: emb.text,
        index,
        isAi,
        id,
        tokenCount,
        isCold: emb.isCold ?? false,
        importanceScore: emb.importanceScore ?? 1.0,
        createdAt: emb.createdAt ?? 0,
        lastAccessedAt: emb.lastAccessedAt ?? 0,
        isPinned: emb.isPinned ?? false,
        cycle,
      };
    });
  }, [session, cycleMap]);

  const filteredMemories = useMemo(() => {
    if (!ui.searchTerm.trim()) return memoryItems;
    return memoryItems.filter((item) =>
      item.text.toLowerCase().includes(ui.searchTerm.toLowerCase()),
    );
  }, [memoryItems, ui.searchTerm]);

  const stats = useMemo(() => {
    const total = memoryItems.length;
    const ai = memoryItems.filter((m) => m.isAi).length;
    const user = total - ai;
    const totalMemoryTokens = memoryItems.reduce((sum, m) => sum + m.tokenCount, 0);
    const summaryTokens = session?.memorySummaryTokenCount || 0;
    const totalTokens = totalMemoryTokens + summaryTokens;
    return { total, ai, user, totalMemoryTokens, summaryTokens, totalTokens };
  }, [memoryItems, session?.memorySummaryTokenCount]);

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

  const saveEdit = useCallback(
    async (index: number) => {
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
    },
    [handleUpdate, memoryItems, ui.editingValue],
  );

  const handleRetryWithModel = useCallback(async () => {
    if (!session?.id) return;
    dispatch({ type: "SET_RETRY_STATUS", value: "retrying" });
    try {
      await storageBridge.groupChatRetryDynamicMemory(session.id);
      dispatch({ type: "SET_RETRY_STATUS", value: "success" });
      dispatch({ type: "SET_PENDING_REFRESH", value: true });
      window.setTimeout(() => {
        dispatch({ type: "SET_RETRY_STATUS", value: "idle" });
        void reload();
      }, 3000);
    } catch (err: any) {
      console.error("Failed to retry memory processing:", err);
      dispatch({ type: "SET_RETRY_STATUS", value: "idle" });
      void reload();
    }
  }, [session?.id, reload]);

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

  if (error || !session) {
    return (
      <div
        className={cn(
          "flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center",
          colors.surface.base,
        )}
      >
        <p className={cn("text-sm", colors.text.secondary)}>{error || "Session not found"}</p>
        <button
          onClick={() => backOrReplace(Routes.groupChats)}
          className={cn(
            components.button.primary,
            components.button.sizes.md,
            "bg-white/5 text-white hover:bg-white/10",
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
      <header
        className={cn(
          "border-b border-white/10 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 sticky top-0 z-20",
          "bg-[#050505]",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center min-w-0">
            <button
              onClick={() => backOrReplace(Routes.groupChat(groupSessionId!))}
              className="flex shrink-0 items-center justify-center -ml-2 text-white transition hover:text-white/80"
              aria-label="Go back"
            >
              <ArrowLeft size={14} strokeWidth={2.5} />
            </button>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xl font-bold text-white/90">Group Memories</p>
              <p className="mt-0.5 truncate text-xs text-white/50">{session.name}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 ml-auto">
            {ui.retryStatus === "retrying" && (
              <div
                className={cn(
                  radius.full,
                  "border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
                  "border-blue-500/30 bg-blue-500/15 text-blue-200",
                )}
              >
                Processing
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab selector */}
      <div className="flex gap-2 px-4 pt-3 pb-2">
        {(
          [
            { id: "memories", icon: Sparkles, label: "Memories" },
            { id: "tools", icon: Cpu, label: "Tool Log" },
          ] as const
        ).map(({ id, icon: Icon, label }) => {
          const isSelected = ui.activeTab === id;
          return (
            <button
              key={id}
              onClick={() => dispatch({ type: "SET_TAB", tab: id })}
              className={cn(
                radius.md,
                "flex items-center gap-1.5 px-3 py-1.5 text-sm transition",
                isSelected
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/50 hover:bg-white/5 hover:text-white/70",
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Main content area */}
      <main className={cn("flex-1 overflow-y-auto px-4 pb-24", spacing.section)}>
        {/* Error banner */}
        {ui.actionError && (
          <div
            className={cn(
              radius.md,
              "mb-4 flex items-start gap-3 border px-4 py-3",
              "border-rose-500/30 bg-rose-500/10",
            )}
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-400" />
            <div className="flex-1 min-w-0">
              <p className={cn(typography.bodySmall.size, "text-rose-200")}>{ui.actionError}</p>
            </div>
            <button
              onClick={() => dispatch({ type: "SET_ACTION_ERROR", value: null })}
              className="shrink-0 text-rose-300 hover:text-rose-100"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Pending refresh banner */}
        {ui.pendingRefresh && (
          <div
            className={cn(
              radius.md,
              "mb-4 flex items-center justify-between gap-3 border px-4 py-3",
              "border-emerald-500/30 bg-emerald-500/10",
            )}
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-emerald-400" />
              <p className={cn(typography.bodySmall.size, "text-emerald-200")}>
                Memories updated. Tap to refresh.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className={cn(
                radius.sm,
                "px-3 py-1 text-sm font-medium",
                "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30",
              )}
            >
              Refresh
            </button>
          </div>
        )}

        {/* Stats */}
        <div className={cn(spacing.item)}>
          <div className="flex flex-wrap gap-4">
            <div>
              <p className={cn(typography.caption.size, colors.text.tertiary)}>Total</p>
              <p className={cn(typography.h3.size, typography.h3.weight)}>{stats.total}</p>
            </div>
            <div>
              <p className={cn(typography.caption.size, colors.text.tertiary)}>AI-created</p>
              <p className={cn(typography.h3.size, typography.h3.weight)}>{stats.ai}</p>
            </div>
            <div>
              <p className={cn(typography.caption.size, colors.text.tertiary)}>User-added</p>
              <p className={cn(typography.h3.size, typography.h3.weight)}>{stats.user}</p>
            </div>
            <div>
              <p className={cn(typography.caption.size, colors.text.tertiary)}>Memory Tokens</p>
              <p className={cn(typography.h3.size, typography.h3.weight)}>
                {stats.totalMemoryTokens.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Tab content */}
        {ui.activeTab === "memories" && (
          <>
            {/* Search */}
            <div className={cn(spacing.item)}>
              <div className="relative">
                <Search
                  size={16}
                  className={cn("absolute left-3 top-1/2 -translate-y-1/2", colors.text.tertiary)}
                />
                <input
                  type="text"
                  value={ui.searchTerm}
                  onChange={(e) => dispatch({ type: "SET_SEARCH", value: e.target.value })}
                  placeholder="Search memories..."
                  className={cn(
                    radius.lg,
                    "w-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-white/30",
                    "focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10",
                  )}
                />
                {ui.searchTerm && (
                  <button
                    onClick={() => dispatch({ type: "CLEAR_SEARCH" })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Add new memory */}
            <div className={cn(spacing.item)}>
              <SectionHeader
                icon={Plus}
                title="Add Memory"
                subtitle="Manually add a memory entry"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ui.newMemory}
                  onChange={(e) => dispatch({ type: "SET_NEW_MEMORY", value: e.target.value })}
                  placeholder="Type a new memory..."
                  className={cn(
                    radius.lg,
                    "flex-1 border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30",
                    "focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleAddNew();
                    }
                  }}
                />
                <button
                  onClick={handleAddNew}
                  disabled={ui.isAdding || !ui.newMemory.trim()}
                  className={cn(
                    radius.lg,
                    "shrink-0 px-4 py-2.5 text-sm font-medium",
                    "bg-white/10 text-white hover:bg-white/15",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {ui.isAdding ? "Adding..." : "Add"}
                </button>
              </div>
            </div>

            {/* Memory list */}
            <div className={cn(spacing.item)}>
              <SectionHeader
                icon={Sparkles}
                title="Memory Entries"
                subtitle={`${filteredMemories.length} ${filteredMemories.length === 1 ? "memory" : "memories"}`}
              />

              {filteredMemories.length === 0 ? (
                <div className={cn(components.card.base, "px-6 py-8 text-center")}>
                  <p className={cn(typography.bodySmall.size, colors.text.tertiary)}>
                    {ui.searchTerm
                      ? "No memories match your search."
                      : "No memories yet. Add one above or wait for AI to create them during chat."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMemories.map((memory) => {
                    const expanded = ui.expandedMemories.has(memory.index);
                    const isEditing = ui.editingIndex === memory.index;

                    return (
                      <div
                        key={memory.id}
                        className={cn(
                          components.card.base,
                          "overflow-hidden border",
                          memory.isCold ? "border-cyan-500/20" : "border-white/5",
                          memory.isPinned && "ring-1 ring-amber-500/30",
                        )}
                      >
                        {/* Memory header */}
                        <div
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 cursor-pointer",
                            interactive.hover.brightness,
                          )}
                          onClick={() => dispatch({ type: "TOGGLE_EXPANDED", index: memory.index })}
                        >
                          <div
                            className={cn(
                              "h-5 w-5 rounded-full flex items-center justify-center shrink-0",
                              memory.isAi ? "bg-violet-500/20" : "bg-emerald-500/20",
                            )}
                          >
                            {memory.isAi ? (
                              <Bot size={12} className="text-violet-400" />
                            ) : (
                              <User size={12} className="text-emerald-400" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                typography.bodySmall.size,
                                colors.text.primary,
                                !expanded && "line-clamp-1",
                              )}
                            >
                              {memory.text}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {memory.isPinned && <Pin size={12} className="text-amber-400" />}
                            {memory.isCold ? (
                              <Snowflake size={12} className="text-cyan-400" />
                            ) : (
                              <Flame size={12} className="text-orange-400" />
                            )}
                            {expanded ? (
                              <ChevronUp size={14} className={colors.text.tertiary} />
                            ) : (
                              <ChevronDown size={14} className={colors.text.tertiary} />
                            )}
                          </div>
                        </div>

                        {/* Expanded content */}
                        {expanded && (
                          <div className="border-t border-white/5 px-3 py-3 space-y-3">
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  value={ui.editingValue}
                                  onChange={(e) =>
                                    dispatch({ type: "SET_EDIT_VALUE", value: e.target.value })
                                  }
                                  className={cn(
                                    radius.md,
                                    "w-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white",
                                    "focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10",
                                    "resize-none",
                                  )}
                                  rows={3}
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={cancelEdit}
                                    className={cn(
                                      radius.md,
                                      "px-3 py-1.5 text-sm",
                                      "text-white/60 hover:text-white/80",
                                    )}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => saveEdit(memory.index)}
                                    className={cn(
                                      radius.md,
                                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium",
                                      "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
                                    )}
                                  >
                                    <Check size={14} />
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Meta info */}
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                  <span
                                    className={cn(typography.caption.size, colors.text.tertiary)}
                                  >
                                    Tokens: {memory.tokenCount}
                                  </span>
                                  {memory.importanceScore !== undefined && (
                                    <span
                                      className={cn(typography.caption.size, colors.text.tertiary)}
                                    >
                                      Score: {(memory.importanceScore * 100).toFixed(0)}%
                                    </span>
                                  )}
                                  {memory.createdAt > 0 && (
                                    <span
                                      className={cn(typography.caption.size, colors.text.tertiary)}
                                    >
                                      Created: {new Date(memory.createdAt).toLocaleDateString()}
                                    </span>
                                  )}
                                  {memory.cycle && (
                                    <span
                                      className={cn(typography.caption.size, colors.text.tertiary)}
                                    >
                                      Cycle: {memory.cycle}
                                    </span>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => startEdit(memory.index, memory.text)}
                                    className={cn(
                                      radius.md,
                                      "flex items-center gap-1.5 px-2.5 py-1.5 text-xs",
                                      "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                                    )}
                                  >
                                    <Edit2 size={12} />
                                    Edit
                                  </button>

                                  <button
                                    onClick={() => handleTogglePin(memory.index)}
                                    className={cn(
                                      radius.md,
                                      "flex items-center gap-1.5 px-2.5 py-1.5 text-xs",
                                      memory.isPinned
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                                    )}
                                  >
                                    <Pin size={12} />
                                    {memory.isPinned ? "Unpin" : "Pin"}
                                  </button>

                                  <button
                                    onClick={() => handleSetColdState(memory.index, !memory.isCold)}
                                    disabled={ui.memoryTempBusy === memory.index}
                                    className={cn(
                                      radius.md,
                                      "flex items-center gap-1.5 px-2.5 py-1.5 text-xs",
                                      memory.isCold
                                        ? "bg-cyan-500/20 text-cyan-300"
                                        : "bg-orange-500/20 text-orange-300",
                                      "disabled:opacity-50",
                                    )}
                                  >
                                    {memory.isCold ? (
                                      <>
                                        <Flame size={12} />
                                        Make Hot
                                      </>
                                    ) : (
                                      <>
                                        <Snowflake size={12} />
                                        Make Cold
                                      </>
                                    )}
                                  </button>

                                  <button
                                    onClick={async () => {
                                      try {
                                        await handleRemove(memory.index);
                                        dispatch({
                                          type: "SHIFT_EXPANDED_AFTER_DELETE",
                                          index: memory.index,
                                        });
                                      } catch (err: any) {
                                        dispatch({
                                          type: "SET_ACTION_ERROR",
                                          value: err?.message || "Failed to delete memory",
                                        });
                                      }
                                    }}
                                    className={cn(
                                      radius.md,
                                      "flex items-center gap-1.5 px-2.5 py-1.5 text-xs",
                                      "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30",
                                    )}
                                  >
                                    <Trash2 size={12} />
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Summary section */}
            {session.memorySummary && (
              <div className={cn(spacing.item)}>
                <SectionHeader
                  icon={Clock}
                  title="Context Summary"
                  subtitle={`${session.memorySummaryTokenCount || 0} tokens`}
                />
                <div className={cn(components.card.base, "px-4 py-3")}>
                  <p
                    className={cn(
                      typography.bodySmall.size,
                      colors.text.secondary,
                      "leading-relaxed whitespace-pre-wrap",
                    )}
                  >
                    {session.memorySummary}
                  </p>
                </div>
              </div>
            )}

            {/* Retry button */}
            <div className={cn(spacing.item)}>
              <button
                onClick={handleRetryWithModel}
                disabled={ui.retryStatus === "retrying"}
                className={cn(
                  radius.lg,
                  "w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium",
                  "bg-violet-500/20 text-violet-300 hover:bg-violet-500/30",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <RefreshCw
                  size={16}
                  className={ui.retryStatus === "retrying" ? "animate-spin" : ""}
                />
                {ui.retryStatus === "retrying"
                  ? "Processing..."
                  : ui.retryStatus === "success"
                    ? "Success!"
                    : "Run Memory Cycle Now"}
              </button>
            </div>
          </>
        )}

        {ui.activeTab === "tools" && (
          <div className={cn(spacing.item)}>
            <SectionHeader
              icon={Cpu}
              title="Memory Tool Log"
              subtitle="History of memory cycle operations"
            />
            <ToolLog events={session.memoryToolEvents || []} />
          </div>
        )}
      </main>
    </div>
  );
}
