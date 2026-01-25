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

import { typography, radius, cn, interactive, colors, components } from "../../design-tokens";
import { Routes, useNavigationManager } from "../../navigation";
import { SectionHeader } from "./components/memories/SectionHeader";
import { ToolLog } from "./components/memories/ToolLog";
import { useGroupChatMemoriesController } from "./hooks/useGroupChatMemoriesController";

export function GroupChatMemoriesPage() {
  const { backOrReplace } = useNavigationManager();
  const { groupSessionId } = useParams();

  const {
    session,
    loading,
    error,
    ui,
    dispatch,
    memoryItems,
    filteredMemories,
    stats,
    handleAddNew,
    handleSetColdState,
    handleTogglePin,
    handleRemove,
    startEdit,
    cancelEdit,
    saveEdit,
    handleRunMemoryCycle,
    handleRefresh,
    handleSaveSummaryClick,
  } = useGroupChatMemoriesController(groupSessionId);

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
              className="flex shrink-0 px-[0.6em] py-[0.3em] items-center justify-center -ml-2 text-white transition hover:text-white/80"
              aria-label="Go back"
            >
              <ArrowLeft size={14} strokeWidth={2.5} />
            </button>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xl font-bold text-white/90">Memories</p>
              <p className="mt-0.5 truncate text-xs text-white/50">{session.name}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 ml-auto">
            {(ui.retryStatus === "retrying" || ui.memoryStatus === "processing") && (
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

      <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+96px)]">
        {(ui.actionError || ui.retryStatus !== "idle" || ui.memoryStatus === "processing") && (
          <div className="px-3 pt-3">
            {(ui.retryStatus === "retrying" || ui.memoryStatus === "processing") ? (
              <div
                className={cn(
                  radius.md,
                  "bg-blue-500/10 border border-blue-500/20 p-3 flex items-center gap-3 animate-pulse",
                )}
              >
                <RefreshCw className="h-5 w-5 text-blue-400 shrink-0 animate-spin" />
                <div className="flex-1 text-sm text-blue-200">
                  <p className="font-semibold">AI is organizing group memories...</p>
                </div>
              </div>
            ) : ui.retryStatus === "success" ? (
              <div
                className={cn(
                  radius.md,
                  "bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-3",
                )}
              >
                <Check className="h-5 w-5 text-emerald-400 shrink-0" />
                <div className="flex-1 text-sm text-emerald-200">
                  <p className="font-semibold">Memory cycle processed successfully!</p>
                </div>
                <button
                  onClick={() => dispatch({ type: "SET_RETRY_STATUS", value: "idle" })}
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  <X size={16} />
                </button>
              </div>
            ) : ui.actionError ? (
              <div
                className={cn(
                  radius.md,
                  "bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-3",
                )}
              >
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                <div className="flex-1 text-sm text-red-200">
                  <p className="font-semibold mb-1">Memory action failed</p>
                  <p className="opacity-90">{ui.actionError}</p>
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
            <div
              className={cn(
                radius.md,
                "bg-white/5 border border-white/10 p-3 flex items-center justify-between gap-3",
              )}
            >
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
                  interactive.active.scale,
                )}
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {ui.activeTab === "memories" ? (
          <div className={cn("px-3 py-4", "space-y-5")}>
            <div>
              <SectionHeader
                icon={Sparkles}
                title="Context Summary"
                subtitle="Short recap used to keep context consistent"
                right={
                  <div className="flex items-center gap-2">
                    {session?.memorySummaryTokenCount && session.memorySummaryTokenCount > 0 ? (
                      <span
                        className={cn(
                          typography.caption.size,
                          "inline-flex items-center gap-1 px-2 py-0.5",
                          radius.full,
                          "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
                        )}
                      >
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
                          interactive.active.scale,
                        )}
                      >
                        {ui.isSavingSummary ? "Saving..." : "Save"}
                      </button>
                    ) : null}
                  </div>
                }
              />
              <div
                className={cn(
                  components.card.base,
                  "border-emerald-400/20 bg-emerald-400/5",
                  "w-full p-4 text-left",
                )}
              >
                <textarea
                  value={ui.summaryDraft}
                  onChange={(e) => dispatch({ type: "SET_SUMMARY_DRAFT", value: e.target.value })}
                  rows={4}
                  className={cn(
                    "w-full resize-none bg-transparent focus:outline-none",
                    typography.bodySmall.size,
                    "text-emerald-50/90",
                    "placeholder-emerald-200/30 leading-relaxed",
                  )}
                  placeholder="AI will generate a summary of the conversation context here..."
                />
              </div>
            </div>

            <div>
              <SectionHeader
                icon={Bot}
                title={ui.searchTerm.trim() ? `Results (${filteredMemories.length})` : "Saved Memories"}
                subtitle={
                  ui.searchTerm.trim()
                    ? "Filtered by your search"
                    : "Create, search, edit, and delete memories"
                }
                right={
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        typography.caption.size,
                        "inline-flex items-center gap-1 px-2 py-0.5",
                        radius.full,
                        "border bg-white/5",
                        colors.border.subtle,
                        colors.text.secondary,
                      )}
                    >
                      AI {stats.ai}
                    </span>
                    <span
                      className={cn(
                        typography.caption.size,
                        "inline-flex items-center gap-1 px-2 py-0.5",
                        radius.full,
                        "border bg-white/5",
                        colors.border.subtle,
                        colors.text.secondary,
                      )}
                    >
                      You {stats.user}
                    </span>
                  </div>
                }
              />

              {memoryItems.length > 0 && (
                <div className="relative mb-3">
                  <Search
                    className={cn("absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4", colors.text.tertiary)}
                  />
                  <input
                    type="text"
                    value={ui.searchTerm}
                    onChange={(e) => dispatch({ type: "SET_SEARCH", value: e.target.value })}
                    placeholder="Search memories..."
                    className={cn(
                      "w-full pl-10 pr-10 py-2.5",
                      components.input.base,
                      radius.lg,
                      "text-sm text-white placeholder-white/40",
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
                        interactive.transition.fast,
                      )}
                      aria-label="Clear search"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              )}

              <div
                className={cn(
                  components.card.base,
                  "w-full p-4 text-left",
                  interactive.transition.default,
                  "mb-4",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <textarea
                      value={ui.newMemory}
                      onChange={(e) => dispatch({ type: "SET_NEW_MEMORY", value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleAddNew();
                        }
                      }}
                      placeholder="Add a new memory..."
                      rows={2}
                      className={cn(
                        "w-full resize-none bg-transparent focus:outline-none",
                        typography.bodySmall.size,
                        colors.text.primary,
                        "placeholder-white/40 leading-relaxed",
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
                      interactive.active.scale,
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
                    <p className="text-center text-sm text-white/50">Add your first memory above</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMemories.map((item) => {
                    const expanded = ui.expandedMemories.has(item.index);
                    const isEditing = ui.editingIndex === item.index;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "group relative overflow-hidden rounded-xl",
                          "border transition-all duration-200",
                          isEditing
                            ? "border-white/20 bg-white/3"
                            : expanded
                              ? "border-white/10 bg-white/2"
                              : "border-white/6 bg-white/2 hover:border-white/10 hover:bg-white/3",
                        )}
                      >
                        <div
                          className={cn(
                            "absolute left-0 top-0 bottom-0 w-0.75",
                            item.isAi ? "bg-blue-400/60" : "bg-emerald-400/60",
                          )}
                        />

                        <div
                          className={cn("pl-5 pr-4 py-4", !isEditing && "cursor-pointer")}
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
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                {item.isAi ? (
                                  <Bot className="h-4 w-4 text-blue-400" />
                                ) : (
                                  <User className="h-4 w-4 text-emerald-400" />
                                )}
                                <span
                                  className={cn(
                                    "text-xs font-semibold uppercase tracking-wider",
                                    item.isAi ? "text-blue-400" : "text-emerald-400",
                                  )}
                                >
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
                                  "placeholder:text-white/30",
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
                                    "active:scale-[0.98]",
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
                                    "active:scale-[0.98]",
                                  )}
                                >
                                  <Check size={14} />
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {item.isAi ? (
                                    <Bot className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                  ) : (
                                    <User className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                  )}
                                  <span
                                    className={cn(
                                      "text-[11px] font-semibold uppercase tracking-wider",
                                      item.isAi ? "text-blue-400/90" : "text-emerald-400/90",
                                    )}
                                  >
                                    {item.isAi ? "AI Memory" : "Your Note"}
                                  </span>

                                  {item.isCold ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-300/80 border border-blue-500/20">
                                      Cold
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-300/80 border border-amber-500/20">
                                      Hot {item.importanceScore.toFixed(1)}
                                    </span>
                                  )}
                                  {item.isPinned && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-pink-500/10 text-pink-300/80 border border-pink-500/20">
                                      <Pin size={8} />
                                      Pinned
                                    </span>
                                  )}
                                </div>

                                <div
                                  className={cn(
                                    "flex items-center gap-1.5 shrink-0",
                                    "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity",
                                  )}
                                >
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
                                      "active:scale-95",
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
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await handleTogglePin(item.index);
                                        dispatch({ type: "SET_ACTION_ERROR", value: null });
                                      } catch (err: any) {
                                        console.error("Failed to toggle pin:", err);
                                        dispatch({
                                          type: "SET_ACTION_ERROR",
                                          value: err?.message || "Failed to toggle pin",
                                        });
                                      }
                                    }}
                                    className={cn(
                                      "flex items-center justify-center",
                                      radius.lg,
                                      item.isPinned
                                        ? "bg-pink-500/20 text-pink-400"
                                        : "bg-white/5 text-white/50",
                                      "transition-all hover:bg-pink-500/20 hover:text-pink-400",
                                      "active:scale-95",
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
                                      "active:scale-95",
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
                                        dispatch({
                                          type: "SHIFT_EXPANDED_AFTER_DELETE",
                                          index: item.index,
                                        });
                                      } catch (err: any) {
                                        console.error("Failed to remove memory:", err);
                                        dispatch({
                                          type: "SET_ACTION_ERROR",
                                          value: err?.message || "Failed to remove memory",
                                        });
                                      }
                                    }}
                                    className={cn(
                                      "flex items-center justify-center",
                                      radius.lg,
                                      "bg-red-500/10 text-red-400/70",
                                      "transition-all hover:bg-red-500/20 hover:text-red-400",
                                      "active:scale-95",
                                    )}
                                    aria-label="Delete memory"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              <p
                                className={cn(
                                  "text-[13px] text-white/75 leading-[1.6]",
                                  expanded ? "whitespace-pre-wrap" : "line-clamp-2",
                                )}
                              >
                                {item.text}
                              </p>

                              <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-3 text-[10px] text-white/35">
                                  {item.tokenCount > 0 && (
                                    <span>{item.tokenCount.toLocaleString()} tokens</span>
                                  )}
                                  {item.cycle && <span>Cycle {item.cycle}</span>}
                                  {item.lastAccessedAt > 0 && (
                                    <span>
                                      Accessed {new Date(item.lastAccessedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>

                                <div
                                  className={cn(
                                    "flex items-center gap-1 text-[10px] text-white/30 transition-colors",
                                    "group-hover:text-white/40",
                                  )}
                                >
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
        ) : (
          <div className={cn("px-3 py-4", "space-y-5")}>
            <SectionHeader
              icon={Clock}
              title="Activity"
              subtitle="History of memory cycle operations"
              right={
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunMemoryCycle}
                    disabled={ui.retryStatus === "retrying" || ui.memoryStatus === "processing"}
                    className={cn(
                      radius.md,
                      "border px-2 py-1 flex items-center gap-1.5 transition-all active:scale-95",
                      "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50",
                      typography.caption.size,
                    )}
                  >
                    <Cpu
                      size={12}
                      className={cn((ui.retryStatus === "retrying" || ui.memoryStatus === "processing") && "animate-pulse")}
                    />
                    Run Process
                  </button>
                  <span
                    className={cn(
                      typography.caption.size,
                      "inline-flex items-center gap-1 px-2 py-0.5",
                      radius.full,
                      "border bg-white/5",
                      colors.border.subtle,
                      colors.text.secondary,
                    )}
                  >
                    {(session.memoryToolEvents?.length ?? 0).toLocaleString()}
                  </span>
                </div>
              }
            />
            <ToolLog events={session.memoryToolEvents || []} />
          </div>
        )}
      </main>

      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 border-t px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3",
          colors.glass.strong,
        )}
      >
        <div className={cn(radius.lg, "grid grid-cols-2 gap-2 p-1", colors.surface.elevated)}>
          {[
            { id: "memories" as const, icon: Bot, label: "Memories" },
            { id: "tools" as const, icon: Clock, label: "Activity" },
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
                  : cn(colors.text.tertiary, "hover:text-white"),
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
