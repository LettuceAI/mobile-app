import { useMemo, useState, useEffect, useCallback } from "react";
import { ArrowLeft, MessageSquarePlus, Cpu, ChevronRight, Check, History, User, SlidersHorizontal, Edit2, Trash2, Info } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import type { AdvancedModelSettings, Character, Model, Persona, Session } from "../../../core/storage/schemas";
import { createDefaultAdvancedModelSettings } from "../../../core/storage/schemas";
import { useChatController } from "./hooks/useChatController";
import { readSettings, saveCharacter, createSession, listPersonas, getSession, saveSession, deletePersona } from "../../../core/storage/repo";
import { BottomMenu, MenuSection } from "../../components";
import { ProviderParameterSupportInfo } from "../../components/ProviderParameterSupportInfo";
import { useAvatar } from "../../hooks/useAvatar";
import {
  ADVANCED_TEMPERATURE_RANGE,
  ADVANCED_TOP_P_RANGE,
  ADVANCED_MAX_TOKENS_RANGE,
  ADVANCED_FREQUENCY_PENALTY_RANGE,
  ADVANCED_PRESENCE_PENALTY_RANGE,
  ADVANCED_TOP_K_RANGE,
  formatAdvancedModelSettingsSummary,
  sanitizeAdvancedModelSettings,
} from "../../components/AdvancedModelSettingsForm";
import { typography, radius, spacing, interactive, cn } from "../../design-tokens";

function isImageLike(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}

interface SettingsButtonProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}

function SettingsButton({ icon, title, subtitle, onClick, disabled = false }: SettingsButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full min-h-[56px] items-center justify-between",
        radius.md,
        "border p-4 text-left",
        interactive.transition.default,
        interactive.active.scale,
        disabled
          ? "border-white/5 bg-[#0c0d13]/50 opacity-50 cursor-not-allowed"
          : "border-white/10 bg-[#0c0d13]/85 text-white hover:border-white/20 hover:bg-white/10"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-10 w-10 items-center justify-center",
          radius.full,
          "border border-white/15 bg-white/10 text-white/80"
        )}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn(typography.bodySmall.size, typography.body.weight, "text-white")}>
            {title}
          </div>
          <div className={cn(typography.caption.size, "text-gray-400 mt-0.5 truncate")}>
            {subtitle}
          </div>
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
  onLongPress: () => void;
}

function PersonaOption({ title, description, isDefault, isSelected, onClick, onLongPress }: PersonaOptionProps) {
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [isLongPressTriggered, setIsLongPressTriggered] = useState(false);

  const handleTouchStart = () => {
    setIsLongPressTriggered(false);
    const timer = setTimeout(() => {
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
      className={cn(
        "group relative flex w-full items-center gap-3 justify-between",
        radius.lg,
        "p-4 text-left",
        interactive.transition.default,
        interactive.active.scale,
        isSelected
          ? "border border-emerald-400/40 bg-emerald-400/15 ring-2 ring-emerald-400/30 text-emerald-100"
          : "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
      )}
      aria-pressed={isSelected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={cn(typography.body.size, typography.h3.weight, "truncate", "py-0.5")}>{title}</div>
          {isDefault && (
            <span className={cn(
              "shrink-0 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 text-[10px] font-medium text-blue-200"
            )}>
              App default
            </span>
          )}
        </div>
        <div className={cn(typography.caption.size, "mt-1 truncate text-gray-400")}>{description}</div>
      </div>

      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border",
          isSelected
            ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
            : "bg-white/5 border-white/10 text-white/70 group-hover:border-white/20"
        )}
        aria-hidden="true"
      >
        {isSelected ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
      </div>
    </button>
  );
}

interface ModelOptionProps {
  model: Model;
  isSelected: boolean;
  isGlobalDefault: boolean;
  isCharacterDefault: boolean;
  onClick: () => void;
}
function ModelOption({ model, isSelected, isGlobalDefault, isCharacterDefault, onClick }: ModelOptionProps) {
  const defaultBadge = isCharacterDefault
    ? { label: "Character default", color: "text-emerald-200 border-emerald-400/40 bg-emerald-400/10" }
    : isGlobalDefault
      ? { label: "App default", color: "text-blue-200 border-blue-400/30 bg-blue-400/10" }
      : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center justify-between gap-3",
        radius.lg,
        "p-4 text-left",
        interactive.transition.default,
        interactive.active.scale,
        isSelected
          ? "border border-emerald-400/40 bg-emerald-400/15 ring-2 ring-emerald-400/30 text-emerald-100"
          : "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
      )}
      aria-pressed={isSelected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={cn(typography.body.size, typography.h3.weight, "truncate", "py-0.5")}>{model.displayName}</div>
          {defaultBadge && (
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 text-[10px] font-medium",
                defaultBadge.color
              )}
            >
              {defaultBadge.label}
            </span>
          )}
        </div>
        <div className={cn(typography.caption.size, "mt-1 truncate text-gray-400")}>{model.name}</div>
      </div>

      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          "border", // always have border to keep size
          isSelected
            ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
            : "bg-white/5 border-white/10 text-white/70 group-hover:border-white/20"
        )}
        aria-hidden="true"
      >
        {isSelected ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
      </div>
    </button>
  );
}


