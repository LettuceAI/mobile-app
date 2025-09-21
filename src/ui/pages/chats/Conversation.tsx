import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Settings } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { listCharacters } from "../../../core/storage/repo";
import type { Character } from "../../../core/storage/schemas";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const mockMessages: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content: "Hey there! I'm ready whenever you are.",
    timestamp: Date.now() - 1000 * 60 * 5,
  },
  {
    id: "2",
    role: "user",
    content: "Awesome, let's brainstorm some character ideas.",
    timestamp: Date.now() - 1000 * 60 * 4,
  },
  {
    id: "3",
    role: "assistant",
    content: "Great! Do you have a genre or vibe in mind to start with?",
    timestamp: Date.now() - 1000 * 60 * 3,
  },
];

export function ChatConversationPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();

  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages] = useState<ChatMessage[]>(mockMessages);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let list = await listCharacters();
        const match = list.find((c) => c.id === characterId) ?? null;
        if (!cancelled) {
          setCharacter(match);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const headerTitle = useMemo(() => character?.name ?? "Unknown" , [character?.name]);

  const avatarDisplay = useMemo(() => {
    if (character?.avatarPath && isImageLike(character.avatarPath)) {
      return <img src={character.avatarPath} alt={character?.name ?? "avatar"} className="h-10 w-10 rounded-xl object-cover" />;
    }

    const initials = character?.name ? character.name.slice(0, 2).toUpperCase() : "?";
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm font-semibold text-white">
        {initials}
      </div>
    );
  }, [character]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-white/10 border-t-white/70" />
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center text-gray-400">
        <p className="text-lg font-semibold text-white">Character not found</p>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white transition hover:border-white/30"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] pt-5">
      <header className="sticky top-0 z-20 bg-[#050505]/95 px-3 pb-3 pt-5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
            {avatarDisplay}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{headerTitle}</p>
              {character.description && (
                <p className="truncate text-xs text-gray-400">{character.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => console.log("open settings")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
            aria-label="Conversation settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="relative flex-1 space-y-4 overflow-y-auto px-3 pt-4 pb-24">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-[0_18px_40px_rgba(0,0,0,0.25)] ${
                message.role === "user"
                  ? "ml-auto bg-gradient-to-br from-emerald-500/60 to-emerald-400/40 text-white"
                  : "bg-white/5 text-gray-100"
              }`}
            >
              {message.content}
            </motion.div>
          ))}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#050505] via-[#050505e6] to-transparent" />
        </div>
      </div>

      <footer className="sticky bottom-0 z-20 border-t border-white/10 bg-[#050505]/95 px-3 pb-6 pt-3 backdrop-blur">
        <div className="flex items-end gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.4)]">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message ${character.name}`}
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <button
            onClick={() => {
              console.log("send", draft);
              setDraft("");
            }}
            disabled={!draft.trim()}
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}

function isImageLike(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}
