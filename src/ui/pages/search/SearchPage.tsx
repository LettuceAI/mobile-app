import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ChevronLeft } from "lucide-react";

import { listCharacters, listPersonas, createSession, listSessionIds, getSession } from "../../../core/storage/repo";
import type { Character } from "../../../core/storage/schemas";
import type { Persona } from "../../../core/storage/schemas";
import { typography, radius, interactive, cn } from "../../design-tokens";

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
      const allSessionIds = await listSessionIds();
      
      if (allSessionIds.length > 0) {
        const sessions = await Promise.all(
          allSessionIds.map((id) => getSession(id).catch(() => null))
        );
        
        const characterSessions = sessions
          .filter((session): session is NonNullable<typeof session> => 
            session !== null && session.characterId === character.id
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);
        
        if (characterSessions.length > 0) {
          const latestSession = characterSessions[0];
          navigate(`/chat/${character.id}?sessionId=${latestSession.id}`);
          return;
        }
      }
      
      const session = await createSession(
        character.id, 
        "New Chat", 
        undefined, 
        character.scenes && character.scenes.length > 0 ? character.scenes[0].id : undefined
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

  const resultCount = activeTab === "characters" ? filteredCharacters.length : filteredPersonas.length;

  return (
    <div className="flex h-screen flex-col bg-[#050505] text-gray-200">
      {/* Header with back button and search */}
      <div 
        className="sticky top-0 z-30 border-b border-white/5 bg-[#050505]/95 backdrop-blur-xl"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <div className="px-4 pb-3">
          {/* Back button and title */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate(-1)}
              className={cn(
                "flex items-center justify-center -ml-2",
                "rounded-full",
                "text-white/60 hover:text-white hover:bg-white/5",
                interactive.transition.fast,
                interactive.active.scale
              )}
              aria-label="Go back"
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </button>
            <h1 className={cn(typography.h2.size, typography.h3.weight, "text-white")}>
              Search
            </h1>
          </div>

          {/* Search Input */}
          <div className={cn(
            "relative flex items-center gap-3 px-4 py-3",
            radius.lg,
            "border border-white/10 bg-white/5",
            "focus-within:border-white/20 focus-within:bg-white/[0.07]",
            interactive.transition.default
          )}>
            <Search size={20} className="text-white/40 shrink-0" />
            <input
              type="text"
              placeholder="Search characters or personas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className={cn(
                "flex-1 bg-transparent text-white placeholder:text-white/40 outline-none",
                typography.body.size
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className={cn(
                  "shrink-0 p-1.5 rounded-full",
                  "hover:bg-white/10",
                  interactive.transition.fast,
                  interactive.active.scale
                )}
                aria-label="Clear search"
              >
                <X size={18} className="text-white/60" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pb-3">
          <div className={cn(
            "flex gap-2 p-1",
            radius.lg,
            "border border-white/10 bg-white/5"
          )}>
            <button
              onClick={() => setActiveTab("characters")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all",
                activeTab === "characters"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/50 hover:text-white/70 active:scale-95"
              )}
            >
              Characters
            </button>
            <button
              onClick={() => setActiveTab("personas")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all",
                activeTab === "personas"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/50 hover:text-white/70 active:scale-95"
              )}
            >
              Personas
            </button>
          </div>
        </div>

        {/* Result count */}
        {searchQuery && (
          <div className="px-4 pb-2">
            <p className={cn(typography.caption.size, "text-white/40")}>
              {resultCount} {resultCount === 1 ? 'result' : 'results'}
            </p>
          </div>
        )}
      </div>

      {/* Results */}
      <main className="flex-1 overflow-y-auto px-4 pt-2 pb-safe">
        {loading ? (
          <LoadingSkeleton />
        ) : activeTab === "characters" ? (
          filteredCharacters.length > 0 ? (
            <CharacterList characters={filteredCharacters} onSelect={startChat} />
          ) : (
            <EmptyState 
              message={searchQuery ? "No characters found" : "No characters yet"} 
              description={searchQuery ? "Try a different search term" : "Create a character to get started"}
            />
          )
        ) : (
          filteredPersonas.length > 0 ? (
            <PersonaList personas={filteredPersonas} onSelect={openPersona} />
          ) : (
            <EmptyState 
              message={searchQuery ? "No personas found" : "No personas yet"} 
              description={searchQuery ? "Try a different search term" : "Create a persona to get started"}
            />
          )
        )}
      </main>
    </div>
  );
}

