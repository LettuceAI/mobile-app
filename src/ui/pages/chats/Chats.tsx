import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { listCharacters } from "../../../core/storage/repo";
import type { Character } from "../../../core/storage/schemas";
import { getDemoCharacters } from "./demoCharacters";

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
            className="group relative flex h-[96px] w-full min-w-0 max-w-full items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c12]/90 px-4 text-left transition hover:border-white/25"
            style={{ width: "100%" }}
          >
            <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-emerald-500/10 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />

            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-40" />
              <div className="relative z-10 flex h-full w-full items-center justify-center">
                {renderAvatar(character, true)}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-white">{character.name}</p>
                {updatedLabel && (
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.2em] text-gray-500">
                    {updatedLabel}
                  </span>
                )}
              </div>

              <p className="text-[11px] leading-5 text-gray-400 line-clamp-2">{descriptionPreview}</p>
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
          className="animate-pulse h-[96px] rounded-2xl border border-white/5 bg-white/5 px-4"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/10" />
            <div className="flex-1 space-y-3">
              <div className="h-3 w-1/3 rounded-full bg-white/10" />
              <div className="h-3 w-full rounded-full bg-white/5" />
              <div className="flex gap-2">
                <div className="h-3 w-24 rounded-full bg-white/5" />
                <div className="h-3 w-28 rounded-full bg-white/5" />
              </div>
            </div>
            <div className="h-9 w-9 rounded-full border border-white/10 bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-white/12 bg-[#0b0c12] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">No characters yet</h3>
        <p className="text-xs text-gray-400">
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

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
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
