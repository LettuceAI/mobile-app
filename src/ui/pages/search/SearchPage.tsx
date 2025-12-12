import { useEffect, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowLeft, User, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { listCharacters, listPersonas, createSession, listSessionPreviews } from "../../../core/storage/repo";
import type { Character, Persona } from "../../../core/storage/schemas";
import { cn } from "../../design-tokens";
import { useAvatar } from "../../hooks/useAvatar";
import { useAvatarGradient } from "../../hooks/useAvatarGradient";

type SearchTab = "characters" | "personas";

export function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("characters");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [chars, pers] = await Promise.all([
        listCharacters(),
        listPersonas()
      ]);
      setCharacters(chars);
      setPersonas(pers);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCharacters = characters.filter((char) => {
    const query = searchQuery.toLowerCase();
    return (
      char.name.toLowerCase().includes(query) ||
      char.description?.toLowerCase().includes(query) ||
      ""
    );
  });

  const filteredPersonas = personas.filter((persona) => {
    const query = searchQuery.toLowerCase();
    return (
      persona.title.toLowerCase().includes(query) ||
      persona.description.toLowerCase().includes(query)
    );
  });

  const startChat = async (character: Character) => {
    try {
      const previews = await listSessionPreviews(character.id, 1).catch(() => []);
      const latestSessionId = previews[0]?.id;
      if (latestSessionId) {
        navigate(`/chat/${character.id}?sessionId=${latestSessionId}`);
        return;
      }

      const session = await createSession(
        character.id,
        "New Chat",
        character.scenes?.[0]?.id
      );
      navigate(`/chat/${character.id}?sessionId=${session.id}`);
    } catch (error) {
      console.error("Failed to load or create session:", error);
      navigate(`/chat/${character.id}`);
    }
  };

  const openPersona = (persona: Persona) => {
    navigate(`/settings/personas/${persona.id}/edit`);
  };

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="flex h-screen flex-col bg-[#050505] text-gray-200">
      {/* Minimal Header */}
      <header
        className="shrink-0 px-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        {/* Search Bar Row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="relative flex flex-1 items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 transition focus-within:border-white/20 focus-within:bg-white/8">
            <Search size={18} className="shrink-0 text-white/40" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/40 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="shrink-0 rounded-full p-1 transition hover:bg-white/10 active:scale-95"
                aria-label="Clear search"
              >
                <X size={16} className="text-white/50" />
              </button>
            )}
          </div>
        </div>

        {/* Compact Inline Tabs */}
        <div className="mt-3 flex items-center gap-1.5">
          <TabButton
            active={activeTab === "characters"}
            onClick={() => setActiveTab("characters")}
            icon={<MessageCircle size={14} />}
            label="Characters"
            count={hasQuery ? filteredCharacters.length : characters.length}
          />
          <TabButton
            active={activeTab === "personas"}
            onClick={() => setActiveTab("personas")}
            icon={<User size={14} />}
            label="Personas"
            count={hasQuery ? filteredPersonas.length : personas.length}
          />
        </div>
      </header>

      {/* Results */}
      <main className="flex-1 overflow-y-auto px-2 pt-3 pb-safe">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <LoadingSkeleton />
            </motion.div>
          ) : activeTab === "characters" ? (
            <motion.div
              key="characters"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              {filteredCharacters.length > 0 ? (
                <CharacterList characters={filteredCharacters} onSelect={startChat} />
              ) : (
                <EmptyState
                  type="characters"
                  hasQuery={hasQuery}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="personas"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              {filteredPersonas.length > 0 ? (
                <PersonaList personas={filteredPersonas} onSelect={openPersona} />
              ) : (
                <EmptyState
                  type="personas"
                  hasQuery={hasQuery}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all",
        active
          ? "bg-white/15 text-white"
          : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
      )}
    >
      {icon}
      <span>{label}</span>
      <span className={cn(
        "ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
        active ? "bg-white/20 text-white" : "bg-white/10 text-white/50"
      )}>
        {count}
      </span>
    </button>
  );
}

// Character Avatar with gradient support
const CharacterAvatar = memo(({ character }: { character: Character }) => {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  if (avatarUrl && isImageLike(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt={`${character.name} avatar`}
        className="h-full w-full object-cover"
      />
    );
  }

  const initials = character.name.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-white/20 to-white/5">
      <span className="text-base font-bold text-white/80">{initials}</span>
    </div>
  );
});

CharacterAvatar.displayName = 'CharacterAvatar';

