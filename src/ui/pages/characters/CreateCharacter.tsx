import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { readSettings, saveCharacter } from "../../../core/storage/repo";
import type { Model } from "../../../core/storage/schemas";
import { typography, radius, spacing, interactive, shadows, cn } from "../../design-tokens";

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
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
          <span className="text-3xl font-bold text-white">{initial.toUpperCase()}</span>
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
      console.log(e)
      setError(e || "Failed to save character");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] text-gray-100">
      {/* Custom TopNav for Create Page */}
      <header
        className="border-b border-white/5 bg-[#050505]"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <div className="relative mx-auto flex h-14 w-full items-center justify-center px-4">
          <button
            onClick={() => {
              if (step === Step.Description) {
                setStep(Step.Identity);
              } else {
                navigate(-1);
              }
            }}
            className="absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-white/30 hover:text-white active:scale-95"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[11px] uppercase tracking-[0.4em] text-gray-500">LettuceAI</span>
            <span className="text-sm font-semibold text-white">Create</span>
          </div>
        </div>
      </header>

      {/* Progress indicator */}
      <div className="border-b border-white/5 bg-[#050505] px-4 pb-3 pt-4">
        <div className={cn("relative h-1 w-full overflow-hidden", radius.full, "bg-white/5")}>
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400/60 to-blue-400/60"
            initial={{ width: "0%" }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className={cn(
            typography.overline.size,
            typography.overline.weight,
            typography.overline.tracking,
            "uppercase text-white/40"
          )}>
            Step {step} of 2
          </span>
          <span className={cn(
            typography.caption.size,
            typography.caption.weight,
            "text-white/50"
          )}>
            {step === Step.Identity ? "Identity" : "Description"}
          </span>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 pb-20 pt-4">
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={spacing.section}
    >
      {/* Title */}
      <div className={spacing.tight}>
        <h2 className={cn(typography.h1.size, typography.h1.weight, "text-white")}>
          Create Character
        </h2>
        <p className={cn(typography.body.size, "text-white/50")}>
          Give your AI character an identity
        </p>
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="relative">
          <div className={cn(
            "h-28 w-28 overflow-hidden border border-white/10 bg-white/5",
            radius.full,
            shadows.md
          )}>
            {avatarPreview}
          </div>
          
          {/* Upload Button */}
          <label className={cn(
            "group absolute -bottom-1 -right-1 flex h-10 w-10 cursor-pointer items-center justify-center border border-white/10 bg-[#0b0b0d] text-white/60",
            radius.full,
            shadows.lg,
            interactive.transition.default,
            "hover:border-white/25 hover:bg-white/5 hover:text-white active:scale-95"
          )}>
            <Camera size={16} />
            <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
          </label>
          
          {/* Remove Button */}
          {avatarPath && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              onClick={() => onAvatarChange("")}
              className={cn(
                "absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center border border-red-400/30 bg-red-400/20 text-red-300",
                radius.full,
                shadows.lg,
                interactive.transition.default,
                "hover:border-red-400/50 hover:bg-red-400/30 active:scale-95"
              )}
            >
              <X size={14} />
            </motion.button>
          )}
        </div>
        
        <p className={cn(
          "text-center",
          typography.caption.size,
          typography.caption.weight,
          "text-white/40"
        )}>
          {avatarPath ? 'Tap camera to change' : 'Tap camera to add avatar'}
        </p>
      </div>

      {/* Name Input */}
      <div className={spacing.field}>
        <label className={cn(
          typography.label.size,
          typography.label.weight,
          typography.label.tracking,
          "uppercase text-white/70"
        )}>
          Name
        </label>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Enter character name..."
          className={cn(
            "w-full border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/40 backdrop-blur-xl",
            radius.md,
            interactive.transition.default,
            "focus:border-white/30 focus:bg-black/30 focus:outline-none"
          )}
          autoFocus
        />
        <p className={cn(typography.bodySmall.size, "text-white/40")}>
          This name will appear in chat conversations
        </p>
      </div>

      {/* Continue Button */}
      <div className="pt-4">
        <motion.button
          disabled={!canContinue}
          onClick={onContinue}
          whileTap={{ scale: canContinue ? 0.98 : 1 }}
          className={cn(
            "w-full py-3.5",
            radius.md,
            typography.body.size,
            typography.h3.weight,
            interactive.transition.fast,
            canContinue 
              ? cn(
                  "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
                  shadows.glow,
                  "hover:border-emerald-400/60 hover:bg-emerald-400/30"
                )
              : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
          )}
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Title */}
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-white">Character Description</h2>
        <p className="text-sm text-white/50">Define personality and behavior</p>
      </div>

      {/* Description Textarea */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-[0.35em] text-white/70">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={7}
          placeholder="Describe personality, speaking style, background, knowledge areas..."
          className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed text-white placeholder-white/40 backdrop-blur-xl transition focus:border-white/30 focus:bg-black/30 focus:outline-none"
          autoFocus
        />
        <p className="text-xs text-white/40">
          Be specific about tone, traits, and conversation style
        </p>
      </div>

      {/* Model Selection */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-[0.35em] text-white/70">
          AI Model
        </label>
        {loadingModels ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
            <span className="text-sm text-white/60">Loading models...</span>
          </div>
        ) : models.length ? (
          <select
            value={selectedModelId ?? ""}
            onChange={(e) => onSelectModel(e.target.value || null)}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white backdrop-blur-xl transition focus:border-white/30 focus:bg-black/30 focus:outline-none"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id} className="bg-[#0b0b0d] text-white">
                {model.displayName} · {model.providerLabel}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 backdrop-blur-xl">
            <p className="text-sm text-amber-200/90">
              No models configured. Add a provider in settings first.
            </p>
          </div>
        )}
        <p className="text-xs text-white/40">
          This model will power the character's responses
        </p>
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 backdrop-blur-xl"
          >
            <p className="text-sm text-red-200">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Button */}
      <div className="pt-4">
        <motion.button
          disabled={!canSave}
          onClick={onSave}
          whileTap={{ scale: canSave ? 0.98 : 1 }}
          className={`w-full rounded-xl py-3.5 text-sm font-semibold transition ${
            canSave 
              ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 shadow-[0_8px_24px_rgba(52,211,153,0.15)] hover:border-emerald-400/60 hover:bg-emerald-400/30" 
              : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
          }`}
        >
          {saving ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200/30 border-t-emerald-200" />
              <span>Creating Character...</span>
            </div>
          ) : (
            "Create Character"
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
