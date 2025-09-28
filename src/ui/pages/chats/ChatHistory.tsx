import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";

import type { Character, Session, StoredMessage } from "../../../core/storage/schemas";
import { listCharacters, listSessionIds, getSession, archiveSession, deleteSession } from "../../../core/storage/repo";

interface SessionPreview {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  lastMessages: StoredMessage[];
  archived: boolean;
}

const HISTORY_CARD_HEIGHT = 192;
const HISTORY_ITEM_HEIGHT = HISTORY_CARD_HEIGHT + 20;
const HISTORY_OVERSCAN = 3;

export function ChatHistoryPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(true);
  const [historySessions, setHistorySessions] = useState<SessionPreview[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [busySessions, setBusySessions] = useState<Record<string, boolean>>({});

  const assistantName = useMemo(() => character?.name ?? "Assistant", [character?.name]);

  const setSessionBusy = useCallback((sessionId: string, busy: boolean) => {
    setBusySessions((prev) => {
      const next = { ...prev };
      if (busy) {
        next[sessionId] = true;
      } else {
        delete next[sessionId];
      }
      return next;
    });
  }, []);

  const toSessionPreview = useCallback((session: Session): SessionPreview => {
    const orderedMessages = [...(session.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
    const lastTwo = orderedMessages.slice(-2);
    return {
      id: session.id,
      title: session.title || "Untitled chat",
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      lastMessages: lastTwo,
      archived: session.archived ?? false,
    };
  }, []);

  const loadCharacter = useCallback(async () => {
    if (!characterId) return;
    setLoadingCharacter(true);
    try {
      const list = await listCharacters();
      const match = list.find((entry) => entry.id === characterId) ?? null;
      setCharacter(match);
    } catch (error) {
      console.error("ChatHistory: failed to load character", error);
      setCharacter(null);
    } finally {
      setLoadingCharacter(false);
    }
  }, [characterId]);

  const loadHistory = useCallback(async () => {
    if (!characterId) return;
    setLoadingHistory(true);
    setHistoryError(null);

    try {
      const ids = await listSessionIds().catch(() => [] as string[]);
      if (ids.length === 0) {
        setHistorySessions([]);
        return;
      }

      const sessions = await Promise.all(
        ids.map((id) =>
          getSession(id).catch((err) => {
            console.warn("ChatHistory: failed to read session", { id, err });
            return null;
          })
        )
      );

      const filtered = sessions
        .filter((session): session is Session => session !== null && session.characterId === characterId)
        .map(toSessionPreview)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      setHistorySessions(filtered);
    } catch (error) {
      console.error("ChatHistory: failed to load history", error);
      setHistorySessions([]);
      setHistoryError(error instanceof Error ? error.message : "Failed to load chat history");
    } finally {
      setLoadingHistory(false);
    }
  }, [characterId, toSessionPreview]);

  const applySessionUpdate = useCallback((updated: SessionPreview) => {
    setHistorySessions((prev) => {
      const next = prev.map((session) => (session.id === updated.id ? updated : session));
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      return next;
    });
  }, []);

  const removeSessionFromList = useCallback((sessionId: string) => {
    setHistorySessions((prev) => prev.filter((session) => session.id !== sessionId));
  }, []);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      setHistoryError(null);
      setSessionBusy(sessionId, true);
      await deleteSession(sessionId);
      removeSessionFromList(sessionId);
    } catch (error) {
      console.error("ChatHistory: failed to delete session", error);
      setHistoryError(error instanceof Error ? error.message : "Failed to delete session");
    } finally {
      setSessionBusy(sessionId, false);
    }
  }, [removeSessionFromList, setSessionBusy]);

  const handleToggleArchive = useCallback(async (sessionId: string, nextArchived: boolean) => {
    try {
      setHistoryError(null);
      setSessionBusy(sessionId, true);
      const updated = await archiveSession(sessionId, nextArchived);
      if (updated) {
        applySessionUpdate(toSessionPreview(updated));
      }
    } catch (error) {
      console.error("ChatHistory: failed to update archive state", error);
      setHistoryError(error instanceof Error ? error.message : "Failed to update archive state");
    } finally {
      setSessionBusy(sessionId, false);
    }
  }, [applySessionUpdate, toSessionPreview, setSessionBusy]);

  useEffect(() => {
    loadCharacter();
  }, [loadCharacter]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleBack = useCallback(() => {
    if (characterId) {
      navigate(`/chat/${characterId}/settings`);
    } else {
      navigate(-1);
    }
  }, [characterId, navigate]);

  const handleOpenSession = useCallback(
    (sessionId: string) => {
      if (!characterId) return;
      navigate(`/chat/${characterId}?sessionId=${sessionId}`);
    },
    [characterId, navigate]
  );

  if (!characterId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4">
        <div className="text-center">
          <p className="text-lg text-white">Character not found</p>
          <p className="mt-2 text-sm text-gray-400">Invalid character reference.</p>
        </div>
      </div>
    );
  }

  const isLoading = loadingCharacter || loadingHistory;

  const showErrorCard = historyError && historySessions.length === 0;

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100">
      <header className="relative z-10 border-b border-white/10 bg-[#050505]/95 px-4 pb-4 pt-6 backdrop-blur">
        <div
          className="flex items-center gap-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
        >
          <button
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25 hover:bg-white/10"
            aria-label="Back to settings"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="text-base font-semibold text-white">Chat History</h1>
            <p className="mt-0.5 text-xs text-gray-400">
              {character ? `Sessions with ${character.name}` : "All previous conversations"}
            </p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="space-y-6"
        >
          {isLoading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-white/60" />
            </div>
          ) : showErrorCard ? (
            <HistoryErrorCard message={historyError ?? ""} onRetry={loadHistory} />
          ) : historySessions.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center text-sm text-gray-300">
              No previous chats yet. Start a conversation to build history.
            </div>
          ) : (
            <>
              {historyError && (
                <HistoryInlineError message={historyError} onRetry={loadHistory} />
              )}
              <VirtualizedSessionHistory
                sessions={historySessions}
                onSelect={handleOpenSession}
                assistantName={assistantName}
                onDelete={handleDeleteSession}
                onToggleArchive={handleToggleArchive}
                busySessions={busySessions}
              />
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}

