import { useEffect, useState, memo } from "react";
import { Edit2, Trash2, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { listCharacters, createSession, listSessionIds, getSession, deleteCharacter } from "../../../core/storage/repo";
import type { Character } from "../../../core/storage/schemas";
import { typography, radius, spacing, interactive, cn } from "../../design-tokens";
import { BottomMenu } from "../../components";
import { useAvatar } from "../../hooks/useAvatar";
import { useAvatarGradient } from "../../hooks/useAvatarGradient";
import { exportCharacter, downloadJson, generateExportFilename } from "../../../core/storage/characterTransfer";

export function ChatPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
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

      const session = await createSession(
        character.id,
        "New Chat",
        undefined,
        character.scenes && character.scenes.length > 0 ? character.scenes[0].id : undefined
      );
      navigate(`/chat/${character.id}?sessionId=${session.id}`);
    } catch (error) {
      console.error("Failed to load or create session:", error);
      navigate(`/chat/${character.id}`);
    }
  };

  const handleEditCharacter = (character: Character) => {
    navigate(`/settings/characters/${character.id}/edit`);
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

  const handleExport = async () => {
    if (!selectedCharacter) return;

    try {
      setExporting(true);
      const exportJson = await exportCharacter(selectedCharacter.id);
      const filename = generateExportFilename(selectedCharacter.name);
      await downloadJson(exportJson, filename);
      setSelectedCharacter(null);
    } catch (err) {
      console.error("Failed to export character:", err);
    } finally {
      setExporting(false);
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
        includeExitIcon={false}
        title={selectedCharacter?.name || ""}
      >
        {selectedCharacter && (
          <div className="space-y-2">
            <button
              onClick={() => handleEditCharacter(selectedCharacter)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10">
                <Edit2 className="h-4 w-4 text-white/70" />
              </div>
              <span className="text-sm font-medium text-white">Edit Character</span>
            </button>

            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex w-full items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-3 text-left transition hover:border-blue-400/50 hover:bg-blue-400/20 disabled:opacity-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/30 bg-blue-400/20">
                <Download className="h-4 w-4 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-blue-300">
                {exporting ? "Exporting..." : "Export Character"}
              </span>
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
  const [visibleCount, setVisibleCount] = useState(5);

  useEffect(() => {
    if (visibleCount < characters.length) {
      const timer = setTimeout(() => {
        setVisibleCount(prev => Math.min(prev + 5, characters.length));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, characters.length]);

  useEffect(() => {
    setVisibleCount(5);
  }, [characters]);

  return (
    <div className="space-y-2 pb-24">
      {characters.slice(0, visibleCount).map((character) => (
        <CharacterCard
          key={character.id}
          character={character}
          onSelect={onSelect}
          onLongPress={onLongPress}
        />
      ))}
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

const CharacterAvatar = memo(({ character, className }: { character: Character, className?: string }) => {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  if (avatarUrl && isImageLike(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt={`${character.name} avatar`}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  const initials = character.name.slice(0, 2).toUpperCase();
  return <span className={cn("flex h-full w-full items-center justify-center text-2xl font-bold", className)}>{initials}</span>;
});

CharacterAvatar.displayName = 'CharacterAvatar';

const CharacterCard = memo(({
  character,
  onSelect,
  onLongPress
}: {
  character: Character;
  onSelect: (character: Character) => void;
  onLongPress: (character: Character) => void;
}) => {
  const descriptionPreview = character.description?.trim() || "No description yet";
  const { gradientCss, hasGradient, textColor, textSecondary } = useAvatarGradient(
    "character",
    character.id,
    character.avatarPath,
    character.disableAvatarGradient
  );

  const handleClick = () => {
    onSelect(character);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onLongPress(character);
  };

  return (
    <motion.button
      layoutId={`character-${character.id}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={cn(
        "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl text-left bg-white/5",
        interactive.transition.default,
        "hover:border-white/20 hover:bg-white/[0.08]",
        interactive.active.scale,
        hasGradient ? "" : "border border-white/10"
      )}
      style={hasGradient ? { background: gradientCss } : {}}
    >
      {/* Avatar */}
      <div className={cn(
        "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl",
        "border border-white/10 bg-white/10",
        "shadow-lg"
      )}>
        <CharacterAvatar character={character} />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3
          className={cn(
            "truncate font-bold text-base",
            hasGradient ? "" : "text-white"
          )}
          style={hasGradient ? { color: textColor } : {}}
        >
          {character.name}
        </h3>
        <p
          className={cn(
            "line-clamp-1 text-sm",
            hasGradient ? "" : "text-white/60"
          )}
          style={hasGradient ? { color: textSecondary } : {}}
        >
          {descriptionPreview}
        </p>
      </div>

      {/* Arrow indicator */}
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        "border border-white/10 bg-white/5 text-white/40",
        "transition-colors group-hover:border-white/20 group-hover:bg-white/10 group-hover:text-white/80"
      )}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </motion.button>
  );
});


