import { Brain, User, BookOpen, Loader2, Sparkles, Users, History, Plus } from "lucide-react";
import { BottomMenu, MenuButton, MenuDivider, MenuSection } from "../BottomMenu";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  listCharacters,
  listLorebooks,
  listPersonas,
  readSettings,
  saveLorebook,
} from "../../../core/storage/repo";
import { invoke } from "@tauri-apps/api/core";
import { AvatarImage } from "../AvatarImage";
import { useAvatar } from "../../hooks/useAvatar";

type CreationGoal = "character" | "persona" | "lorebook";
type CreationStatus = "active" | "previewShown" | "completed" | "cancelled";

interface CreationSessionSummary {
  id: string;
  creationGoal: CreationGoal;
  status: CreationStatus;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface EditTarget {
  id: string;
  title: string;
  avatarPath?: string;
  avatarCrop?: { x: number; y: number; scale: number } | null;
}

function EditTargetAvatar({ goal, target }: { goal: CreationGoal; target: EditTarget }) {
  const avatarType = goal === "character" || goal === "persona" ? goal : null;
  const avatarUrl = useAvatar(
    (avatarType as "character" | "persona") || "character",
    avatarType ? target.id : undefined,
    avatarType ? target.avatarPath : undefined,
    "round",
  );

  if (avatarType && (avatarUrl || target.title)) {
    return (
      <div className="h-[18px] w-[18px] overflow-hidden rounded-full border border-white/10 bg-linear-to-br from-white/10 to-white/5 flex items-center justify-center">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={target.title} crop={target.avatarCrop} applyCrop />
        ) : (
          <span className="text-[9px] font-semibold text-white/70">
            {target.title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
    );
  }

  return <BookOpen size={18} />;
}

export function CreateMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<
    | "menu"
    | "lorebook-name"
    | "ai-helper"
    | "ai-helper-actions"
    | "ai-helper-history"
    | "ai-helper-edit-select"
  >("menu");
  const [lorebookName, setLorebookName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [smartToolSelection, setSmartToolSelection] = useState(true);
  const [selectedGoal, setSelectedGoal] = useState<CreationGoal | null>(null);
  const [goalSessions, setGoalSessions] = useState<CreationSessionSummary[]>([]);
  const [loadingGoalSessions, setLoadingGoalSessions] = useState(false);
  const [editTargets, setEditTargets] = useState<EditTarget[]>([]);
  const [loadingEditTargets, setLoadingEditTargets] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await readSettings();
        setSmartToolSelection(settings.advancedSettings?.creationHelperSmartToolSelection ?? true);
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    void loadSettings();
  }, []);

  const handleClose = () => {
    onClose();
    // Reset state after animation
    setTimeout(() => {
      setMode("menu");
      setLorebookName("");
      setIsCreating(false);
      setSelectedGoal(null);
      setGoalSessions([]);
      setLoadingGoalSessions(false);
      setEditTargets([]);
      setLoadingEditTargets(false);
    }, 300);
  };

  const handleCreateLorebook = async () => {
    if (!lorebookName.trim()) return;

    try {
      setIsCreating(true);
      const newLorebook = await saveLorebook({ name: lorebookName.trim() });
      navigate(`/library/lorebooks/${newLorebook.id}`);
      handleClose();
    } catch (error) {
      console.error("Failed to create lorebook:", error);
      setIsCreating(false);
    }
  };