function VirtualizedSessionHistory({
  sessions,
  onSelect,
  assistantName,
  onDelete,
  onToggleArchive,
  busySessions,
}: {
  sessions: SessionPreview[];
  onSelect: (sessionId: string) => void;
  assistantName: string;
  onDelete: (sessionId: string) => void;
  onToggleArchive: (sessionId: string, nextArchived: boolean) => void;
  busySessions: Record<string, boolean>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateHeight = () => {
      setViewportHeight(element.clientHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = 0;
    setScrollTop(0);
  }, [sessions]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const totalHeight = sessions.length * HISTORY_ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / HISTORY_ITEM_HEIGHT) - HISTORY_OVERSCAN);
  const estimatedVisibleCount = viewportHeight > 0
    ? Math.ceil(viewportHeight / HISTORY_ITEM_HEIGHT) + HISTORY_OVERSCAN * 2
    : sessions.length;
  const endIndex = Math.min(sessions.length, startIndex + estimatedVisibleCount);
  const visibleSessions = sessions.slice(startIndex, endIndex);
  const topSpacer = startIndex * HISTORY_ITEM_HEIGHT;
  const bottomSpacer = Math.max(0, totalHeight - topSpacer - visibleSessions.length * HISTORY_ITEM_HEIGHT);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="max-h-[70vh] overflow-y-auto pr-2 -mr-2"
    >
      {topSpacer > 0 && <div style={{ height: topSpacer }} />}
      {visibleSessions.map((session) => (
        <div key={session.id} style={{ height: HISTORY_ITEM_HEIGHT }} className="flex items-center">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(session.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(session.id);
              }
            }}
            className="group w-full rounded-2xl border border-white/10 bg-[#0f1016] p-4 text-left text-white transition-all duration-200 hover:border-white/20 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            style={{ height: HISTORY_CARD_HEIGHT }}
            aria-label={`Open chat session ${session.title}`}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white line-clamp-1">{session.title}</p>
                  <p className="mt-1 text-xs text-gray-500 line-clamp-1">{new Date(session.updatedAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {session.archived && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
                      Archived
                    </span>
                  )}
                  <HistoryActionButton
                    icon={session.archived ? ArchiveRestore : Archive}
                    label={session.archived ? "Unarchive" : "Archive"}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      onToggleArchive(session.id, !session.archived);
                    }}
                    disabled={!!busySessions[session.id]}
                  />
                  <HistoryActionButton
                    icon={Trash2}
                    label="Delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      onDelete(session.id);
                    }}
                    disabled={!!busySessions[session.id]}
                    destructive
                  />
                </div>
              </div>

              <div className="mt-3 flex-1 space-y-2 overflow-hidden">
                {session.lastMessages.length > 0 ? (
                  session.lastMessages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-xl border border-white/5 bg-white/5 px-3 py-2"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                        {getRoleLabel(message.role, assistantName)}
                      </p>
                      <p className="mt-1 text-sm text-gray-100 line-clamp-2">{message.content || "(empty message)"}</p>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-3 text-xs text-gray-400">
                    No messages in this chat yet
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                <span>{session.archived ? "Archived" : "Last active"}</span>
                <span>{formatTimeAgo(session.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
      {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} />}
    </div>
  );
}

function HistoryActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  destructive = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold uppercase tracking-wider transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive
          ? "border-red-500/40 bg-red-500/10 text-red-200 hover:border-red-500/60 hover:bg-red-500/15"
          : "border-white/15 bg-white/5 text-white hover:border-white/30 hover:bg-white/10"
      }`}
      aria-label={label}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function HistoryErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-5 text-red-100">
      <p className="text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center justify-center rounded-lg border border-red-200/40 px-3 py-2 text-xs font-semibold text-red-100 transition hover:border-red-200/70 hover:bg-red-500/10"
      >
        Try again
      </button>
    </div>
  );
}

function HistoryInlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-red-200/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-100 transition hover:border-red-200/70 hover:bg-red-500/10"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function getRoleLabel(role: StoredMessage["role"], assistantName: string): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return assistantName || "Assistant";
    default:
      return "System";
  }
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSeconds < 45) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  }
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
}
