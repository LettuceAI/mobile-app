import { useMemo, useState } from "react";
import { ArrowLeft, Settings, Brain } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import type { Character, Session } from "../../../../core/storage/schemas";
import { useAvatar } from "../../../hooks/useAvatar";
import { BottomMenu, MenuSection } from "../../../components";
import { MemoryManager } from "./MemoryManager";
import { addMemory, removeMemory, updateMemory } from "../../../../core/storage";

interface ChatHeaderProps {
  character: Character;
  sessionId?: string;
  session?: Session | null;
  hasBackgroundImage?: boolean;
  onSessionUpdate?: () => void;
}

function isImageLike(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}

export function ChatHeader({ character, sessionId, session, hasBackgroundImage, onSessionUpdate }: ChatHeaderProps) {
  const navigate = useNavigate();
  const { characterId } = useParams<{ characterId: string }>();
  const avatarUrl = useAvatar("character", character?.id, character?.avatarPath);
  const [showMemoryMenu, setShowMemoryMenu] = useState(false);

  const avatarDisplay = useMemo(() => {
    if (avatarUrl && isImageLike(avatarUrl)) {
      return (
        <img
          src={avatarUrl}
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
  }, [character, avatarUrl]);

  const headerTitle = useMemo(() => character?.name ?? "Unknown", [character?.name]);

  const handleAddMemory = async (memory: string) => {
    if (!sessionId) return;
    await addMemory(sessionId, memory);
    onSessionUpdate?.();
  };

  const handleRemoveMemory = async (index: number) => {
    if (!sessionId) return;
    await removeMemory(sessionId, index);
    onSessionUpdate?.();
  };

  const handleUpdateMemory = async (index: number, memory: string) => {
    if (!sessionId) return;
    await updateMemory(sessionId, index, memory);
    onSessionUpdate?.();
  };

  return (
    <>
      <header className={`z-20 flex-shrink-0 border-b border-white/10 px-3 pb-3 pt-10 ${!hasBackgroundImage ? 'bg-[#050505]' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => navigate("/chat")}
              className="flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
              aria-label="Back"
            >
              <ArrowLeft size={14} />
            </button>
            {avatarDisplay}
            <button
              onClick={() => {
                if (!characterId) return;
                const settingsUrl = `/chat/${characterId}/settings?sessionId=${sessionId}`;
                console.log("Navigating to:", settingsUrl);
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
          <div className="flex shrink-0 items-center gap-2">
            {session && (
              <button
                onClick={() => setShowMemoryMenu(true)}
                className="relative flex items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
                aria-label="Manage memories"
              >
                <Brain size={14} />
                {session.memories && session.memories.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                    {session.memories.length}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => {
                if (!characterId) return;
                const settingsUrl = sessionId 
                  ? `/chat/${characterId}/settings?sessionId=${sessionId}`
                  : `/chat/${characterId}/settings`;
                navigate(settingsUrl);
              }}
              className="flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
              aria-label="Conversation settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Memory Management Menu */}
      <BottomMenu
        isOpen={showMemoryMenu}
        onClose={() => setShowMemoryMenu(false)}
        title="Conversation Memories"
        includeExitIcon={true}
        location="bottom"
      >
        <MenuSection>
          {session ? (
            <MemoryManager
              memories={session.memories || []}
              onAdd={handleAddMemory}
              onRemove={handleRemoveMemory}
              onUpdate={handleUpdateMemory}
            />
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-6 py-4 text-sm text-amber-200">
              No active session. Start a conversation first.
            </div>
          )}
        </MenuSection>
      </BottomMenu>
    </>
  );
}