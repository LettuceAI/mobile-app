import { useMemo } from "react";
import { ArrowLeft, Settings } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import type { Character } from "../../../../core/storage/schemas";

interface ChatHeaderProps {
  character: Character;
  sessionId?: string;
}

function isImageLike(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}

export function ChatHeader({ character, sessionId }: ChatHeaderProps) {
  const navigate = useNavigate();
  const { characterId } = useParams<{ characterId: string }>();

  const avatarDisplay = useMemo(() => {
    if (character?.avatarPath && isImageLike(character.avatarPath)) {
      return (
        <img
          src={character.avatarPath}
          alt={character?.name ?? "avatar"}
          className="h-10 w-10 rounded-xl object-cover"
        />
      );
    }

    const initials = character?.name ? character.name.slice(0, 2).toUpperCase() : "?";
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm font-semibold text-white">
        {initials}
      </div>
    );
  }, [character]);

  const headerTitle = useMemo(() => character?.name ?? "Unknown", [character?.name]);

  return (
    <header className="z-20 flex-shrink-0 border-b border-white/10 bg-[#050505]/95 px-3 pb-3 pt-10 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={() => navigate("/chat")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          {avatarDisplay}
          <button
            onClick={() => {
              if (!characterId) return;
              const settingsUrl = sessionId 
                ? `/chat/${characterId}/settings?sessionId=${sessionId}`
                : `/chat/${characterId}/settings`;
              
              console.log("Navigating to:", settingsUrl)
              navigate(settingsUrl);
            }}
            className="min-w-0 flex-1 text-left"
            aria-label="Open chat settings"
          >
            <p className="truncate text-sm font-semibold text-white">{headerTitle}</p>
            {character.description && (
              <p className="truncate text-xs text-gray-400">{character.description}</p>
            )}
          </button>
        </div>
        <button
          onClick={() => {
            if (!characterId) return;
            const settingsUrl = sessionId 
              ? `/chat/${characterId}/settings?sessionId=${sessionId}`
              : `/chat/${characterId}/settings`;
            navigate(settingsUrl);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
          aria-label="Conversation settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}