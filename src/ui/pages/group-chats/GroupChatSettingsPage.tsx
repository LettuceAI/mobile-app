import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  User,
  Users,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronRight,
  History,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { storageBridge } from "../../../core/storage/files";
import { listCharacters, listPersonas } from "../../../core/storage/repo";
import type {
  GroupSession,
  GroupParticipation,
  Character,
  Persona,
} from "../../../core/storage/schemas";
import { typography, radius, spacing, interactive, cn } from "../../design-tokens";
import { BottomMenu, MenuSection } from "../../components";
import { Routes, useNavigationManager } from "../../navigation";
import { useAvatar } from "../../hooks/useAvatar";

// ============================================================================
// Reusable Components
// ============================================================================

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className={cn(typography.h2.size, typography.h2.weight, "text-white truncate")}>
          {title}
        </h2>
        {subtitle ? (
          <p className={cn(typography.bodySmall.size, "text-white/50 mt-0.5 truncate")}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CharacterAvatar({
  character,
  size = "md",
}: {
  character: Character;
  size?: "sm" | "md" | "lg";
}) {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  return (
    <div
      className={cn(
        sizeClasses[size],
        "rounded-full overflow-hidden",
        "bg-linear-to-br from-white/10 to-white/5",
        "border border-white/10",
        "flex items-center justify-center",
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-bold text-white/60">{character.name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function QuickChip({
  icon,
  label,
  value,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full min-h-14 items-center justify-between",
        radius.md,
        "border p-4 text-left",
        interactive.transition.default,
        interactive.active.scale,
        disabled
          ? "border-white/5 bg-[#0c0d13]/50 opacity-50 cursor-not-allowed"
          : "border-white/10 bg-[#0c0d13]/85 hover:border-white/20 hover:bg-white/10",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center",
            radius.full,
            "border border-white/15 bg-white/10 text-white/80",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              typography.overline.size,
              typography.overline.weight,
              typography.overline.tracking,
              typography.overline.transform,
              "text-white/50",
            )}
          >
            {label}
          </div>
          <div className={cn(typography.bodySmall.size, "text-white truncate")}>{value}</div>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
    </button>
  );
}

interface PersonaOptionProps {
  title: string;
  description: string;
  isDefault?: boolean;
  isSelected: boolean;
  onClick: () => void;
  onLongPress?: () => void;
}

function PersonaOption({
  title,
  description,
  isDefault,
  isSelected,
  onClick,
  onLongPress,
}: PersonaOptionProps) {
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [isLongPressTriggered, setIsLongPressTriggered] = useState(false);

  const handleTouchStart = () => {
    if (!onLongPress) return;
    setIsLongPressTriggered(false);
    const timer = window.setTimeout(() => {
      setIsLongPressTriggered(true);
      onLongPress();
    }, 500);
    setLongPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    if (!isLongPressTriggered) {
      onClick();
    }
  };

  return (
    <button
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        if (!isLongPressTriggered) {
          onClick();
        }
      }}
      className={cn(
        "group relative flex w-full items-center gap-3 justify-between",
        radius.lg,
        "p-4 text-left",
        interactive.transition.default,
        interactive.active.scale,
        isSelected
          ? "border border-emerald-400/40 bg-emerald-400/15 ring-2 ring-emerald-400/30 text-emerald-100"
          : "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10",
      )}
      aria-pressed={isSelected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={cn(typography.body.size, typography.h3.weight, "truncate", "py-0.5")}>
            {title}
          </div>
          {isDefault && (
            <span
              className={cn(
                "shrink-0 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 text-[10px] font-medium text-blue-200",
              )}
            >
              App default
            </span>
          )}
        </div>
        <div className={cn(typography.caption.size, "mt-1 truncate text-gray-400")}>
          {description}
        </div>
      </div>

      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border",
          isSelected
            ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
            : "bg-white/5 border-white/10 text-white/70 group-hover:border-white/20",
        )}
        aria-hidden="true"
      >
        {isSelected ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
      </div>
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function GroupChatSettingsPage() {
  const { groupSessionId } = useParams<{ groupSessionId: string }>();
  const navigate = useNavigate();
  const { backOrReplace } = useNavigationManager();

  // State
  const [session, setSession] = useState<GroupSession | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [participationStats, setParticipationStats] = useState<GroupParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    if (!groupSessionId) return;

    try {
      const [sessionData, allChars, personaList, stats] = await Promise.all([
        storageBridge.groupSessionGet(groupSessionId),
        listCharacters(),
        listPersonas(),
        storageBridge.groupParticipationStats(groupSessionId),
      ]);

      if (!sessionData) {
        setError("Group session not found");
        return;
      }

      setSession(sessionData);
      setCharacters(allChars);
      setPersonas(personaList);
      setParticipationStats(stats);
      setNameDraft(sessionData.name);
    } catch (err) {
      console.error("Failed to load group chat settings:", err);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [groupSessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived data
  const groupCharacters = useMemo(() => {
    if (!session) return [];
    return session.characterIds
      .map((id) => characters.find((c) => c.id === id))
      .filter(Boolean) as Character[];
  }, [session, characters]);

  const availableCharacters = useMemo(() => {
    if (!session) return [];
    return characters.filter((c) => !session.characterIds.includes(c.id));
  }, [session, characters]);

  const currentPersona = useMemo(() => {
    if (!session?.personaId) return null;
    return personas.find((p) => p.id === session.personaId) || null;
  }, [session, personas]);

  const currentPersonaDisplay = useMemo(() => {
    if (!session?.personaId) return "No persona";
    if (!currentPersona) return "Custom persona";
    return currentPersona.isDefault ? `${currentPersona.title} (default)` : currentPersona.title;
  }, [currentPersona, session?.personaId]);

  // Handlers
  const handleSaveName = async () => {
    if (!session || !nameDraft.trim()) return;

    try {
      setSaving(true);
      const updated = await storageBridge.groupSessionUpdate(
        session.id,
        nameDraft.trim(),
        session.characterIds,
        session.personaId,
      );
      setSession(updated);
      setEditingName(false);
    } catch (err) {
      console.error("Failed to save name:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePersona = async (personaId: string | null) => {
    if (!session) return;

    try {
      setSaving(true);
      const updated = await storageBridge.groupSessionUpdate(
        session.id,
        session.name,
        session.characterIds,
        personaId,
      );
      setSession(updated);
      setShowPersonaSelector(false);
    } catch (err) {
      console.error("Failed to change persona:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCharacter = async (characterId: string) => {
    if (!session) return;

    try {
      setSaving(true);
      const updated = await storageBridge.groupSessionAddCharacter(session.id, characterId);
      setSession(updated);
      setShowAddCharacter(false);
    } catch (err) {
      console.error("Failed to add character:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCharacter = async (characterId: string) => {
    if (!session) return;

    // Don't allow removing if only 2 characters left
    if (session.characterIds.length <= 2) {
      setShowRemoveConfirm(null);
      return;
    }

    try {
      setSaving(true);
      const updated = await storageBridge.groupSessionRemoveCharacter(session.id, characterId);
      setSession(updated);
      setShowRemoveConfirm(null);
    } catch (err) {
      console.error("Failed to remove character:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (groupSessionId) {
      backOrReplace(Routes.groupChat(groupSessionId));
    } else {
      backOrReplace(Routes.groupChats);
    }
  };

  const getParticipationPercent = (characterId: string): number => {
    const stat = participationStats.find((s) => s.characterId === characterId);
    if (!stat) return 0;
    const total = participationStats.reduce((sum, s) => sum + s.speakCount, 0);
    if (total === 0) return 0;
    return Math.round((stat.speakCount / total) * 100);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full flex-col bg-[#050505] text-white">
        <header className="shrink-0 border-b border-white/10 px-4 pb-3 pt-10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-1/3 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-white/10" />
            </div>
          </div>
        </header>
        <main className="flex-1 p-4">
          <div className="space-y-4">
            <div className="h-20 animate-pulse rounded-xl bg-white/5" />
            <div className="h-20 animate-pulse rounded-xl bg-white/5" />
            <div className="h-40 animate-pulse rounded-xl bg-white/5" />
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error || !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#050505] text-white p-8">
        <p className="text-lg font-medium text-red-400">{error || "Not found"}</p>
        <button
          onClick={() => navigate(Routes.groupChats)}
          className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
        >
          Back to Group Chats
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#050505] text-white">
      {/* Header */}
      <header className="z-20 shrink-0 border-b border-white/10 px-4 pb-3 pt-10">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex shrink-0 items-center justify-center -ml-2 text-white transition hover:text-white/80"
            aria-label="Back"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
          </button>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-xl font-bold text-white/90">Group Settings</p>
            <p className="mt-0.5 truncate text-xs text-white/50">Manage group chat preferences</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 pt-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={spacing.section}
        >
          {/* Group Name Section */}
          <section className={spacing.item}>
            <SectionHeader title="Group Name" subtitle="Identify this conversation" />
            <div className={cn(radius.lg, "border border-white/10 bg-[#0c0d13]/85 p-4")}>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className={cn(
                      "flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2",
                      "text-white placeholder-white/30",
                      "focus:border-emerald-400/50 focus:outline-none focus:ring-1 focus:ring-emerald-400/30",
                    )}
                    placeholder="Enter group name"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={saving || !nameDraft.trim()}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/20 text-emerald-300 transition hover:bg-emerald-400/30 disabled:opacity-50"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    onClick={() => {
                      setNameDraft(session.name);
                      setEditingName(false);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingName(true)}
                  className="flex w-full items-center justify-between text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10">
                      <Users className="h-4 w-4 text-white/70" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{session.name}</p>
                      <p className="text-xs text-white/50 mt-0.5">Tap to edit</p>
                    </div>
                  </div>
                  <Edit2 className="h-4 w-4 text-white/40 group-hover:text-white/70 transition" />
                </button>
              )}
            </div>
          </section>

          {/* Chat History Section */}
          <section className={spacing.item}>
            <SectionHeader title="Chat History" subtitle="View and manage conversations" />
            <button
              onClick={() => navigate(Routes.groupChatHistory)}
              className={cn(
                "group flex w-full items-center justify-between gap-3",
                radius.lg,
                "border p-4 text-left",
                interactive.transition.default,
                interactive.active.scale,
                "border-white/10 bg-[#0c0d13]/85 hover:border-white/20 hover:bg-white/10",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center",
                    radius.full,
                    "border border-white/15 bg-white/10",
                  )}
                >
                  <History className="h-4 w-4 text-white/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">View All Group Chats</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Manage history, archive, or start new conversations
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-white/40 group-hover:text-white/70 transition" />
            </button>
          </section>

          {/* Persona Section */}
          <section className={spacing.item}>
            <SectionHeader title="Persona" subtitle="Your identity in this conversation" />
            <QuickChip
              icon={<User className="h-4 w-4" />}
              label="Persona"
              value={currentPersonaDisplay}
              onClick={() => setShowPersonaSelector(true)}
            />
          </section>

          {/* Characters Section */}
          <section className={spacing.item}>
            <div className="flex items-center justify-between mb-3">
              <SectionHeader
                title="Characters"
                subtitle={`${groupCharacters.length} participants`}
              />
              <button
                onClick={() => setShowAddCharacter(true)}
                disabled={availableCharacters.length === 0}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5",
                  "rounded-full text-xs font-medium",
                  "border transition",
                  availableCharacters.length === 0
                    ? "border-white/5 bg-white/5 text-white/30 cursor-not-allowed"
                    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20",
                )}
              >
                <Plus size={14} />
                Add
              </button>
            </div>

            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {groupCharacters.map((character) => {
                  const percent = getParticipationPercent(character.id);

                  return (
                    <motion.div
                      key={character.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "flex items-center gap-3 p-3",
                        radius.lg,
                        "border border-white/10 bg-[#0c0d13]/85",
                      )}
                    >
                      <CharacterAvatar character={character} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{character.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-emerald-400/60 rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-white/50 tabular-nums">{percent}%</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowRemoveConfirm(character.id)}
                        disabled={groupCharacters.length <= 2}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg transition",
                          groupCharacters.length <= 2
                            ? "text-white/20 cursor-not-allowed"
                            : "text-white/40 hover:text-red-400 hover:bg-red-400/10",
                        )}
                        title={
                          groupCharacters.length <= 2
                            ? "Minimum 2 characters required"
                            : "Remove character"
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {groupCharacters.length <= 2 && (
              <p className="mt-2 text-xs text-white/40 text-center">
                A group chat requires at least 2 characters
              </p>
            )}
          </section>

          {/* Participation Stats */}
          {participationStats.length > 0 && (
            <section className={spacing.item}>
              <SectionHeader
                title="Participation"
                subtitle="Speaking distribution across characters"
              />
              <div className={cn(radius.lg, "border border-white/10 bg-[#0c0d13]/85 p-4")}>
                {/* Visual bar */}
                <div className="h-3 rounded-full overflow-hidden flex bg-white/5 mb-4">
                  {groupCharacters.map((char, index) => {
                    const percent = getParticipationPercent(char.id);
                    const colors = [
                      "bg-emerald-400",
                      "bg-blue-400",
                      "bg-purple-400",
                      "bg-amber-400",
                      "bg-pink-400",
                      "bg-cyan-400",
                      "bg-orange-400",
                      "bg-lime-400",
                    ];
                    return (
                      <div
                        key={char.id}
                        className={cn(colors[index % colors.length])}
                        style={{ width: `${percent}%` }}
                        title={`${char.name}: ${percent}%`}
                      />
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3">
                  {groupCharacters.map((char, index) => {
                    const percent = getParticipationPercent(char.id);
                    const colorDots = [
                      "bg-emerald-400",
                      "bg-blue-400",
                      "bg-purple-400",
                      "bg-amber-400",
                      "bg-pink-400",
                      "bg-cyan-400",
                      "bg-orange-400",
                      "bg-lime-400",
                    ];
                    return (
                      <div key={char.id} className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "h-2 w-2 rounded-full",
                            colorDots[index % colorDots.length],
                          )}
                        />
                        <span className="text-xs text-white/70">{char.name}</span>
                        <span className="text-xs text-white/40 tabular-nums">({percent}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </motion.div>
      </main>

      {/* Persona Selector Modal */}
      <BottomMenu
        isOpen={showPersonaSelector}
        onClose={() => setShowPersonaSelector(false)}
        title="Select Persona"
      >
        <MenuSection>
          {personas.length === 0 ? (
            <div className={cn(radius.lg, "border border-amber-500/20 bg-amber-500/10 px-6 py-4")}>
              <p className={cn(typography.bodySmall.size, "text-amber-200")}>
                No personas available. Create one in settings first.
              </p>
            </div>
          ) : (
            <div className={spacing.field}>
              <PersonaOption
                title="No Persona"
                description="Disable persona for this conversation"
                isSelected={session.personaId === null || session.personaId === undefined}
                onClick={() => handleChangePersona(null)}
              />
              {personas.map((persona) => (
                <PersonaOption
                  key={persona.id}
                  title={persona.title}
                  description={persona.description}
                  isDefault={persona.isDefault}
                  isSelected={persona.id === session.personaId}
                  onClick={() => handleChangePersona(persona.id)}
                />
              ))}
            </div>
          )}
        </MenuSection>
      </BottomMenu>

      {/* Add Character Modal */}
      <BottomMenu
        isOpen={showAddCharacter}
        onClose={() => setShowAddCharacter(false)}
        title="Add Character"
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {availableCharacters.length === 0 ? (
            <div className="text-center py-8 text-white/50 text-sm">
              All characters are already in this group.
            </div>
          ) : (
            availableCharacters.map((character) => (
              <button
                key={character.id}
                onClick={() => handleAddCharacter(character.id)}
                disabled={saving}
                className={cn(
                  "flex w-full items-center gap-3 p-3 text-left",
                  radius.lg,
                  "border border-white/10 bg-[#0c0d13]/85",
                  interactive.transition.default,
                  "hover:border-white/20 hover:bg-white/10",
                  "disabled:opacity-50",
                )}
              >
                <CharacterAvatar character={character} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{character.name}</p>
                  {character.description && (
                    <p className="text-xs text-white/50 truncate mt-0.5">{character.description}</p>
                  )}
                </div>
                <Plus className="h-4 w-4 text-emerald-400" />
              </button>
            ))
          )}
        </div>
      </BottomMenu>

      {/* Remove Character Confirmation */}
      <BottomMenu
        isOpen={showRemoveConfirm !== null}
        onClose={() => setShowRemoveConfirm(null)}
        title="Remove Character?"
      >
        {showRemoveConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-white/70">
              Are you sure you want to remove{" "}
              <span className="font-medium text-white">
                {groupCharacters.find((c) => c.id === showRemoveConfirm)?.name}
              </span>{" "}
              from this group chat?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRemoveConfirm(null)}
                disabled={saving}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveCharacter(showRemoveConfirm)}
                disabled={saving}
                className="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
              >
                {saving ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        )}
      </BottomMenu>
    </div>
  );
}
