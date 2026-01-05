import { useEffect, useState } from "react";
import { ArrowLeft, Check, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { storageBridge } from "../../../core/storage/files";
import { listCharacters } from "../../../core/storage/repo";
import type { Character } from "../../../core/storage/schemas";
import { typography, radius, interactive, cn } from "../../design-tokens";
import { useAvatar } from "../../hooks/useAvatar";
import { Routes } from "../../navigation";

export function GroupChatCreatePage() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const chars = await listCharacters();
        setCharacters(chars);
      } catch (err) {
        console.error("Failed to load characters:", err);
        setError("Failed to load characters");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleCharacter = (characterId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) {
        next.delete(characterId);
      } else {
        next.add(characterId);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (selectedIds.size < 2) {
      setError("Please select at least 2 characters for a group chat");
      return;
    }

    const name = groupName.trim() || generateDefaultName();

    try {
      setCreating(true);
      setError(null);

      const session = await storageBridge.groupSessionCreate(name, Array.from(selectedIds));

      // Navigate to the new group chat
      navigate(Routes.groupChat(session.id), { replace: true });
    } catch (err) {
      console.error("Failed to create group session:", err);
      setError("Failed to create group chat");
      setCreating(false);
    }
  };

  const generateDefaultName = (): string => {
    const selectedChars = characters.filter((c) => selectedIds.has(c.id));
    if (selectedChars.length <= 3) {
      return selectedChars.map((c) => c.name).join(", ");
    }
    return `${selectedChars
      .slice(0, 2)
      .map((c) => c.name)
      .join(", ")} & ${selectedChars.length - 2} others`;
  };

  const canCreate = selectedIds.size >= 2;

  return (
    <div className="flex h-full flex-col text-gray-200">
      {/* Header */}
      <header className="shrink-0 px-4 pb-3 pt-10 border-b border-white/10 bg-[#050505]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(Routes.groupChats)}
            className="flex shrink-0 items-center justify-center -ml-2 text-white transition hover:text-white/80"
            aria-label="Back"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
          </button>
          <h1 className="text-xl font-bold text-white/90">New Group Chat</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        {/* Group Name Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white/70 mb-2">
            Group Name (optional)
          </label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder={selectedIds.size >= 2 ? generateDefaultName() : "Enter group name..."}
            className={cn(
              "w-full px-4 py-3",
              radius.md,
              "border border-white/15 bg-white/5",
              "text-white placeholder:text-white/30",
              "focus:outline-none focus:border-white/30",
              interactive.transition.fast,
            )}
          />
        </div>

        {/* Character Selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-white/70">
              Select Characters ({selectedIds.size} selected)
            </label>
            {selectedIds.size < 2 && (
              <span className="text-xs text-amber-400/80">Min. 2 required</span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-16 animate-pulse",
                    radius.md,
                    "border border-white/5 bg-white/5",
                  )}
                />
              ))}
            </div>
          ) : characters.length === 0 ? (
            <div
              className={cn(
                "p-6 text-center",
                radius.md,
                "border border-dashed border-white/10 bg-white/2",
              )}
            >
              <Users className="mx-auto h-8 w-8 text-white/30 mb-2" />
              <p className="text-sm text-white/50">
                No characters yet. Create some characters first to start a group chat.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {characters.map((character) => (
                <CharacterSelectItem
                  key={character.id}
                  character={character}
                  selected={selectedIds.has(character.id)}
                  onToggle={() => toggleCharacter(character.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div
            className={cn(
              "mb-4 px-4 py-2.5",
              radius.md,
              "border border-red-400/30 bg-red-400/10",
              "text-sm text-red-200",
            )}
          >
            {error}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="shrink-0 px-4 py-4 border-t border-white/10 bg-[#050505]">
        <button
          onClick={handleCreate}
          disabled={!canCreate || creating}
          className={cn(
            "w-full py-3",
            radius.md,
            "font-medium",
            interactive.transition.fast,
            canCreate
              ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:border-emerald-400/60 hover:bg-emerald-400/30"
              : "border border-white/10 bg-white/5 text-white/30 cursor-not-allowed",
            "disabled:opacity-50",
          )}
        >
          {creating ? "Creating..." : `Create Group Chat (${selectedIds.size} characters)`}
        </button>
      </footer>
    </div>
  );
}

function CharacterSelectItem({
  character,
  selected,
  onToggle,
}: {
  character: Character;
  selected: boolean;
  onToggle: () => void;
}) {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left",
        radius.md,
        "border transition",
        selected
          ? "border-emerald-400/40 bg-emerald-400/10"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
        interactive.transition.fast,
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "relative h-12 w-12 shrink-0 overflow-hidden rounded-full",
          "bg-linear-to-br from-white/10 to-white/5",
          selected ? "ring-2 ring-emerald-400/50" : "ring-1 ring-white/10",
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/60">
            {character.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3
          className={cn(
            "truncate font-medium",
            typography.body.size,
            selected ? "text-emerald-100" : "text-white",
          )}
        >
          {character.name}
        </h3>
        {character.description && (
          <p
            className={cn(
              "truncate text-sm",
              selected ? "text-emerald-200/60" : "text-white/50",
            )}
          >
            {character.description}
          </p>
        )}
      </div>

      {/* Checkbox */}
      <div
        className={cn(
          "h-6 w-6 shrink-0 rounded-full flex items-center justify-center",
          "border transition",
          selected
            ? "border-emerald-400 bg-emerald-400 text-black"
            : "border-white/30 bg-transparent",
        )}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </div>
    </button>
  );
}
