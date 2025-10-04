import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { listCharacters } from "../../../core/storage/repo";
import type { Character } from "../../../core/storage/schemas";
import { typography, radius, spacing, interactive, cn } from "../../design-tokens";

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
    <div className={spacing.item}>
      {characters.map((character) => {
        const descriptionPreview = character.description?.trim() || "No description yet";
        const updatedLabel = formatUpdatedAt(character.updatedAt);

        return (
          <button
            key={character.id}
            onClick={() => onSelect(character)}
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
