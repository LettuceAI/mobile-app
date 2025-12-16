import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Brain, Loader2, AlertTriangle, Search, BookOpen } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import type { Character, Session } from "../../../../core/storage/schemas";
import { useAvatar } from "../../../hooks/useAvatar";
import { listen } from "@tauri-apps/api/event";
import { Routes } from "../../../navigation";

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
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  useEffect(() => {
    let unlistenProcessing: (() => void) | undefined;
    let unlistenSuccess: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenProcessing = await listen("dynamic-memory:processing", (event: any) => {
        // Check if event belongs to current session?
        // Payload might have sessionId. 
        // For now, assuming global or checking payload if available.
        // User didn't specify sessionId filter strictly but it's good practice.
        // The event payload is { sessionId }.
        if (event.payload?.sessionId && sessionId && event.payload.sessionId !== sessionId) return;
        setMemoryBusy(true);
      });

      unlistenSuccess = await listen("dynamic-memory:success", (event: any) => {
        if (event.payload?.sessionId && sessionId && event.payload.sessionId !== sessionId) return;
        setMemoryBusy(false);
        setMemoryError(null);
        onSessionUpdate?.();
      });

      unlistenError = await listen("dynamic-memory:error", (event: any) => {
        if (event.payload?.sessionId && sessionId && event.payload.sessionId !== sessionId) return;
        setMemoryBusy(false);
        setMemoryError(typeof event.payload === 'string' ? event.payload : (event.payload?.error || "Unknown error"));
      });
    };

    setupListeners();

    return () => {
      unlistenProcessing?.();
      unlistenSuccess?.();
      unlistenError?.();
    };
  }, [sessionId, onSessionUpdate]);

  const avatarImageUrl = useMemo(() => {
    if (avatarUrl && isImageLike(avatarUrl)) return avatarUrl;
    return null;
  }, [avatarUrl]);

  const initials = useMemo(() => {
    return character?.name
      ? character.name.slice(0, 2).toUpperCase()
      : "?";
  }, [character]);

  const avatarFallback = (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
      {initials}
    </div>
  );

  const headerTitle = useMemo(() => character?.name ?? "Unknown", [character?.name]);

  return (
    <>
      <header className={`z-20 shrink-0 border-b border-white/10 px-4 pb-3 pt-10 ${!hasBackgroundImage ? 'bg-[#050505]' : ''}`}>
        <div className="flex items-center">
          <button
            onClick={() => navigate("/chat")}
            className="flex shrink-0 items-center justify-center -ml-2 text-white transition hover:text-white/80"
            aria-label="Back"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
          </button>

          <button
            onClick={() => {
              if (!characterId) return;
              navigate(Routes.chatSettingsSession(characterId, sessionId));
            }}
            className="min-w-0 flex-1 text-left truncate text-xl font-bold text-white/90 p-0 hover:opacity-80 transition-opacity"
            aria-label="Open chat settings"
          >
            {headerTitle}
          </button>

          <div className="flex shrink-0 items-center gap-1">
            {/* Memory Button */}
            {session && (
              <button
                onClick={() => {
                  if (!characterId || !sessionId) return;
                  navigate(Routes.chatMemories(characterId, sessionId, memoryError ? { error: memoryError } : undefined));
                }}
                className="relative flex h-10 w-10 items-center justify-center text-white/80 transition hover:text-white"
                aria-label="Manage memories"
              >
                {memoryBusy ? (
                  <Loader2 size={14} strokeWidth={2.5} className="animate-spin text-emerald-400" />
                ) : memoryError ? (
                  <AlertTriangle size={14} strokeWidth={2.5} className="text-red-400" />
                ) : (
                  <Brain size={14} strokeWidth={2.5} />
                )}
                {!memoryBusy && !memoryError && session.memories && session.memories.length > 0 && (
                  <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[3px] font-semibold leading-none text-[#050505]">
                    {session.memories.length}
                  </span>
                )}
              </button>
            )}

            {/* Search Button */}
            {session && (
              <button
                onClick={() => {
                  if (!characterId || !sessionId) return;
                  navigate(Routes.chatSearch(characterId, sessionId));
                }}
                className="flex items-center justify-center text-white/80 transition hover:text-white"
                aria-label="Search messages"
              >
                <Search size={14} strokeWidth={2.5} />
              </button>
            )}

            {/* Lorebooks Button */}
            <button
              onClick={() => {
                if (!characterId) return;
                navigate(Routes.characterLorebook(characterId));
              }}
              className="flex items-center justify-center text-white/80 transition hover:text-white"
              aria-label="Manage lorebooks"
            >
              <BookOpen size={14} strokeWidth={2.5} />
            </button>

            {/* Avatar (Settings) Button */}
            <button
              onClick={() => {
                if (!characterId) return;
                navigate(Routes.chatSettingsSession(characterId, sessionId));
              }}
              className="relative shrink-0 rounded-full overflow-hidden ring-1 ring-white/20 transition hover:ring-white/40"
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', flexShrink: 0 }}
              aria-label="Conversation settings"
            >
              {avatarImageUrl ? (
                <img
                  src={avatarImageUrl}
                  alt={character?.name || "Avatar"}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ width: '36px', height: '36px' }}
                />
              ) : (
                avatarFallback
              )}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
