import { useNavigate } from "react-router-dom";
import { Trash2, Edit2, ChevronRight, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Character } from "../../../core/storage/schemas";
import { BottomMenu } from "../../components";
import { typography, radius, interactive, cn } from "../../design-tokens";
import { useCharactersController } from "../characters/hooks/useCharactersController";

const CharacterSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-xl border border-white/10 bg-[#0b0c12]/90 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-48 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="flex h-64 flex-col items-center justify-center">
    <Sparkles className="mb-3 h-12 w-12 text-white/20" />
    <h3 className="mb-1 text-lg font-medium text-white">No characters yet</h3>
    <p className="mb-4 text-center text-sm text-white/50">
      Create custom AI characters with unique personalities
    </p>
    <button
      onClick={onCreate}
      className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/30 active:scale-[0.99]"
    >
      Create Character
    </button>
  </div>
);

function isImageLike(s?: string) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}

function renderAvatar(character: Character) {
  if (character.avatarPath && isImageLike(character.avatarPath)) {
    return (
      <img
        src={character.avatarPath}
        alt={character.name}
        className="h-full w-full object-cover"
      />
    );
  }
  const initials = character.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return <span className="text-sm font-semibold">{initials}</span>;
}

export function CharactersPage() {
  const navigate = useNavigate();
  const {
    state: { characters, loading, selectedCharacter, showDeleteConfirm, deleting },
    setSelectedCharacter,
    setShowDeleteConfirm,
    handleDelete,
  } = useCharactersController();

  const handleEditCharacter = (character: Character) => {
    navigate(`/characters/${character.id}/edit`);
  };

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        {loading ? (
          <CharacterSkeleton />
        ) : characters.length === 0 ? (
          <EmptyState onCreate={() => navigate("/create/character")} />
        ) : (
          <div className="space-y-3">
            {/* Characters List */}
            <AnimatePresence mode="popLayout">
              {characters.map((character, index) => {
                const descriptionPreview = character.description?.trim() || "No description yet";
                
                return (
                  <motion.button
                    key={character.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => setSelectedCharacter(character)}
                    className={cn(
                      "group relative flex w-full items-center gap-3 overflow-hidden px-4 py-3 text-left",
                      radius.md,
                      "border border-white/10 bg-[#0b0c12]/90",
                      interactive.transition.default,
                      "hover:border-white/25 hover:bg-[#0c0d13]/95",
                      interactive.active.scale
                    )}
                  >
                    {/* Hover gradient effect */}
                    <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-purple-500/10 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />

                    {/* Avatar */}
                    <div className={cn(
                      "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden",
                      radius.lg,
                      "border border-white/15 bg-white/8",
                      typography.body.size,
                      typography.body.weight,
                      "text-white"
                    )}>
                      {renderAvatar(character)}
                    </div>

                    {/* Content */}
                    <div className="relative min-w-0 flex-1">
                      <h3 className={cn(
                        "truncate",
                        typography.body.size,
                        typography.h3.weight,
                        "text-white"
                      )}>
                        {character.name}
                      </h3>
                      <p className={cn(
                        typography.bodySmall.size,
                        "line-clamp-1 text-gray-400"
                      )}>
                        {descriptionPreview}
                      </p>
                    </div>

                    {/* Arrow indicator */}
                    <span className={cn(
                      "relative flex h-9 w-9 shrink-0 items-center justify-center",
                      radius.full,
                      "border border-white/10 bg-white/5 text-white/70",
                      "transition-all group-hover:border-white/25 group-hover:text-white"
                    )}>
                      <ChevronRight size={16} />
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
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
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10">
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
              onClick={() => void handleDelete()}
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
