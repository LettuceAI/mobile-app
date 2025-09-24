import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { listCharacters } from "../../../core/storage/repo";
import type { Character } from "../../../core/storage/schemas";

export function ChatPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
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

  const startChat = (character: Character) => {
    navigate(`/chat/${character.id}`);
  };

  return (
    <div className="flex h-full flex-col pb-6 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        {loading ? (
          <CharacterSkeleton />
        ) : characters.length ? (
          <CharacterList characters={characters} onSelect={startChat} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function CharacterList({ characters, onSelect }: { characters: Character[]; onSelect: (character: Character) => void }) {
  return (
    <div className="space-y-3">
      {characters.map((character) => {
        const descriptionPreview = character.description?.trim() || "Tap to add a character description.";
        const updatedLabel = formatUpdatedAt(character.updatedAt);

        return (
          <button
            key={character.id}
            onClick={() => onSelect(character)}
            className="group relative flex h-20 w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#0b0c12]/90 px-4 py-3 text-left transition-all duration-200 hover:border-white/25 hover:bg-[#0c0d13]/95 active:scale-[0.995]"
          >
            <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-emerald-500/10 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />

            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/8 text-sm font-semibold text-white">
              {renderAvatar(character, true)}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <div className="flex items-center justify-between">
                <h3 className="truncate text-sm font-semibold text-white">{character.name}</h3>
                {updatedLabel && (
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.15em] text-gray-500">
                    {updatedLabel}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-gray-400 line-clamp-1">{descriptionPreview}</p>
            </div>

            <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition group-hover:border-white/25 group-hover:text-white">
              <ArrowRight size={16} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CharacterSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="animate-pulse h-20 rounded-xl border border-white/5 bg-white/5 px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded-full bg-white/10" />
              <div className="h-2.5 w-full rounded-full bg-white/5" />
            </div>
            <div className="h-8 w-8 rounded-full border border-white/10 bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-[#0b0c12]/50 p-8 text-center backdrop-blur-sm">
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-white">No characters yet</h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          Create a new character from the tab bar below to start your first conversation.
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

function renderAvatar(c: Character, isLarge = false) {
  const v = c.avatarPath || "";
  if (isImageLike(v)) {
    return (
      <img
        src={v}
        alt="avatar"
        className={`object-cover ${isLarge ? "h-12 w-12" : "h-10 w-10"}`}
      />
    );
  }
  const display = v || c.name.slice(0, 2).toUpperCase();
  return <span className="text-white">{display}</span>;
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
