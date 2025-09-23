import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, MessageSquarePlus, Cpu, ChevronRight, Check } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { Character, Model } from "../../../core/storage/schemas";
import { useChatController } from "./hooks/useChatController";
import { readSettings, saveCharacter } from "../../../core/storage/repo";
import { createSession } from "../../../core/storage/repo";
import { BottomMenu, MenuSection } from "../../components";

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

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    setCurrentCharacter(character);
  }, [character]);

  const loadModels = async () => {
    const settings = await readSettings();
    setModels(settings.models);
    setGlobalDefaultModelId(settings.defaultModelId);
  };

  const getEffectiveModelId = () => {
    // Mirror the backend select_model logic: character.default_model_id || settings.default_model_id
    return currentCharacter?.defaultModelId || globalDefaultModelId || null;
  };

  const handleNewChat = async () => {
    if (!characterId) return;
    
    try {
      const session = await createSession(characterId, "New Chat");
      navigate(`/chat/${characterId}`, { replace: true });
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
    } catch (error) {
      console.error("Failed to change character model:", error);
    }
  };

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

  const handleBack = () => {
    if (characterId) {
      navigate(`/chat/${characterId}`);
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
            <h1 className="text-lg font-semibold text-white">Chat Settings</h1>
            <p className="text-sm text-gray-400">Manage conversation preferences</p>
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
                <h3 className="text-lg font-semibold text-white">{characterName}</h3>
                {currentCharacter?.description && (
                  <p className="mt-1 text-xs text-gray-400 line-clamp-1">{currentCharacter.description}</p>
                )}
              </div>
            </div>
          </section>

          {/* Action Buttons */}
          <section className="space-y-3">
            {/* New Chat */}
            <button
              onClick={handleNewChat}
              className="group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#0c0d13]/85 p-4 text-left text-white transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white/80">
                  <MessageSquarePlus className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">New Chat</div>
                  <div className="text-xs text-gray-400">Start a fresh conversation</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-500 transition group-hover:text-white" />
            </button>

            {/* Change Model */}
            <button
              onClick={() => setShowModelSelector(true)}
              className="group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#0c0d13]/85 p-4 text-left text-white transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white/80">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Change Model</div>
                  <div className="text-xs text-gray-400">
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
              <ChevronRight className="h-4 w-4 text-gray-500 transition group-hover:text-white" />
            </button>
          </section>
        </motion.div>
      </main>

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