function CharacterList({ 
  characters, 
  onSelect 
}: { 
  characters: Character[]; 
  onSelect: (character: Character) => void;
}) {
  return (
    <div className="space-y-2 pb-4">
      {characters.map((character) => {
        const descriptionPreview = character.description?.trim() || "No description yet";

        return (
          <div key={character.id} className="relative">
            <button
              onClick={() => onSelect(character)}
              className={cn(
                "group relative flex min-h-[80px] w-full items-center gap-3 overflow-hidden px-4 py-3 text-left",
                radius.lg,
                "border border-white/10 bg-white/5",
                interactive.transition.default,
                "hover:border-white/20 hover:bg-white/[0.08]",
                "active:scale-[0.98]"
              )}
            >
              {/* Hover gradient effect */}
              <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-emerald-400/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

              {/* Avatar */}
              <div className={cn(
                "relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden",
                radius.lg,
                "border border-white/15 bg-white/5",
                typography.body.size,
                typography.body.weight,
                "text-white"
              )}>
                {renderAvatar(character)}
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                <h3 className={cn(
                  "truncate",
                  typography.body.size,
                  typography.h3.weight,
                  "text-white"
                )}>
                  {character.name}
                </h3>
                <p className={cn(
                  typography.bodySmall.size,
                  "text-white/50 line-clamp-2 leading-relaxed"
                )}>
                  {descriptionPreview}
                </p>
              </div>

              {/* Arrow indicator */}
              <span className={cn(
                "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center",
                radius.full,
                "border border-white/10 bg-white/5 text-white/50",
                "transition-all group-hover:border-white/20 group-hover:bg-white/10 group-hover:text-white/80"
              )}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PersonaList({ 
  personas, 
  onSelect 
}: { 
  personas: Persona[]; 
  onSelect: (persona: Persona) => void;
}) {
  return (
    <div className="space-y-2 pb-4">
      {personas.map((persona) => {
        return (
          <div key={persona.id} className="relative">
            <button
              onClick={() => onSelect(persona)}
              className={cn(
                "group relative flex min-h-[80px] w-full items-center gap-3 overflow-hidden px-4 py-3 text-left",
                radius.lg,
                "border border-white/10 bg-white/5",
                interactive.transition.default,
                "hover:border-white/20 hover:bg-white/[0.08]",
                "active:scale-[0.98]"
              )}
            >
              {/* Hover gradient effect */}
              <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-emerald-400/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

              {/* Icon */}
              <div className={cn(
                "relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden",
                radius.lg,
                "border border-white/15 bg-white/5",
                "text-white/60"
              )}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                <div className="flex items-center gap-2">
                  <h3 className={cn(
                    "truncate",
                    typography.body.size,
                    typography.h3.weight,
                    "text-white"
                  )}>
                    {persona.title}
                  </h3>
                  {persona.isDefault && (
                    <span className={cn(
                      "shrink-0 px-2 py-0.5 text-xs font-semibold",
                      radius.sm,
                      "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    )}>
                      Default
                    </span>
                  )}
                </div>
                <p className={cn(
                  typography.bodySmall.size,
                  "text-white/50 line-clamp-2 leading-relaxed"
                )}>
                  {persona.description}
                </p>
              </div>

              {/* Arrow indicator */}
              <span className={cn(
                "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center",
                radius.full,
                "border border-white/10 bg-white/5 text-white/50",
                "transition-all group-hover:border-white/20 group-hover:bg-white/10 group-hover:text-white/80"
              )}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pb-4">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className={cn(
            "min-h-[80px] animate-pulse px-4 py-3",
            radius.lg,
            "border border-white/5 bg-white/5"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn("h-14 w-14 shrink-0", radius.lg, "bg-white/10")} />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded-full bg-white/10" />
              <div className="h-3 w-full rounded-full bg-white/5" />
              <div className="h-3 w-2/3 rounded-full bg-white/5" />
            </div>
            <div className={cn("h-9 w-9 shrink-0", radius.full, "bg-white/5")} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message, description }: { message: string; description?: string }) {
  return (
    <div className={cn(
      "mt-8 p-8 text-center",
      radius.lg,
      "border border-dashed border-white/10 bg-white/[0.02]"
    )}>
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <Search size={28} className="text-white/30" />
      </div>
      <h3 className={cn(
        typography.body.size,
        typography.h3.weight,
        "text-white mb-1"
      )}>
        {message}
      </h3>
      {description && (
        <p className={cn(
          typography.bodySmall.size,
          "text-white/40"
        )}>
          {description}
        </p>
      )}
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