// Character Card matching Chats.tsx style
const CharacterCard = memo(({
  character,
  onSelect
}: {
  character: Character;
  onSelect: (c: Character) => void;
}) => {
  const descriptionPreview = character.description?.trim() || "No description";
  const { gradientCss, hasGradient, textColor, textSecondary } = useAvatarGradient(
    "character",
    character.id,
    character.avatarPath,
    character.disableAvatarGradient,
    // Pass custom colors if enabled
    character.customGradientEnabled && character.customGradientColors?.length ? {
      colors: character.customGradientColors,
      textColor: character.customTextColor,
      textSecondary: character.customTextSecondary,
    } : undefined
  );

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(character)}
      className={cn(
        "group relative flex w-full items-center gap-3.5 p-3.5 text-left",
        "rounded-2xl transition-all",
        hasGradient ? "" : "bg-[#1a1b23] hover:bg-[#22232d]"
      )}
      style={hasGradient ? { background: gradientCss } : {}}
    >
      {/* Circular Avatar */}
      <div className={cn(
        "relative h-14 w-14 shrink-0 overflow-hidden rounded-full",
        hasGradient ? "ring-2 ring-white/20" : "ring-1 ring-white/10",
        "shadow-lg"
      )}>
        <CharacterAvatar character={character} />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <h3
          className={cn(
            "truncate font-semibold text-[15px] leading-tight",
            hasGradient ? "" : "text-white"
          )}
          style={hasGradient ? { color: textColor } : {}}
        >
          {character.name}
        </h3>
        <p
          className={cn(
            "line-clamp-1 text-[13px] leading-tight",
            hasGradient ? "" : "text-white/50"
          )}
          style={hasGradient ? { color: textSecondary } : {}}
        >
          {descriptionPreview}
        </p>
      </div>

      {/* Subtle chevron */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "shrink-0 transition-all",
          hasGradient ? "" : "text-white/30 group-hover:text-white/60"
        )}
        style={hasGradient ? { color: textSecondary } : {}}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </motion.button>
  );
});

CharacterCard.displayName = 'CharacterCard';

function CharacterList({
  characters,
  onSelect
}: {
  characters: Character[];
  onSelect: (character: Character) => void;
}) {
  return (
    <div className="space-y-2 pb-4">
      {characters.map((character) => (
        <CharacterCard
          key={character.id}
          character={character}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// Persona Card
const PersonaCard = memo(({
  persona,
  onSelect
}: {
  persona: Persona;
  onSelect: (p: Persona) => void;
}) => {
  const avatarUrl = useAvatar("persona", persona.id, persona.avatarPath);

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(persona)}
      className="group relative flex w-full items-center gap-3.5 p-3.5 text-left rounded-2xl bg-[#1a1b23] transition-all hover:bg-[#22232d]"
    >
      {/* Circular Avatar */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10 shadow-lg">
        {avatarUrl && isImageLike(avatarUrl) ? (
          <img
            src={avatarUrl}
            alt={persona.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-blue-500/30 to-purple-500/20">
            <User size={24} className="text-white/60" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-[15px] leading-tight text-white">
            {persona.title}
          </h3>
          {persona.isDefault && (
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              Default
            </span>
          )}
        </div>
        <p className="line-clamp-1 text-[13px] leading-tight text-white/50">
          {persona.description}
        </p>
      </div>

      {/* Subtle chevron */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-white/30 transition-all group-hover:text-white/60"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </motion.button>
  );
});

PersonaCard.displayName = 'PersonaCard';

function PersonaList({
  personas,
  onSelect
}: {
  personas: Persona[];
  onSelect: (persona: Persona) => void;
}) {
  return (
    <div className="space-y-2 pb-4">
      {personas.map((persona) => (
        <PersonaCard
          key={persona.id}
          persona={persona}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pb-4">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-[76px] animate-pulse rounded-2xl bg-[#1a1b23] p-3.5"
        >
          <div className="flex items-center gap-3.5">
            <div className="h-14 w-14 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded-full bg-white/10" />
              <div className="h-3 w-2/3 rounded-full bg-white/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ type, hasQuery }: { type: "characters" | "personas"; hasQuery: boolean }) {
  const isCharacters = type === "characters";

  return (
    <div className="mt-12 flex flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
        {isCharacters ? (
          <MessageCircle size={36} className="text-white/20" />
        ) : (
          <User size={36} className="text-white/20" />
        )}
      </div>
      <h3 className="mb-1 text-lg font-semibold text-white/80">
        {hasQuery
          ? `No ${type} found`
          : `No ${type} yet`
        }
      </h3>
      <p className="text-sm text-white/40">
        {hasQuery
          ? "Try a different search term"
          : isCharacters
            ? "Create your first character to start chatting"
            : "Create a persona in settings"
        }
      </p>
    </div>
  );
}

function isImageLike(s?: string) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}
