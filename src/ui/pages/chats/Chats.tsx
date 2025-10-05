import { useEffect, useState } from "react";
import { Edit2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { listCharacters, createSession, listSessionIds, getSession, deleteCharacter } from "../../../core/storage/repo";
import type { Character } from "../../../core/storage/schemas";
import { typography, radius, spacing, interactive, cn } from "../../design-tokens";
import { BottomMenu } from "../../components";

export function ChatPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        let list = await listCharacters();
        setCharacters(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadCharacters = async () => {
    try {
      let list = await listCharacters();
      setCharacters(list);
    } catch (err) {
      console.error("Failed to load characters:", err);
    }
  };

  const startChat = async (character: Character) => {
    try {
      const allSessionIds = await listSessionIds();
      
      if (allSessionIds.length > 0) {
        const sessions = await Promise.all(
          allSessionIds.map((id) => getSession(id).catch(() => null))
        );
        
        const characterSessions = sessions
          .filter((session): session is NonNullable<typeof session> => 
            session !== null && session.characterId === character.id
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);
        
        if (characterSessions.length > 0) {
          const latestSession = characterSessions[0];
          navigate(`/chat/${character.id}?sessionId=${latestSession.id}`);
          return;
        }
      }
      
      const session = await createSession(character.id, "New Chat");
      navigate(`/chat/${character.id}?sessionId=${session.id}`);
    } catch (error) {
      console.error("Failed to load or create session:", error);
      navigate(`/chat/${character.id}`);
    }
  };

  const handleEditCharacter = (character: Character) => {
    navigate(`/characters/${character.id}/edit`);
  };

  const handleDelete = async () => {
    if (!selectedCharacter) return;

    try {
      setDeleting(true);
      await deleteCharacter(selectedCharacter.id);
      await loadCharacters();
      setShowDeleteConfirm(false);
      setSelectedCharacter(null);
    } catch (err) {
      console.error("Failed to delete character:", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col pb-6 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        {loading ? (
          <CharacterSkeleton />
        ) : characters.length ? (
          <CharacterList 
            characters={characters} 
            onSelect={startChat}
            onLongPress={setSelectedCharacter}
          />
        ) : (
          <EmptyState />
        )}
      </main>

      {/* Character Actions Menu */}
      <BottomMenu
        isOpen={Boolean(selectedCharacter)}
        onClose={() => setSelectedCharacter(null)}
        title={selectedCharacter?.name || ""}
      >
        {selectedCharacter && (
          <div className="space-y-2">
            <button
              onClick={() => handleEditCharacter(selectedCharacter)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                <Edit2 className="h-4 w-4 text-white/70" />
              </div>
              <span className="text-sm font-medium text-white">Edit Character</span>
            </button>

            <button
              onClick={() => {
                setShowDeleteConfirm(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left transition hover:border-red-500/50 hover:bg-red-500/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-300">Delete Character</span>
            </button>
          </div>
        )}
      </BottomMenu>

      {/* Delete Confirmation */}
      <BottomMenu
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Character?"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Are you sure you want to delete "{selectedCharacter?.name}"? This will also delete all chat sessions with this character.
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

function CharacterList({ 
  characters, 
  onSelect, 
  onLongPress 
}: { 
  characters: Character[]; 
  onSelect: (character: Character) => void | Promise<void>;
  onLongPress: (character: Character) => void;
}) {
  const handleClick = (character: Character) => {
    void onSelect(character);
  };

  const handleContextMenu = (character: Character, e: React.MouseEvent) => {
    e.preventDefault();
    onLongPress(character);
  };

  return (
    <div className={spacing.item}>
      {characters.map((character) => {
        const descriptionPreview = character.description?.trim() || "No description yet";
        const updatedLabel = formatUpdatedAt(character.updatedAt);

        return (
          <div key={character.id} className="relative">
            <button
              onClick={() => handleClick(character)}
              onContextMenu={(e) => handleContextMenu(character, e)}
              className={cn(
                "group relative flex h-[72px] w-full items-center gap-3 overflow-hidden px-4 py-3 text-left",
                radius.md,
                "border border-white/10 bg-white/5",
                interactive.transition.default,
                "hover:border-white/20 hover:bg-white/[0.08]",
                interactive.active.scale
              )}
            >
              {/* Hover gradient effect */}
              <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-emerald-400/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

              {/* Avatar */}
              <div className={cn(
                "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden",
                radius.md,
                "border border-white/15 bg-white/5",
                typography.body.size,
                typography.body.weight,
                "text-white"
              )}>
                {renderAvatar(character)}
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={cn(
                    "truncate",
                    typography.body.size,
                    typography.h3.weight,
                    "text-white"
                  )}>
                    {character.name}
                  </h3>
                  {updatedLabel && (
                    <span className={cn(
                      "shrink-0",
                      typography.overline.size,
                      typography.overline.weight,
                      typography.overline.tracking,
                      "uppercase text-white/30"
                    )}>
                      {updatedLabel}
                    </span>
                  )}
                </div>
                <p className={cn(
                  typography.bodySmall.size,
                  "text-white/50 line-clamp-1"
                )}>
                  {descriptionPreview}
                </p>
              </div>

              {/* Arrow indicator */}
              <span className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center",
                radius.full,
                "border border-white/10 bg-white/5 text-white/50",
                "transition-all group-hover:border-white/20 group-hover:bg-white/10 group-hover:text-white/80"
              )}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </button>

            {/* Options button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLongPress(character);
              }}
              className={cn(
                "absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center",
                radius.full,
                "border border-white/15 bg-[#050505]/90 backdrop-blur-sm text-white/70",
                interactive.transition.default,
                "hover:border-white/30 hover:bg-white/10 hover:text-white",
                interactive.active.scale
              )}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CharacterSkeleton() {
  return (
    <div className={spacing.item}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={cn(
            "h-[72px] animate-pulse px-4 py-3",
            radius.md,
            "border border-white/5 bg-white/5"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn("h-12 w-12", radius.md, "bg-white/10")} />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded-full bg-white/10" />
              <div className="h-3 w-full rounded-full bg-white/5" />
            </div>
            <div className={cn("h-8 w-8", radius.full, "border border-white/10 bg-white/5")} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className={cn(
      "p-8 text-center",
      radius.lg,
      "border border-dashed border-white/10 bg-white/[0.02]"
    )}>
      <div className={spacing.field}>
        <h3 className={cn(
          typography.h3.size,
          typography.h3.weight,
          "text-white"
        )}>
          No characters yet
        </h3>
        <p className={cn(
          typography.body.size,
          typography.body.lineHeight,
          "text-white/50"
        )}>
          Create your first character from the + button below to start chatting
        </p>
      </div>
    </div>
  );
}

function isImageLike(s?: string) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}

function renderAvatar(c: Character) {
  const v = c.avatarPath || "";
  if (isImageLike(v)) {
    return (
      <img
        src={v}
        alt={`${c.name} avatar`}
        className="h-12 w-12 object-cover"
      />
    );
  }
  const display = v || c.name.slice(0, 2).toUpperCase();
  return <span>{display}</span>;
}



function formatUpdatedAt(timestamp: number) {
  if (!timestamp) return "";
  const now = Date.now();
  const diffSeconds = Math.round((now - timestamp) / 1000);
  if (!Number.isFinite(diffSeconds) || diffSeconds < 0) return "";

  if (diffSeconds < 45) return "Updated just now";

  const units: Array<{ label: string; seconds: number }> = [
    { label: "minute", seconds: 60 },
    { label: "hour", seconds: 3600 },
    { label: "day", seconds: 86400 },
    { label: "week", seconds: 604800 },
    { label: "month", seconds: 2592000 },
    { label: "year", seconds: 31536000 },
  ];

  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (diffSeconds >= unit.seconds) {
      const value = Math.floor(diffSeconds / unit.seconds);
      return `Updated ${value} ${unit.label}${value > 1 ? "s" : ""} ago`;
    }
  }

  return "Updated moments ago";
}
