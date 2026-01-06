import type { CSSProperties } from "react";
import { ArrowLeft, Settings, Sparkles } from "lucide-react";

import type { GroupSession, Character } from "../../../../core/storage/schemas";
import { cn } from "../../../design-tokens";
import { useAvatar } from "../../../hooks/useAvatar";

export function GroupChatHeader({
  session,
  characters,
  onBack,
  onSettings,
  onMemories,
}: {
  session: GroupSession;
  characters: Character[];
  onBack: () => void;
  onSettings: () => void;
  onMemories: () => void;
}) {
  return (
    <header className="border-b border-white/10 px-4 pb-3 pt-3">
      <div className="flex items-center">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center justify-center -ml-2 text-white transition hover:text-white/80"
          aria-label="Back"
        >
          <ArrowLeft size={14} strokeWidth={2.5} />
        </button>

        <div className="min-w-0 flex-1 ml-2">
          <h1 className="truncate text-lg font-bold text-white/90">{session.name}</h1>
          <p className="truncate text-xs text-white/50">{characters.length} characters</p>
        </div>

        <div className="relative flex items-center mr-2">
          {characters.slice(0, 4).map((char, index) => (
            <CharacterMiniAvatar
              key={char.id}
              character={char}
              style={{
                marginLeft: index > 0 ? "-8px" : "0",
                zIndex: 4 - index,
              }}
            />
          ))}
          {characters.length > 4 && (
            <div
              className={cn(
                "h-7 w-7 rounded-full",
                "border-2 border-[#050505] bg-white/20",
                "flex items-center justify-center",
                "text-[10px] font-medium text-white/70",
              )}
              style={{ marginLeft: "-8px", zIndex: 0 }}
            >
              +{characters.length - 4}
            </div>
          )}
        </div>

        <button
          onClick={onMemories}
          className="flex h-9 w-9 items-center justify-center text-white/70 hover:text-white transition"
          aria-label="Memories"
        >
          <Sparkles size={18} />
        </button>

        <button
          onClick={onSettings}
          className="flex h-9 w-9 items-center justify-center text-white/70 hover:text-white transition"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}

function CharacterMiniAvatar({
  character,
  style,
}: {
  character: Character;
  style?: CSSProperties;
}) {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  return (
    <div
      className={cn(
        "h-7 w-7 rounded-full overflow-hidden",
        "border-2 border-[#050505]",
        "bg-linear-to-br from-white/10 to-white/5",
      )}
      style={style}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white/60">
          {character.name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}
