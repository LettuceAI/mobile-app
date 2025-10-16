import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Trash2, MessageCircle, AlertCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import type { Character } from "../../../core/storage/schemas";
import {
  listCharacters,
  listSessionIds,
  getSession,
  deleteSession
} from "../../../core/storage";
import { typography, radius, cn } from "../../design-tokens";

interface SessionPreview {
  id: string;
  title: string;
  updatedAt: number;
  lastMessage: string;
  archived: boolean;
}

export function ChatHistoryPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [sessions, setSessions] = useState<SessionPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (!characterId) return;

      try {
        setIsLoading(true);
        setError(null);

        // Load character
        const characters = await listCharacters();
        const char = characters.find(c => c.id === characterId);
        setCharacter(char || null);

        // Load sessions
        const sessionIds = await listSessionIds();
        const sessionData: SessionPreview[] = [];

        for (const id of sessionIds) {
          try {
            const session = await getSession(id);
            if (session?.characterId === characterId) {
              const lastMessage = session.messages?.[session.messages.length - 1]?.content || "";
              sessionData.push({
                id: session.id,
                title: session.title || "Untitled Chat",
                updatedAt: session.updatedAt,
                lastMessage: lastMessage.slice(0, 100) + (lastMessage.length > 100 ? "..." : ""),
                archived: session.archived || false,
              });
            }
          } catch {
            // Skip invalid sessions
          }
        }

        sessionData.sort((a, b) => b.updatedAt - a.updatedAt);
        setSessions(sessionData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [characterId]);

  const handleDelete = useCallback(async (sessionId: string) => {
    setBusyIds(prev => new Set(prev).add(sessionId));
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      setError(`Failed to delete: ${err}`);
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }, []);

  if (!characterId) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <MessageCircle className="mx-auto mb-4 h-12 w-12 text-white/30" />
          <p className={cn(typography.body.size, "text-white/60")}>
            Character not found
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border border-white/10 border-t-white/60" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Header */}
      <div
        className="border-b border-white/10 px-4 py-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className={cn(
              "flex flex-shrink-0 items-center justify-center border border-white/15 bg-white/5 text-white/70",
              radius.full,
              "active:scale-95 transition-transform"
            )}
          >
            <ArrowLeft height={16} width={16} />
          </button>
          <div className="min-w-0 text-left overflow-hidden">
            <h1 className={cn(
              typography.h1.size,
              typography.h1.weight,
              "text-white text-left truncate whitespace-nowrap"
            )}>
              Chat History
            </h1>
            {character && (
              <p className={cn(
                typography.bodySmall.size,
                "text-white/50 mt-1 text-left truncate whitespace-nowrap"
              )}>
                {character.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className={cn(
            "mb-4 p-4 border border-red-400/30 bg-red-400/10 text-center",
            radius.lg
          )}>
            <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-400" />
            <p className={cn(typography.bodySmall.size, "text-red-200")}>
              {error}
            </p>
            <button
              onClick={() => window.location.reload()}
              className={cn(
                "mt-3 px-4 py-2 border border-red-400/40 bg-red-400/20 text-red-100",
                radius.md,
                "active:scale-95 transition-transform"
              )}
            >
              Retry
            </button>
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="text-center py-20">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 text-white/30" />
            <h3 className={cn(typography.h3.size, typography.h3.weight, "text-white/70 mb-2")}>
              No conversations yet
            </h3>
            <p className={cn(typography.bodySmall.size, "text-white/40 mb-6")}>
              Start chatting to see your history here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onSelect={() => navigate(`/chat/${characterId}?sessionId=${session.id}`)}
                onDelete={() => handleDelete(session.id)}
                isBusy={busyIds.has(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onSelect,
  onDelete,
  isBusy,
}: {
  session: SessionPreview;
  onSelect: () => void;
  onDelete: () => void;
  isBusy: boolean;
}) {
  return (
    <div className={cn(
      "border border-white/10 bg-white/5 overflow-hidden",
      radius.lg,
      session.archived && "border-amber-400/20 bg-amber-400/5"
    )}>
      {/* Main content - tap to open */}
      <button
        onClick={onSelect}
        disabled={isBusy}
        className="w-full p-4 text-left disabled:opacity-50 active:bg-white/10 transition-colors"
      >
        <h3 className={cn(typography.h3.size, typography.h3.weight, "text-white mb-2")}>
          {session.title}
        </h3>

        <p className={cn(typography.bodySmall.size, "text-white/50 mb-3")}>
          {formatTimeAgo(session.updatedAt)}
        </p>

        {session.lastMessage && (
          <p className={cn(typography.bodySmall.size, "text-white/70 line-clamp-2 leading-relaxed")}>
            {session.lastMessage}
          </p>
        )}
      </button>

      {/* Simple delete button */}
      <div className="px-4 pb-3 border-t border-white/5 pt-3">
        <button
          onClick={onDelete}
          disabled={isBusy}
          className={cn(
            "flex items-center gap-2 px-3 py-2 border border-white/10 bg-white/5 text-white/60",
            radius.md,
            typography.bodySmall.size,
            "active:scale-95 active:bg-red-400/10 active:text-red-300 active:border-red-400/40 disabled:opacity-50 transition-all"
          )}
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export default ChatHistoryPage;