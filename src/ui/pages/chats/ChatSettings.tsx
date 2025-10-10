import { useMemo, useState, useEffect, useCallback } from "react";
import { ArrowLeft, MessageSquarePlus, Cpu, ChevronRight, Check, History, User, SlidersHorizontal } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { AdvancedModelSettings, Character, Model, Persona, Session } from "../../../core/storage/schemas";
import { createDefaultAdvancedModelSettings } from "../../../core/storage/schemas";
import { useChatController } from "./hooks/useChatController";
import { readSettings, saveCharacter, createSession, listPersonas, getSession, saveSession } from "../../../core/storage/repo";
import { BottomMenu, MenuSection } from "../../components";
import {
  AdvancedModelSettingsForm,
  formatAdvancedModelSettingsSummary,
  sanitizeAdvancedModelSettings,
} from "../../components/AdvancedModelSettingsForm";

function isImageLike(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}

function ChatSettingsContent({ character }: { character: Character }) {
  const navigate = useNavigate();
  const { characterId } = useParams();
  const [models, setModels] = useState<Model[]>([]);
  const [globalDefaultModelId, setGlobalDefaultModelId] = useState<string | null>(null);
  const [currentCharacter, setCurrentCharacter] = useState<Character>(character);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const [globalAdvancedSettings, setGlobalAdvancedSettings] = useState<AdvancedModelSettings>(createDefaultAdvancedModelSettings());
  const [sessionAdvancedSettings, setSessionAdvancedSettings] = useState<AdvancedModelSettings | null>(null);
  const [showSessionAdvancedMenu, setShowSessionAdvancedMenu] = useState(false);
  const [sessionAdvancedDraft, setSessionAdvancedDraft] = useState<AdvancedModelSettings>(createDefaultAdvancedModelSettings());
  const [sessionOverrideEnabled, setSessionOverrideEnabled] = useState<boolean>(false);

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
        currentCharacter.scenes && currentCharacter.scenes.length > 0 ? currentCharacter.scenes[0] : undefined
      );
      navigate(`/chat/${characterId}?sessionId=${session.id}`, { replace: true });
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  const handleChangeModel = async (modelId: string) => {
    if (!characterId) return;
    
    try {
      // Update the character's default model
      const updatedCharacter = await saveCharacter({
        ...currentCharacter,
        defaultModelId: modelId
      });
      setCurrentCharacter(updatedCharacter);
      setShowModelSelector(false);
      
      // Only redirect back to chat if we have a sessionId
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('sessionId');
      if (sessionId) {
        navigate(`/chat/${characterId}?sessionId=${sessionId}`, { replace: true });
      }
      // Otherwise stay in settings - model updated successfully
    } catch (error) {
      console.error("Failed to change character model:", error);
    }
  };

  const handleChangePersona = async (personaId: string | null) => {
    if (!currentSession) {
      console.log("No current session");
      return;
    }
    
    try {
      console.log("Changing persona to:", personaId);
      const updatedSession = {
        ...currentSession,
        // Use empty string to explicitly disable persona
        personaId: personaId === null ? "" : personaId,
        updatedAt: Date.now(),
      };
      console.log("Updated session:", updatedSession);
      await saveSession(updatedSession);
      console.log("Session saved successfully");
      setCurrentSession(updatedSession);
      setShowPersonaSelector(false);
      setSessionAdvancedSettings(updatedSession.advancedModelSettings ?? null);
      
      // Only redirect back to chat if we have both characterId and sessionId
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
    if (currentCharacter?.avatarPath && isImageLike(currentCharacter.avatarPath)) {
      return (
        <img
          src={currentCharacter.avatarPath}
          alt={currentCharacter?.name ?? "avatar"}
          className="h-12 w-12 rounded-xl object-cover"
        />
      );
    }

    const initials = currentCharacter?.name ? currentCharacter.name.slice(0, 2).toUpperCase() : "?";
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm font-semibold text-white">
        {initials}
      </div>
    );
  }, [currentCharacter]);

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
      // Only navigate back to chat if we have a sessionId
      if (sessionId) {
        navigate(`/chat/${characterId}?sessionId=${sessionId}`);
      } else {
        // No session, go back to character list
        navigate('/chat');
      }
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100">
      {/* Header */}
      <header className="relative z-20 flex-shrink-0 border-b border-white/10 bg-[#050505]/95 px-4 pb-4 pt-6 backdrop-blur">
        <div 
          className="flex items-center gap-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
        >
          <button
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25 hover:bg-white/10"
            aria-label="Back to chat"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col items-start min-w-0 flex-1">
            <h1 className="text-base font-semibold text-white">Chat Settings</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage conversation preferences</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="space-y-6"
        >
          {/* Character Info Section - Smaller */}
          <section className="rounded-2xl border border-white/10 bg-[#0c0d13]/85 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {avatarDisplay}
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white">{characterName}</h3>
                {currentCharacter?.description && (
                  <p className="mt-1 text-xs text-gray-400 leading-relaxed line-clamp-2">{currentCharacter.description}</p>
                )}
              </div>
            </div>
          </section>

          {/* Action Buttons */}
          <section className="space-y-3">
            {/* New Chat */}
            <button
              onClick={handleNewChat}
              className="group flex w-full min-h-[56px] items-center justify-between rounded-xl border border-white/10 bg-[#0c0d13]/85 p-4 text-left text-white transition-all duration-200 hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80">
                  <MessageSquarePlus className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">New Chat</div>
                  <div className="text-xs text-gray-400 mt-0.5">Start a fresh conversation</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
            </button>

            {/* Chat History */}
            <button
              onClick={handleViewHistory}
              className="group flex w-full min-h-[56px] items-center justify-between rounded-xl border border-white/10 bg-[#0c0d13]/85 p-4 text-left text-white transition-all duration-200 hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80">
                  <History className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Chat History</div>
                  <div className="text-xs text-gray-400 mt-0.5">View previous sessions</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
            </button>

            {/* Change Persona */}
            <button
              onClick={() => setShowPersonaSelector(true)}
              disabled={!currentSession}
              className={`group flex w-full min-h-[56px] items-center justify-between rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${
                !currentSession 
                  ? "border-white/5 bg-[#0c0d13]/50 opacity-50 cursor-not-allowed"
                  : "border-white/10 bg-[#0c0d13]/85 text-white hover:border-white/20 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Change Persona</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {currentSession ? (
                      (() => {
                        const currentPersonaId = currentSession?.personaId;
                        // Empty string means explicitly disabled
                        if (currentPersonaId === "") {
                          return "No persona";
                        }
                        // Undefined or null means use default
                        if (!currentPersonaId) {
                          const defaultPersona = personas.find(p => p.isDefault);
                          return defaultPersona ? `${defaultPersona.title} (default)` : "No persona";
                        }
                        // Has a specific persona selected
                        const persona = personas.find(p => p.id === currentPersonaId);
                        return persona ? persona.title : "Custom persona";
                      })()
                    ) : (
                      "Open a chat session first"
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
            </button>

            {/* Change Model */}
            <button
              onClick={() => setShowModelSelector(true)}
              className="group flex w-full min-h-[56px] items-center justify-between rounded-xl border border-white/10 bg-[#0c0d13]/85 p-4 text-left text-white transition-all duration-200 hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80">
                  <Cpu className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Change Model</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {currentModel ? (
                      <>
                        {currentModel.displayName}
                        {!currentCharacter?.defaultModelId && " (app default)"}
                      </>
                    ) : (
                      "No model available"
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
            </button>

            {/* Session Advanced Settings */}
            <button
              onClick={() => {
                if (!currentSession) return;
                const draft = sessionAdvancedSettings ?? globalAdvancedSettings ?? createDefaultAdvancedModelSettings();
                setSessionAdvancedDraft(draft);
                setSessionOverrideEnabled(Boolean(sessionAdvancedSettings));
                setShowSessionAdvancedMenu(true);
              }}
              disabled={!currentSession}
              className={`group flex w-full min-h-[56px] items-center justify-between rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${
                !currentSession
                  ? "border-white/5 bg-[#0c0d13]/50 opacity-50 cursor-not-allowed"
                  : "border-white/10 bg-[#0c0d13]/85 text-white hover:border-white/20 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80">
                  <SlidersHorizontal className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Session Advanced Settings</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {sessionAdvancedSummary}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
            </button>
          </section>
        </motion.div>
      </main>

      {/* Persona Selection Bottom Menu */}
      <BottomMenu
        isOpen={showPersonaSelector}
        onClose={() => setShowPersonaSelector(false)}
        title="Select Persona"
        includeExitIcon={true}
        location="bottom"
      >
        <MenuSection>
          {personas.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-6 py-4">
              <p className="text-amber-200 text-sm">
                No personas available. Create one in settings first.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* None option - No Persona */}
              <button
                onClick={() => handleChangePersona(null)}
                className={`flex w-full items-center justify-between rounded-2xl p-4 text-left transition ${
                  currentSession?.personaId === ""
                    ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100"
                    : "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <div className="flex-1">
                  <div className="text-base font-semibold">No Persona</div>
                  <div className="text-sm text-gray-400 mt-1">
                    Disable persona for this conversation
                  </div>
                </div>
                {currentSession?.personaId === "" && (
                  <Check className="h-4 w-4 text-emerald-400" />
                )}
              </button>

              {/* Persona options */}
              {personas.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => handleChangePersona(persona.id)}
                  className={`flex w-full items-center justify-between rounded-2xl p-4 text-left transition ${
                    persona.id === currentSession?.personaId
                      ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100"
                      : "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div className="flex-1">
                    <div className="text-base font-semibold">
                      {persona.title}
                      {persona.isDefault && <span className="ml-2 text-xs text-blue-300">(app default)</span>}
                    </div>
                    <div className="text-sm text-gray-400 mt-1 line-clamp-2">
                      {persona.description}
                    </div>
                  </div>
                  {persona.id === currentSession?.personaId && (
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          )}
        </MenuSection>
      </BottomMenu>

      {/* Model Selection Bottom Menu */}
      <BottomMenu
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        title="Select Model"
        includeExitIcon={true}
        location="bottom"
      >
        <MenuSection>
          {models.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-6 py-4">
              <p className="text-amber-200 text-sm">
                No models available. Please configure a provider in settings first.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleChangeModel(model.id)}
                  className={`flex w-full items-center justify-between rounded-2xl p-4 text-left transition ${
                    model.id === effectiveModelId
                      ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100"
                      : "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div className="flex-1">
                    <div className="text-base font-semibold">{model.displayName}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      {model.name}
                      {model.id === globalDefaultModelId && model.id !== currentCharacter?.defaultModelId && (
                        <span className="ml-1 text-blue-300">(app default)</span>
                      )}
                    </div>
                  </div>
                  {model.id === effectiveModelId && (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-200">
                        {model.id === currentCharacter?.defaultModelId ? "Character" : "Default"}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
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
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0c0d13]/85 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">Session override</p>
                  <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                    Enable to customize temperature, top P, and token limits just for this conversation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSessionOverrideEnabled((value) => !value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    sessionOverrideEnabled ? "bg-emerald-400/70" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                      sessionOverrideEnabled ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                  <span className="sr-only">Toggle session override</span>
                </button>
              </div>

              <AdvancedModelSettingsForm
                settings={sessionAdvancedDraft}
                onChange={setSessionAdvancedDraft}
                disabled={!sessionOverrideEnabled}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSessionOverrideEnabled(false);
                    setSessionAdvancedDraft(globalAdvancedSettings ?? createDefaultAdvancedModelSettings());
                    handleSaveSessionAdvancedSettings(null);
                  }}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
                >
                  Use app defaults
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSaveSessionAdvancedSettings(sessionOverrideEnabled ? sessionAdvancedDraft : null)
                  }
                  className="flex-1 rounded-xl border border-emerald-400/40 bg-emerald-400/20 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-400/30"
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