function ChatSettingsContent({ character }: { character: Character }) {
  const navigate = useNavigate();
  const { characterId } = useParams();
  const [models, setModels] = useState<Model[]>([]);
  const [globalDefaultModelId, setGlobalDefaultModelId] = useState<string | null>(null);
  const [currentCharacter, setCurrentCharacter] = useState<Character>(character);
  const avatarUrl = useAvatar("character", currentCharacter?.id, currentCharacter?.avatarPath);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const [globalAdvancedSettings, setGlobalAdvancedSettings] = useState<AdvancedModelSettings>(createDefaultAdvancedModelSettings());
  const [sessionAdvancedSettings, setSessionAdvancedSettings] = useState<AdvancedModelSettings | null>(null);
  const [showSessionAdvancedMenu, setShowSessionAdvancedMenu] = useState(false);
  const [showParameterSupport, setShowParameterSupport] = useState(false);
  const [sessionAdvancedDraft, setSessionAdvancedDraft] = useState<AdvancedModelSettings>(createDefaultAdvancedModelSettings());
  const [sessionOverrideEnabled, setSessionOverrideEnabled] = useState<boolean>(false);
  const [showPersonaActions, setShowPersonaActions] = useState(false);
  const [selectedPersonaForActions, setSelectedPersonaForActions] = useState<Persona | null>(null);

  const loadModels = useCallback(async () => {
    try {
      const settings = await readSettings();
      setModels(settings.models);
      setGlobalDefaultModelId(settings.defaultModelId);
      const advanced = settings.advancedModelSettings ?? createDefaultAdvancedModelSettings();
      setGlobalAdvancedSettings(advanced);
    } catch (error) {
      console.error("Failed to load models/settings:", error);
      const fallback = createDefaultAdvancedModelSettings();
      setGlobalAdvancedSettings(fallback);
    }
  }, []);

  const loadPersonas = useCallback(async () => {
    const personaList = await listPersonas();
    setPersonas(personaList);
  }, []);

  const loadSession = useCallback(async () => {
    if (!characterId) return;
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    if (sessionId) {
      try {
        const session = await getSession(sessionId);
        setCurrentSession(session);
        const sessionAdvanced = session?.advancedModelSettings ?? null;
        setSessionAdvancedSettings(sessionAdvanced);
      } catch (error) {
        console.error("Failed to load session:", error);
        setCurrentSession(null);
        setSessionAdvancedSettings(null);
      }
    } else {
      setCurrentSession(null);
      setSessionAdvancedSettings(null);
    }
  }, [characterId]);

  useEffect(() => {
    loadModels();
    loadPersonas();
    loadSession();
  }, [loadModels, loadPersonas, loadSession]);

  useEffect(() => {
    setCurrentCharacter(character);
  }, [character]);

  useEffect(() => {
    setSessionAdvancedSettings(currentSession?.advancedModelSettings ?? null);
  }, [currentSession]);

  useEffect(() => {
    if (sessionAdvancedSettings) {
      setSessionAdvancedDraft(sessionAdvancedSettings);
      setSessionOverrideEnabled(true);
    } else {
      setSessionAdvancedDraft(globalAdvancedSettings);
      setSessionOverrideEnabled(false);
    }
  }, [sessionAdvancedSettings, globalAdvancedSettings]);

  const getEffectiveModelId = () => {
    // Mirror the backend select_model logic: character.default_model_id || settings.default_model_id
    return currentCharacter?.defaultModelId || globalDefaultModelId || null;
  };

  const handleNewChat = async () => {
    if (!characterId || !currentCharacter) return;

    try {
      const session = await createSession(
        characterId,
        "New Chat",
        undefined,
        currentCharacter.scenes && currentCharacter.scenes.length > 0 ? currentCharacter.scenes[0].id : undefined
      );
      navigate(`/chat/${characterId}?sessionId=${session.id}`, { replace: true });
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  const handleChangeModel = async (modelId: string) => {
    if (!characterId) return;

    try {
      const updatedCharacter = await saveCharacter({
        ...currentCharacter,
        defaultModelId: modelId
      });
      setCurrentCharacter(updatedCharacter);

      /*const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('sessionId');
      if (sessionId) {
        navigate(`/chat/${characterId}?sessionId=${sessionId}`, { replace: true });
      }*/
    } catch (error) {
      console.error("Failed to change character model:", error);
    }
  };

  const handleChangePersona = async (personaId: string | null) => {
    if (!currentSession || !character) {
      console.log("No current session or character");
      return;
    }

    try {
      console.log("Changing persona to:", personaId);
      
      // Regenerate the system prompt with the new persona
      const systemPrompt = await invoke<string>("regenerate_session_system_prompt", {
        sessionId: currentSession.id,
        personaId: personaId || "",
      });
      
      // Update and save session with new persona and system prompt
      const updatedSession = {
        ...currentSession,
        personaId: personaId === null ? "" : personaId,
        systemPrompt: systemPrompt || undefined,
        updatedAt: Date.now(),
      };
      
      console.log("Updated session:", updatedSession);
      await saveSession(updatedSession);
      console.log("Session saved successfully");
      setCurrentSession(updatedSession);
      setShowPersonaSelector(false);
      setSessionAdvancedSettings(updatedSession.advancedModelSettings ?? null);

      if (characterId && currentSession.id) {
        navigate(`/chat/${characterId}?sessionId=${currentSession.id}`, { replace: true });
      }
    } catch (error) {
      console.error("Failed to change persona:", error);
    }
  };

  const handleSaveSessionAdvancedSettings = useCallback(async (next: AdvancedModelSettings | null) => {
    if (!currentSession) {
      console.warn("Attempted to save session advanced settings without session");
      return;
    }

    try {
      const sanitized = next ? sanitizeAdvancedModelSettings(next) : null;
      const updatedSession: Session = {
        ...currentSession,
        advancedModelSettings: sanitized ?? undefined,
        updatedAt: Date.now(),
      };
      await saveSession(updatedSession);
      setCurrentSession(updatedSession);
      setSessionAdvancedSettings(sanitized);
      setShowSessionAdvancedMenu(false);

    } catch (error) {
      console.error("Failed to save session advanced settings:", error);
    }
  }, [currentSession]);

  const handleViewHistory = useCallback(() => {
    if (!characterId) return;
    navigate(`/chat/${characterId}/history`);
  }, [characterId, navigate]);

  const avatarDisplay = useMemo(() => {
    if (avatarUrl && isImageLike(avatarUrl)) {
      return (
        <img
          src={avatarUrl}
          alt={currentCharacter?.name ?? "avatar"}
          className="h-12 w-12 rounded-full object-cover"
        />
      );
    }

    const initials = currentCharacter?.name ? currentCharacter.name.slice(0, 2).toUpperCase() : "?";
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-semibold text-white">
        {initials}
      </div>
    );
  }, [currentCharacter, avatarUrl]);

  const characterName = useMemo(() => currentCharacter?.name ?? "Unknown Character", [currentCharacter?.name]);
  const effectiveModelId = getEffectiveModelId();
  const currentModel = models.find(m => m.id === effectiveModelId);
  const defaultAdvancedSummary = useMemo(() => {
    const defaults = createDefaultAdvancedModelSettings();
    return formatAdvancedModelSettingsSummary(defaults, "Temp 0.7 • Top P 1 • Max 1024");
  }, []);

  const globalAdvancedSummary = useMemo(() => {
    return formatAdvancedModelSettingsSummary(
      globalAdvancedSettings ?? createDefaultAdvancedModelSettings(),
      defaultAdvancedSummary
    );
  }, [globalAdvancedSettings, defaultAdvancedSummary]);

  const sessionAdvancedSummary = useMemo(() => {
    if (!currentSession) {
      return "Open a chat session first";
    }
    const inheritedLabel = `Inherits ${globalAdvancedSummary}`;
    return formatAdvancedModelSettingsSummary(
      sessionAdvancedSettings ?? null,
      inheritedLabel
    );
  }, [currentSession, sessionAdvancedSettings, globalAdvancedSummary]);

  const handleBack = () => {
    if (characterId) {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('sessionId');
      if (sessionId) {
        navigate(`/chat/${characterId}?sessionId=${sessionId}`);
      } else {
        navigate('/chat');
      }
    } else {
      navigate(-1);
    }
  };

  const getCurrentPersonaDisplay = () => {
    if (!currentSession) return "Open a chat session first";

    const currentPersonaId = currentSession?.personaId;
    if (currentPersonaId === "") return "No persona";
    if (!currentPersonaId) {
      const defaultPersona = personas.find(p => p.isDefault);
      return defaultPersona ? `${defaultPersona.title} (default)` : "No persona";
    }
    const persona = personas.find(p => p.id === currentPersonaId);
    return persona ? persona.title : "Custom persona";
  };

  const getModelDisplay = () => {
    if (!currentModel) return "No model available";
    return currentModel.displayName + (!currentCharacter?.defaultModelId ? " (app default)" : "");
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100">
      {/* Header */}
      <header className="z-20 flex-shrink-0 border-b border-white/10 px-3 pb-3 pt-10 bg-[#050505]">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            className={cn(
              "flex items-center justify-center",
              radius.full,
              "border border-white/15 bg-white/5 text-white",
              interactive.transition.default,
              "hover:border-white/25 hover:bg-white/10"
            )}
            aria-label="Back to chat"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="flex flex-col items-start min-w-0 flex-1">
            <h1 className={cn(
              typography.h1.size,
              typography.h1.weight,
              "text-white text-left truncate whitespace-nowrap"
            )}>
              Chat Settings
            </h1>
            <p className={cn(
              typography.bodySmall.size,
              "text-white/50 mt-1 text-left truncate whitespace-nowrap"
            )}>
              Manage conversation preferences
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={spacing.section}
        >
          {/* Character Info */}
          <section className={cn(
            radius.lg,
            "border border-white/10 bg-[#0c0d13]/85 p-4 backdrop-blur-sm"
          )}>
            <div className="flex items-center gap-3">
              {avatarDisplay}
              <div className="min-w-0 flex-1">
                <h3 className={cn(typography.body.size, typography.h3.weight, "text-white")}>
                  {characterName}
                </h3>
                {currentCharacter?.description && (
                  <p className={cn(typography.caption.size, "text-gray-400 leading-relaxed line-clamp-2 mt-1")}>
                    {currentCharacter.description}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Actions */}
          <section className={spacing.field}>
            <SettingsButton
              icon={<MessageSquarePlus className="h-4 w-4" />}
              title="New Chat"
              subtitle="Start a fresh conversation"
              onClick={handleNewChat}
            />

            <SettingsButton
              icon={<History className="h-4 w-4" />}
              title="Chat History"
              subtitle="View previous sessions"
              onClick={handleViewHistory}
            />

            <SettingsButton
              icon={<User className="h-4 w-4" />}
              title="Change Persona"
              subtitle={getCurrentPersonaDisplay()}
              onClick={() => setShowPersonaSelector(true)}
              disabled={!currentSession}
            />

            <SettingsButton
              icon={<Cpu className="h-4 w-4" />}
              title="Change Model"
              subtitle={getModelDisplay()}
              onClick={() => setShowModelSelector(true)}
            />

            <SettingsButton
              icon={<SlidersHorizontal className="h-4 w-4" />}
              title="Session Advanced Settings"
              subtitle={sessionAdvancedSummary}
              onClick={() => {
                if (!currentSession) return;
                const draft = sessionAdvancedSettings ?? globalAdvancedSettings ?? createDefaultAdvancedModelSettings();
                setSessionAdvancedDraft(draft);
                setSessionOverrideEnabled(Boolean(sessionAdvancedSettings));
                setShowSessionAdvancedMenu(true);
              }}
              disabled={!currentSession}
            />
          </section>
        </motion.div>
      </main>

      {/* Persona Selection */}
      <BottomMenu
        isOpen={showPersonaSelector}
        onClose={() => setShowPersonaSelector(false)}
        title="Select Persona"
        includeExitIcon={false}
        location="bottom"
      >
        <MenuSection>
          {personas.length === 0 ? (
            <div className={cn(
              radius.lg,
              "border border-amber-500/20 bg-amber-500/10 px-6 py-4"
            )}>
              <p className={cn(typography.bodySmall.size, "text-amber-200")}>
                No personas available. Create one in settings first.
              </p>
            </div>
          ) : (
            <div className={spacing.field}>
              <PersonaOption
                title="No Persona"
                description="Disable persona for this conversation"
                isSelected={currentSession?.personaId === null || currentSession?.personaId === undefined}
                onClick={() => handleChangePersona(null)}
                onLongPress={() => {}}
              />
              {personas.map((persona) => (
                <PersonaOption
                  key={persona.id}
                  title={persona.title}
                  description={persona.description}
                  isDefault={persona.isDefault}
                  isSelected={persona.id === currentSession?.personaId}
                  onClick={() => handleChangePersona(persona.id)}
                  onLongPress={() => {
                    setSelectedPersonaForActions(persona);
                    setShowPersonaActions(true);
                  }}
                />
              ))}
            </div>
          )}
        </MenuSection>
      </BottomMenu>

      {/* Model Selection */}
      <BottomMenu
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        title="Select Model"
        includeExitIcon={false}
        location="bottom"
      >
        <MenuSection>
          {models.length === 0 ? (
            <div className={cn(
              radius.lg,
              "border border-amber-500/20 bg-amber-500/10 px-6 py-4"
            )}>
              <p className={cn(typography.bodySmall.size, "text-amber-200")}>
                No models available. Please configure a provider in settings first.
              </p>
            </div>
          ) : (
            <div className={spacing.field}>
              {models.map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  isSelected={model.id === effectiveModelId}
                  isGlobalDefault={model.id === globalDefaultModelId}
                  isCharacterDefault={model.id === currentCharacter?.defaultModelId}
                  onClick={() => handleChangeModel(model.id)}
                />
              ))}
            </div>
          )}
        </MenuSection>
      </BottomMenu>

      {/* Persona Actions */}
      <BottomMenu
        isOpen={showPersonaActions}
        onClose={() => setShowPersonaActions(false)}
        title="Persona Actions"
      >
        <MenuSection>
          <div className="space-y-2">
            <button
              onClick={() => {
                if (selectedPersonaForActions) {
                  navigate(`/settings/personas/${selectedPersonaForActions.id}/edit`);
                }
                setShowPersonaActions(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10">
                <Edit2 className="h-4 w-4 text-white/70" />
              </div>
              <span className="text-sm font-medium text-white">Edit Persona</span>
            </button>

            <button
              onClick={async () => {
                if (selectedPersonaForActions) {
                  try {
                    await deletePersona(selectedPersonaForActions.id);
                    loadPersonas();
                  } catch (error) {
                    console.error("Failed to delete persona:", error);
                  }
                }
                setShowPersonaActions(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left transition hover:border-red-500/50 hover:bg-red-500/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-red-500/30 bg-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-300">Delete Persona</span>
            </button>
          </div>
        </MenuSection>
      </BottomMenu>

      {/* Session Advanced Settings Bottom Menu */}
      <BottomMenu
        isOpen={showSessionAdvancedMenu}
        onClose={() => setShowSessionAdvancedMenu(false)}
        title="Session Advanced Settings"
        includeExitIcon={true}
        location="bottom"
      >
        <MenuSection>
          {currentSession ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">Session override</p>
                  <p className="mt-1 text-xs text-white/50 leading-relaxed">
                    Customize parameters just for this conversation
                  </p>
                </div>

                <div className="flex items-center">
                  <input
                    id="use-as-default"
                    type="checkbox"
                    checked={sessionOverrideEnabled}
                    onChange={() => setSessionOverrideEnabled((value) => !value)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor="use-as-default"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-all ${sessionOverrideEnabled
                      ? 'bg-emerald-500'
                      : 'bg-white/20'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 mt-0.5 transform rounded-full bg-white transition ${sessionOverrideEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                    />
                  </label>
                </div>

              </div>

              {/* Advanced Settings Controls */}
              {sessionOverrideEnabled && (
                <div className="space-y-3">
                  {/* Parameter Support Info Button */}
                  <button
                    onClick={() => setShowParameterSupport(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-2.5 text-sm text-blue-200 transition hover:bg-blue-400/15 active:scale-[0.99]"
                  >
                    <Info className="h-4 w-4" />
                    <span>View Parameter Support</span>
                  </button>

                  {/* Temperature */}
                  <div className="rounded-xl border border-white/10 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">Temperature</label>
                        <p className="mt-0.5 text-xs text-white/50">Controls randomness and creativity</p>
                      </div>
                      <span className="rounded-lg bg-emerald-400/15 px-2.5 py-1 text-sm font-mono font-semibold text-emerald-200">
                        {sessionAdvancedDraft.temperature?.toFixed(2) ?? "0.70"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ADVANCED_TEMPERATURE_RANGE.min}
                      max={ADVANCED_TEMPERATURE_RANGE.max}
                      step={0.01}
                      value={sessionAdvancedDraft.temperature ?? 0.7}
                      onChange={(e) => setSessionAdvancedDraft({ ...sessionAdvancedDraft, temperature: Number(e.target.value) })}
                      className="w-full"
                      style={{
                        background: `linear-gradient(to right, rgb(52, 211, 153) 0%, rgb(52, 211, 153) ${((sessionAdvancedDraft.temperature ?? 0.7) / ADVANCED_TEMPERATURE_RANGE.max) * 100}%, rgba(255,255,255,0.1) ${((sessionAdvancedDraft.temperature ?? 0.7) / ADVANCED_TEMPERATURE_RANGE.max) * 100}%, rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                      <span>0 - Precise</span>
                      <span>2 - Creative</span>
                    </div>
                  </div>

                  {/* Top P */}
                  <div className="rounded-xl border border-white/10 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">Top P</label>
                        <p className="mt-0.5 text-xs text-white/50">Nucleus sampling threshold</p>
                      </div>
                      <span className="rounded-lg bg-blue-400/15 px-2.5 py-1 text-sm font-mono font-semibold text-blue-200">
                        {sessionAdvancedDraft.topP?.toFixed(2) ?? "1.00"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ADVANCED_TOP_P_RANGE.min}
                      max={ADVANCED_TOP_P_RANGE.max}
                      step={0.01}
                      value={sessionAdvancedDraft.topP ?? 1}
                      onChange={(e) => setSessionAdvancedDraft({ ...sessionAdvancedDraft, topP: Number(e.target.value) })}
                      className="w-full"
                      style={{
                        background: `linear-gradient(to right, rgb(96, 165, 250) 0%, rgb(96, 165, 250) ${((sessionAdvancedDraft.topP ?? 1) / ADVANCED_TOP_P_RANGE.max) * 100}%, rgba(255,255,255,0.1) ${((sessionAdvancedDraft.topP ?? 1) / ADVANCED_TOP_P_RANGE.max) * 100}%, rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                      <span>0 - Focused</span>
                      <span>1 - Diverse</span>
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div className="rounded-xl border border-white/10 p-4">
                    <div className="mb-3">
                      <label className="text-sm font-medium text-white">Max Output Tokens</label>
                      <p className="mt-0.5 text-xs text-white/50">Maximum response length</p>
                    </div>
                    
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setSessionAdvancedDraft({ ...sessionAdvancedDraft, maxOutputTokens: null })}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          !sessionAdvancedDraft.maxOutputTokens
                            ? 'bg-purple-400/20 text-purple-200'
                            : 'border border-white/10 text-white/60 hover:bg-white/5 active:bg-white/10'
                        }`}
                      >
                        Auto
                      </button>
                      <button
                        type="button"
                        onClick={() => setSessionAdvancedDraft({ ...sessionAdvancedDraft, maxOutputTokens: 1024 })}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          sessionAdvancedDraft.maxOutputTokens
                            ? 'bg-purple-400/20 text-purple-200'
                            : 'border border-white/10 text-white/60 hover:bg-white/5 active:bg-white/10'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                    
                    {sessionAdvancedDraft.maxOutputTokens !== null && sessionAdvancedDraft.maxOutputTokens !== undefined && (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={ADVANCED_MAX_TOKENS_RANGE.min}
                        max={ADVANCED_MAX_TOKENS_RANGE.max}
                        value={sessionAdvancedDraft.maxOutputTokens ?? ''}
                        onChange={(e) => setSessionAdvancedDraft({ ...sessionAdvancedDraft, maxOutputTokens: Number(e.target.value) })}
                        placeholder="1024"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3.5 py-3 text-base text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                      />
                    )}
                    
                    <p className="mt-2 text-xs text-white/40">
                      {!sessionAdvancedDraft.maxOutputTokens 
                        ? 'Let the model decide the response length'
                        : `Range: ${ADVANCED_MAX_TOKENS_RANGE.min.toLocaleString()} - ${ADVANCED_MAX_TOKENS_RANGE.max.toLocaleString()}`
                      }
                    </p>
                  </div>

                  {/* Frequency Penalty */}
                  <div className="rounded-xl border border-white/10 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">Frequency Penalty</label>
                        <p className="mt-0.5 text-xs text-white/50">Reduce repetition of token sequences</p>
                      </div>
                      <span className="rounded-lg bg-orange-400/15 px-2.5 py-1 text-sm font-mono font-semibold text-orange-200">
                        {sessionAdvancedDraft.frequencyPenalty?.toFixed(2) ?? "0.00"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ADVANCED_FREQUENCY_PENALTY_RANGE.min}
                      max={ADVANCED_FREQUENCY_PENALTY_RANGE.max}
                      step={0.01}
                      value={sessionAdvancedDraft.frequencyPenalty ?? 0}
                      onChange={(e) => setSessionAdvancedDraft({ ...sessionAdvancedDraft, frequencyPenalty: Number(e.target.value) })}
                      className="w-full"
                      style={{
                        background: `linear-gradient(to right, rgb(251, 146, 60) 0%, rgb(251, 146, 60) ${((sessionAdvancedDraft.frequencyPenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) ${((sessionAdvancedDraft.frequencyPenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                      <span>-2 - More Rep.</span>
                      <span>2 - Less Rep.</span>
                    </div>
                  </div>

                  {/* Presence Penalty */}
                  <div className="rounded-xl border border-white/10 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">Presence Penalty</label>
                        <p className="mt-0.5 text-xs text-white/50">Encourage discussing new topics</p>
                      </div>
                      <span className="rounded-lg bg-pink-400/15 px-2.5 py-1 text-sm font-mono font-semibold text-pink-200">
                        {sessionAdvancedDraft.presencePenalty?.toFixed(2) ?? "0.00"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ADVANCED_PRESENCE_PENALTY_RANGE.min}
                      max={ADVANCED_PRESENCE_PENALTY_RANGE.max}
                      step={0.01}
                      value={sessionAdvancedDraft.presencePenalty ?? 0}
                      onChange={(e) => setSessionAdvancedDraft({ ...sessionAdvancedDraft, presencePenalty: Number(e.target.value) })}
                      className="w-full"
                      style={{
                        background: `linear-gradient(to right, rgb(244, 114, 182) 0%, rgb(244, 114, 182) ${((sessionAdvancedDraft.presencePenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) ${((sessionAdvancedDraft.presencePenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                      <span>-2 - Repeat</span>
                      <span>2 - Explore</span>
                    </div>
                  </div>

                  {/* Top K */}
                  <div className="rounded-xl border border-white/10 p-4">
                    <div className="mb-3">
                      <label className="text-sm font-medium text-white">Top K</label>
                      <p className="mt-0.5 text-xs text-white/50">Limit sampling to top K tokens</p>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={ADVANCED_TOP_K_RANGE.min}
                      max={ADVANCED_TOP_K_RANGE.max}
                      value={sessionAdvancedDraft.topK ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value);
                        setSessionAdvancedDraft({ ...sessionAdvancedDraft, topK: val });
                      }}
                      placeholder="40"
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-3.5 py-3 text-base text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                    />
                    <p className="mt-2 text-xs text-white/40">
                      Lower values = more focused, higher = more diverse
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSessionOverrideEnabled(false);
                    setSessionAdvancedDraft(globalAdvancedSettings ?? createDefaultAdvancedModelSettings());
                    handleSaveSessionAdvancedSettings(null);
                  }}
                  className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-medium text-white hover:bg-white/5 active:scale-[0.99]"
                >
                  Use app defaults
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSaveSessionAdvancedSettings(sessionOverrideEnabled ? sessionAdvancedDraft : null)
                  }
                  className="flex-1 rounded-xl bg-emerald-400/20 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/25 active:scale-[0.99]"
                >
                  Save changes
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-6 py-4 text-sm text-amber-200">
              Open a chat session to configure per-session settings.
            </div>
          )}
        </MenuSection>
      </BottomMenu>

      {/* Parameter Support Info */}
      <BottomMenu
        isOpen={showParameterSupport}
        onClose={() => setShowParameterSupport(false)}
        title="Parameter Support"
        includeExitIcon={true}
        location="bottom"
      >
        <MenuSection>
          <ProviderParameterSupportInfo 
            providerId={(() => {
              const effectiveModelId = getEffectiveModelId();
              const model = models.find(m => m.id === effectiveModelId);
              return model?.providerId || 'openai';
            })()} 
          />
        </MenuSection>
      </BottomMenu>
    </div>
  );
}

export function ChatSettingsPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const chatController = useChatController(characterId);

  const { character, loading, error } = chatController;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-white/60" />
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4">
        <div className="text-center">
          <p className="text-lg text-white">Character not found</p>
          <p className="mt-2 text-sm text-gray-400">
            {error || "The character you're looking for doesn't exist."}
          </p>
        </div>
      </div>
    );
  }

  return <ChatSettingsContent character={character} />;
}
