import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Camera, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { readSettings, saveCharacter } from "../../../core/storage/repo";
import type { Model } from "../../../core/storage/schemas";

enum Step {
  Identity = 1,
  Description = 2,
}

export function CreateCharacterPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(Step.Identity);
  const [name, setName] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [description, setDescription] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const settings = await readSettings();
        if (cancelled) return;
        setModels(settings.models);
        const defaultId = settings.defaultModelId ?? settings.models[0]?.id ?? null;
        setSelectedModelId(defaultId);
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const canContinueIdentity = name.trim().length > 0 && !saving;
  const canSaveDescription = description.trim().length > 0 && selectedModelId !== null && !saving;
    const progress = step === Step.Identity ? 0.5 : 1;

  const avatarPreview = useMemo(() => {
    if (!avatarPath) {
      const initial = name.trim().charAt(0) || "?";
      return (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500/20 to-blue-500/20">
          <span className="text-2xl font-bold text-white">{initial.toUpperCase()}</span>
        </div>
      );
    }

    return (
      <img
        src={avatarPath}
        alt="Character avatar"
        className="h-full w-full object-cover"
      />
    );
  }, [avatarPath, name]);

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPath(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!canSaveDescription) return;
    try {
      setSaving(true);
      setError(null);
      await saveCharacter({
        name: name.trim(),
        avatarPath: avatarPath || undefined,
        description: description.trim(),
      });

      navigate("/chat");
    } catch (e: any) {
      setError(e?.message || "Failed to save character");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (step === Step.Description) {
        event.preventDefault();
        setStep(Step.Identity);
        window.history.pushState(null, '', window.location.pathname);
      }
    };

    const handleBackButton = () => {
      if (step === Step.Description) {
        setStep(Step.Identity);
        return true; 
      }
      return false; 
    };

    (window as any).__createCharacterBackHandler = handleBackButton;

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      delete (window as any).__createCharacterBackHandler;
    };
  }, [step]);

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100">
      {/* Progress bar */}
      <div className="px-6 mb-8 pt-4">
        <div className="h-1 w-full rounded-full bg-white/5">
          <motion.div
            className="h-1 rounded-full bg-gradient-to-r from-purple-500 to-blue-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Content */}
      <main className="px-6 pb-32">
        <AnimatePresence mode="wait">
          {step === Step.Identity ? (
            <IdentityStep
              key="identity"
              name={name}
              onNameChange={setName}
              avatarPath={avatarPath}
              onAvatarChange={setAvatarPath}
              onUpload={handleAvatarUpload}
              onContinue={() => setStep(Step.Description)}
              canContinue={canContinueIdentity}
              avatarPreview={avatarPreview}
            />
          ) : (
            <DescriptionStep
              key="description"
              description={description}
              onDescriptionChange={setDescription}
              models={models}
              loadingModels={loadingModels}
              selectedModelId={selectedModelId}
              onSelectModel={setSelectedModelId}
              onSave={handleSave}
              canSave={canSaveDescription}
              saving={saving}
              error={error}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function IdentityStep({
  name,
  onNameChange,
  avatarPath,
  onAvatarChange,
  onUpload,
  onContinue,
  canContinue,
  avatarPreview,
}: {
  name: string;
  onNameChange: (value: string) => void;
  avatarPath: string;
  onAvatarChange: (value: string) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onContinue: () => void;
  canContinue: boolean;
  avatarPreview: ReactNode;
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Create your character</h2>
        <p className="text-gray-400">Give your AI character a name and personality</p>
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-white/10">
            {avatarPreview}
          </div>
          
          {/* Upload Button */}
          <label className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-[#0b0b0d] text-white/70 transition hover:border-white/40 hover:text-white">
            <Camera size={14} />
            <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
          </label>
          
          {/* Remove Button */}
          {avatarPath && (
            <button
              onClick={() => onAvatarChange("")}
              className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-red-500/30 bg-red-500/20 text-red-400 transition hover:bg-red-500/30"
            >
              <X size={12} />
            </button>
          )}
        </div>
        
        <p className="text-center text-xs text-gray-500">
          Tap to {avatarPath ? 'change' : 'add'} avatar
        </p>
      </div>

      {/* Name Input */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-300">
          Character Name
        </label>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Enter character name..."
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-lg text-white placeholder-gray-500 transition focus:border-white/20 focus:bg-white/10 focus:outline-none"
          autoFocus
        />
        <p className="text-xs text-gray-500">
          This will appear in your chat list and conversations
        </p>
      </div>

      {/* Continue Button */}
      <div className="pt-8">
        <motion.button
          disabled={!canContinue}
          onClick={onContinue}
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.02 }}
          className={`w-full rounded-2xl py-4 text-base font-semibold transition ${
            canContinue 
              ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg hover:shadow-xl" 
              : "cursor-not-allowed bg-gray-600/50 text-gray-400"
          }`}
        >
          Continue to Description
        </motion.button>
      </div>
    </motion.div>
  );
}

function DescriptionStep({
  description,
  onDescriptionChange,
  models,
  loadingModels,
  selectedModelId,
  onSelectModel,
  onSave,
  canSave,
  saving,
  error,
}: {
  description: string;
  onDescriptionChange: (value: string) => void;
  models: Model[];
  loadingModels: boolean;
  selectedModelId: string | null;
  onSelectModel: (value: string | null) => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
  error: string | null;
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Describe your character</h2>
        <p className="text-gray-400">How should your character behave and respond?</p>
      </div>

      {/* Description Textarea */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-300">
          Character Description
        </label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={6}
          placeholder="Describe your character's personality, background, speaking style, and any special traits they should have..."
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-base text-white placeholder-gray-500 transition focus:border-white/20 focus:bg-white/10 focus:outline-none"
          autoFocus
        />
        <p className="text-xs text-gray-500">
          Be specific about tone, knowledge areas, and conversation style
        </p>
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-300">
          AI Model
        </label>
        {loadingModels ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4">
            <Loader2 size={20} className="animate-spin text-gray-400" />
            <span className="text-gray-400">Loading available models...</span>
          </div>
        ) : models.length ? (
          <select
            value={selectedModelId ?? ""}
            onChange={(e) => onSelectModel(e.target.value || null)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-base text-white transition focus:border-white/20 focus:bg-white/10 focus:outline-none"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id} className="bg-[#050505] text-white">
                {model.displayName} ({model.providerLabel})
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-6 py-4">
            <p className="text-amber-200 text-sm">
              No models available. Please configure a provider in settings first.
            </p>
          </div>
        )}
        <p className="text-xs text-gray-500">
          Choose which AI model will power this character
        </p>
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4"
          >
            <p className="text-red-200 text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Button */}
      <div className="pt-8">
        <motion.button
          disabled={!canSave}
          onClick={onSave}
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: canSave ? 1.02 : 1 }}
          className={`w-full rounded-2xl py-4 text-base font-semibold transition ${
            canSave 
              ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg hover:shadow-xl" 
              : "cursor-not-allowed bg-gray-600/50 text-gray-400"
          }`}
        >
          {saving ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" />
              <span>Creating...</span>
            </div>
          ) : (
            "Create Character"
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
