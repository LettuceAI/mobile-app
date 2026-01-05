import { useEffect, useState, memo, useRef } from "react";
import { Trash2, Settings, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

import { storageBridge } from "../../../core/storage/files";
import { listCharacters } from "../../../core/storage/repo";
import type { GroupSessionPreview, Character } from "../../../core/storage/schemas";
import { typography, radius, spacing, interactive, cn } from "../../design-tokens";
import { BottomMenu } from "../../components";
import { Routes } from "../../navigation";
import { useAvatar } from "../../hooks/useAvatar";

export function GroupChatsListPage() {
  const [groupSessions, setGroupSessions] = useState<GroupSessionPreview[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<GroupSessionPreview | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [sessions, chars] = await Promise.all([
        storageBridge.groupSessionsList(),
        listCharacters(),
      ]);
      setGroupSessions(sessions);
      setCharacters(chars);
    } catch (err) {
      console.error("Failed to load group sessions:", err);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await loadData();
      } finally {
        setLoading(false);
      }
    })();

    let unlisten: UnlistenFn | null = null;
    (async () => {
      unlisten = await listen("database-reloaded", () => {
        console.log("Database reloaded, refreshing group sessions...");
        loadData();
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const openGroupChat = (session: GroupSessionPreview) => {
    navigate(Routes.groupChat(session.id));
  };

  const handleDelete = async () => {
    if (!selectedSession) return;

    try {
      setDeleting(true);
      await storageBridge.groupSessionDelete(selectedSession.id);
      await loadData();
      setShowDeleteConfirm(false);
      setSelectedSession(null);
    } catch (err) {
      console.error("Failed to delete group session:", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col pb-6 text-gray-200">
      <main className="flex-1 overflow-y-auto px-1 lg:px-8 pt-4 mx-auto w-full max-w-md lg:max-w-none">
        {loading ? (
          <GroupSessionSkeleton />
        ) : groupSessions.length ? (
          <GroupSessionList
            sessions={groupSessions}
            characters={characters}
            onSelect={openGroupChat}
            onLongPress={setSelectedSession}
          />
        ) : (
          <EmptyState />
        )}
      </main>

      {/* Session Actions Menu */}
      <BottomMenu
        isOpen={Boolean(selectedSession)}
        onClose={() => setSelectedSession(null)}
        includeExitIcon={false}
        title={selectedSession?.name || ""}
      >
        {selectedSession && (
          <div className="space-y-2">
            <button
              onClick={() => {
                navigate(Routes.groupChatSettings(selectedSession.id));
                setSelectedSession(null);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10">
                <Settings className="h-4 w-4 text-white/70" />
              </div>
              <span className="text-sm font-medium text-white">Edit Group</span>
            </button>

            <button
              onClick={() => {
                setShowDeleteConfirm(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left transition hover:border-red-500/50 hover:bg-red-500/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-red-500/30 bg-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-300">Delete Group</span>
            </button>
          </div>
        )}
      </BottomMenu>

      {/* Delete Confirmation */}
      <BottomMenu
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Group Chat?"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Are you sure you want to delete "{selectedSession?.name}"? This will also delete all
            messages in this group chat.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </BottomMenu>
    </div>
  );
}

function GroupSessionList({
  sessions,
  characters,
  onSelect,
  onLongPress,
}: {
  sessions: GroupSessionPreview[];
  characters: Character[];
  onSelect: (session: GroupSessionPreview) => void;
  onLongPress: (session: GroupSessionPreview) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    if (visibleCount < sessions.length) {
      const timer = setTimeout(() => {
        setVisibleCount((prev) => Math.min(prev + 10, sessions.length));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, sessions.length]);

  useEffect(() => {
    setVisibleCount(10);
  }, [sessions]);

  return (
    <div className="space-y-2 lg:space-y-3 pb-24">
      {sessions.slice(0, visibleCount).map((session) => (
        <GroupSessionCard
          key={session.id}
          session={session}
          characters={characters}
          onSelect={onSelect}
          onLongPress={onLongPress}
        />
      ))}
    </div>
  );
}

function GroupSessionSkeleton() {
  return (
    <div className={spacing.item}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={cn(
            "h-20 animate-pulse p-4",
            "rounded-2xl",
            "border border-white/5 bg-white/5",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded-full bg-white/10" />
              <div className="h-3 w-2/3 rounded-full bg-white/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className={cn(
        "p-8 text-center",
        radius.lg,
        "border border-dashed border-white/10 bg-white/2",
      )}
    >
      <div className={spacing.field}>
        <Users className="mx-auto h-12 w-12 text-white/30 mb-4" />
        <h3 className={cn(typography.h3.size, typography.h3.weight, "text-white")}>
          No group chats yet
        </h3>
        <p className={cn(typography.body.size, typography.body.lineHeight, "text-white/50")}>
          Create your first group chat from the + button below to have conversations with multiple
          characters at once
        </p>
      </div>
    </div>
  );
}

function isImageLike(s?: string) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return (
    lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image")
  );
}

const CharacterMiniAvatar = memo(({ character }: { character: Character }) => {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  if (avatarUrl && isImageLike(avatarUrl)) {
    return <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />;
  }

  // Fallback: initials
  const initials = character.name.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/60">
      {initials}
    </div>
  );
});

CharacterMiniAvatar.displayName = "CharacterMiniAvatar";

const GroupSessionCard = memo(
  ({
    session,
    characters,
    onSelect,
    onLongPress,
  }: {
    session: GroupSessionPreview;
    characters: Character[];
    onSelect: (session: GroupSessionPreview) => void;
    onLongPress: (session: GroupSessionPreview) => void;
  }) => {
    const longPressTimer = useRef<number | null>(null);
    const isLongPress = useRef(false);

    const characterNames = session.characterIds
      .map((id) => characters.find((c) => c.id === id)?.name || "Unknown")
      .slice(0, 3)
      .join(", ");

    const extraCount = session.characterIds.length - 3;
    const characterSummary =
      extraCount > 0 ? `${characterNames} +${extraCount} more` : characterNames;

    const handlePointerDown = () => {
      isLongPress.current = false;
      longPressTimer.current = window.setTimeout(() => {
        isLongPress.current = true;
        onLongPress(session);
      }, 500);
    };

    const handlePointerUp = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handlePointerLeave = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleClick = () => {
      if (isLongPress.current) {
        isLongPress.current = false;
        return;
      }
      onSelect(session);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress(session);
    };

    // Get first 3 character avatars for stacked display
    const avatarCharacters = session.characterIds
      .slice(0, 3)
      .map((id) => characters.find((c) => c.id === id))
      .filter(Boolean) as Character[];

    return (
      <motion.button
        layoutId={`group-session-${session.id}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className={cn(
          "group relative flex w-full items-center gap-3.5 lg:gap-6 p-3.5 lg:p-6 text-left",
          "rounded-2xl lg:rounded-3xl",
          interactive.transition.default,
          interactive.active.scale,
          "bg-[#1a1b23] hover:bg-[#22232d]",
        )}
      >
        {/* Stacked Avatars */}
        <div className="relative h-14 w-14 lg:h-20 lg:w-20 shrink-0">
          {avatarCharacters.map((char, index) => (
            <div
              key={char.id}
              className={cn(
                "absolute h-10 w-10 lg:h-14 lg:w-14 overflow-hidden rounded-full",
                "border-2 border-[#1a1b23]",
                "bg-linear-to-br from-white/10 to-white/5",
              )}
              style={{
                left: `${index * 12}px`,
                zIndex: 3 - index,
              }}
            >
              <CharacterMiniAvatar character={char} />
            </div>
          ))}
          {session.characterIds.length > 3 && (
            <div
              className={cn(
                "absolute h-10 w-10 lg:h-14 lg:w-14 overflow-hidden rounded-full",
                "border-2 border-[#1a1b23]",
                "bg-white/10",
                "flex items-center justify-center",
              )}
              style={{
                left: `${3 * 12}px`,
                zIndex: 0,
              }}
            >
              <span className="text-xs font-medium text-white/60">
                +{session.characterIds.length - 3}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:gap-1.5 py-1">
          <h3 className="truncate font-semibold text-[15px] lg:text-xl leading-tight text-white">
            {session.name}
          </h3>
          <p className="line-clamp-1 text-[13px] lg:text-base leading-tight text-white/50">
            {characterSummary}
          </p>
          {session.lastMessage && (
            <p className="line-clamp-1 text-[12px] lg:text-sm leading-tight text-white/30 mt-1">
              {session.lastMessage}
            </p>
          )}
        </div>

        {/* Message count badge */}
        {session.messageCount > 0 && (
          <div className="shrink-0 px-2 py-1 rounded-full bg-white/10 text-xs text-white/50">
            {session.messageCount} {session.messageCount === 1 ? "msg" : "msgs"}
          </div>
        )}

        {/* Chevron */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-white/30 group-hover:text-white/60 transition-all"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </motion.button>
    );
  },
);

GroupSessionCard.displayName = "GroupSessionCard";