  const goalMeta: Record<CreationGoal, { label: string; color: string; icon: typeof Sparkles }> = {
    character: { label: "Character", color: "from-rose-500 to-rose-600", icon: Sparkles },
    persona: { label: "Persona", color: "from-purple-500 to-purple-600", icon: Brain },
    lorebook: { label: "Lorebook", color: "from-amber-500 to-amber-600", icon: BookOpen },
  };

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  };

  const loadGoalSessions = async (goal: CreationGoal) => {
    setLoadingGoalSessions(true);
    try {
      const sessions = await invoke<CreationSessionSummary[]>("creation_helper_list_sessions", {
        creationGoal: goal,
      });
      setGoalSessions(sessions);
    } catch (err) {
      console.error("Failed to load Smart Creator sessions:", err);
      setGoalSessions([]);
    } finally {
      setLoadingGoalSessions(false);
    }
  };

  const openGoalActions = async (goal: CreationGoal) => {
    setSelectedGoal(goal);
    setMode("ai-helper-actions");
    await loadGoalSessions(goal);
  };

  const navigateToNew = (goal: CreationGoal) => {
    handleClose();
    navigate(`/create/character/helper?goal=${goal}`);
  };

  const navigateToSession = (goal: CreationGoal, sessionId: string) => {
    handleClose();
    navigate(`/create/character/helper?goal=${goal}&sessionId=${encodeURIComponent(sessionId)}`);
  };

  const loadEditTargets = async (goal: CreationGoal) => {
    setLoadingEditTargets(true);
    try {
      if (goal === "character") {
        const items = await listCharacters();
        setEditTargets(
          items.map((c) => ({
            id: c.id,
            title: c.name || "Unnamed character",
            avatarPath: c.avatarPath,
            avatarCrop: c.avatarCrop ?? null,
          })),
        );
      } else if (goal === "persona") {
        const items = await listPersonas();
        setEditTargets(
          items.map((p) => ({
            id: p.id,
            title: p.title || "Untitled persona",
            avatarPath: p.avatarPath,
            avatarCrop: p.avatarCrop ?? null,
          })),
        );
      } else {
        const items = await listLorebooks();
        setEditTargets(items.map((l) => ({ id: l.id, title: l.name || "Untitled lorebook" })));
      }
    } catch (err) {
      console.error("Failed to load edit targets:", err);
      setEditTargets([]);
    } finally {
      setLoadingEditTargets(false);
    }
  };

  const openEditTargetSelector = async () => {
    if (!selectedGoal) return;
    setMode("ai-helper-edit-select");
    await loadEditTargets(selectedGoal);
  };

  const navigateToEditTarget = (goal: CreationGoal, targetId: string) => {
    handleClose();
    navigate(
      `/create/character/helper?goal=${goal}&mode=edit&targetType=${goal}&targetId=${encodeURIComponent(targetId)}`,
    );
  };

  const latestIncomplete = goalSessions.find((session) => session.status !== "completed") ?? null;
  const selectedGoalLabel = selectedGoal ? goalMeta[selectedGoal].label : "Smart Creator";
  const historyTitle = `${selectedGoalLabel} Conversations`;

  return (
    <BottomMenu
      isOpen={isOpen}
      onClose={handleClose}
      title={
        mode === "menu"
          ? "Create New"
          : mode === "ai-helper"
            ? "Smart Creator"
            : mode === "ai-helper-actions"
              ? `${selectedGoalLabel} Creator`
              : mode === "ai-helper-history"
                ? historyTitle
                : mode === "ai-helper-edit-select"
                  ? `Edit ${selectedGoalLabel}`
                  : "Name Lorebook"
      }
      includeExitIcon={false}
      location="bottom"
    >
      {mode === "menu" ? (
        <MenuSection>
          <MenuButton
            icon={Sparkles}
            title="Smart Creator"
            description="Let the assistant guide your creation"
            color="from-rose-500 to-rose-600"
            onClick={() => {
              if (smartToolSelection) {
                setMode("ai-helper");
              } else {
                onClose();
                navigate("/create/character/helper?goal=character");
              }
            }}
          />

          <MenuDivider label="Or create manually" />

          <MenuButton
            icon={User}
            title="Character"
            description="Create a custom character"
            color="from-blue-500 to-blue-600"
            onClick={() => {
              onClose();
              navigate("/create/character");
            }}
          />

          <MenuButton
            icon={Brain}
            title="Persona"
            description="Create a reusable voice"
            color="from-purple-500 to-purple-600"
            onClick={() => {
              onClose();
              navigate("/create/persona");
            }}
          />

          <MenuButton
            icon={Users}
            title="Group Chat"
            description="Chat with multiple characters"
            color="from-emerald-500 to-emerald-600"
            onClick={() => {
              onClose();
              navigate("/group-chats/new");
            }}
          />

          <MenuButton
            icon={BookOpen}
            title="Lorebook"
            description="Build your world reference"
            color="from-amber-500 to-amber-600"
            onClick={() => setMode("lorebook-name")}
          />
        </MenuSection>
      ) : mode === "ai-helper" ? (
        <MenuSection>
          <MenuButton
            icon={Sparkles}
            title="Character"
            description="Build a character with guided creation"
            color="from-rose-500 to-rose-600"
            onClick={() => void openGoalActions("character")}
          />

          <MenuButton
            icon={Brain}
            title="Persona"
            description="Create a reusable voice or personality"
            color="from-purple-500 to-purple-600"
            onClick={() => void openGoalActions("persona")}
          />

          <MenuButton
            icon={BookOpen}
            title="Lorebook"
            description="Build a structured world reference"
            color="from-amber-500 to-amber-600"
            onClick={() => void openGoalActions("lorebook")}
          />
        </MenuSection>
      ) : mode === "ai-helper-actions" ? (
        <MenuSection>
          {loadingGoalSessions ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-5 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading conversations...</span>
            </div>
          ) : (
            <>
              {selectedGoal && (
                <MenuButton
                  icon={Plus}
                  title="Create new"
                  description="Start a fresh guided creation chat"
                  color={goalMeta[selectedGoal].color}
                  onClick={() => navigateToNew(selectedGoal)}
                />
              )}

              {selectedGoal && (
                <MenuButton
                  icon={Sparkles}
                  title="Edit existing"
                  description={`Pick a ${selectedGoal} and edit it with Smart Creator`}
                  color="from-rose-500 to-rose-600"
                  onClick={() => void openEditTargetSelector()}
                />
              )}

              {latestIncomplete && selectedGoal && (
                <MenuButton
                  icon={History}
                  title="Continue last conversation"
                  description={`${latestIncomplete.title} • ${formatTimeAgo(latestIncomplete.updatedAt)}`}
                  color="from-blue-500 to-cyan-600"
                  onClick={() => navigateToSession(selectedGoal, latestIncomplete.id)}
                />
              )}

              <MenuButton
                icon={History}
                title="See older conversations"
                description="Open any previous Smart Creator conversation"
                color="from-indigo-500 to-blue-600"
                onClick={() => setMode("ai-helper-history")}
              />
            </>
          )}
        </MenuSection>
      ) : mode === "ai-helper-history" ? (
        <MenuSection>
          {loadingGoalSessions ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-5 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading conversations...</span>
            </div>
          ) : goalSessions.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
              No conversations yet for this creator.
            </div>
          ) : (
            <>
              {goalSessions.map((session) => {
                const statusLabel =
                  session.status === "completed"
                    ? "Completed"
                    : session.status === "cancelled"
                      ? "Cancelled"
                      : "Draft";
                const subtitleParts = [
                  `${session.messageCount} messages`,
                  formatTimeAgo(session.updatedAt),
                  session.preview ? session.preview : "",
                ].filter(Boolean);
                return (
                  <MenuButton
                    key={session.id}
                    icon={goalMeta[session.creationGoal].icon}
                    title={session.title || "Untitled conversation"}
                    description={subtitleParts.join(" • ")}
                    color={goalMeta[session.creationGoal].color}
                    onClick={() => selectedGoal && navigateToSession(selectedGoal, session.id)}
                    rightElement={
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          session.status === "completed"
                            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                            : "border-blue-400/30 bg-blue-500/10 text-blue-200"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    }
                  />
                );
              })}
            </>
          )}
          <MenuDivider />
          <button
            onClick={() => setMode("ai-helper-actions")}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
          >
            Back
          </button>
        </MenuSection>
      ) : mode === "ai-helper-edit-select" ? (
        <MenuSection>
          {loadingEditTargets ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-5 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading {selectedGoalLabel.toLowerCase()}s...</span>
            </div>
          ) : editTargets.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
              No {selectedGoalLabel.toLowerCase()}s found.
            </div>
          ) : (
            <>
              {editTargets.map((target) => (
                <MenuButton
                  key={target.id}
                  icon={<EditTargetAvatar goal={selectedGoal as CreationGoal} target={target} />}
                  title={target.title}
                  description={target.id}
                  color={goalMeta[selectedGoal as CreationGoal].color}
                  onClick={() => selectedGoal && navigateToEditTarget(selectedGoal, target.id)}
                />
              ))}
            </>
          )}
          <MenuDivider />
          <button
            onClick={() => setMode("ai-helper-actions")}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
          >
            Back
          </button>
        </MenuSection>
      ) : (
        <div className="space-y-4">
          <input
            value={lorebookName}
            onChange={(e) => setLorebookName(e.target.value)}
            placeholder="Enter lorebook name..."
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateLorebook();
            }}
          />
          <div className="flex gap-3">
            <button
              onClick={() => setMode("menu")}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Back
            </button>
            <button
              onClick={handleCreateLorebook}
              disabled={isCreating || !lorebookName.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 py-3 text-sm font-medium text-emerald-100 transition hover:border-emerald-500/50 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}
    </BottomMenu>
  );
}
