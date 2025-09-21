import { useState, useEffect } from "react";
import { motion, AnimatePresence, useDragControls, type PanInfo } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  X,
  Plus,
  ChevronRight,
  Cpu,
  Key,
  Shield,
  Check,
  Trash2,
  RotateCcw,
  AlertTriangle,
  BookOpen
} from "lucide-react";

import {
  readSettings,
  addOrUpdateProviderCredential,
  removeProviderCredential,
  addOrUpdateModel,
  removeModel,
  setDefaultModel
} from "../../../core/storage/repo";

import { providerRegistry } from "../../../core/providers/registry";
import { setSecret, getSecret } from "../../../core/secrets";
import { ResetManager } from "../../../core/storage/reset";
import type { ProviderCredential, Model, OnboardingState } from "../../../core/storage/schemas";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  const dragControls = useDragControls();

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const hasPulledFarEnough = info.offset.y > 120;
    const hasQuickSwipe = info.velocity.y > 900 && info.offset.y > 30;
    if (hasPulledFarEnough || hasQuickSwipe) {
      onClose();
      return;
    }

    dragControls.stop();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-h-[85vh] max-w-3xl overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b0b0d] shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 240 }}
            dragElastic={{ top: 0, bottom: 0.15 }}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
          >
            <div className="flex justify-center pt-4 pb-2">
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  dragControls.start(event);
                }}
                style={{ touchAction: "none" }}
                className="flex h-8 w-28 items-center justify-center border-0 bg-transparent focus:outline-none"
                aria-label="Drag to close menu"
              >
                <span className="h-1.5 w-24 rounded-full bg-white/60" />
              </button>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 px-6 pb-4">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
            </div>
            <div className="max-h-[calc(85vh-64px)] overflow-y-auto px-6 py-6">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  badge?: string;
}

function MenuItem({ icon, title, subtitle, onClick, badge }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="group flex h-full w-full items-center justify-between rounded-3xl border border-white/10 bg-[#0c0d13]/85 p-5 text-left text-white transition hover:border-white/20 hover:bg-white/10"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white/80">
          {icon}
        </div>
        <div className="space-y-1">
          <div className="text-sm font-semibold text-white">{title}</div>
          {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {badge && (
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-gray-300">
            {badge}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-gray-500 transition group-hover:text-white" />
      </div>
    </button>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<"providers" | "models" | "security" | "reset" | null>(null);
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<ProviderCredential | null>(null);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetSummary, setResetSummary] = useState<{
    appState: { onboarding: OnboardingState; theme: "light" | "dark"; tooltipCount: number };
    fileCount: number;
    estimatedSessions: number;
  } | null>(null);
  const [isPureModeEnabled, setIsPureModeEnabled] = useState(true); // Default to enabled (no NSFW)

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await readSettings();
    setProviders(settings.providerCredentials);
    setModels(settings.models);
    setDefaultModelId(settings.defaultModelId);
  };

  const openSheet = async (sheet: "providers" | "models" | "security" | "reset") => {
    if (sheet === "reset") {
      try {
        const summary = await ResetManager.getResetSummary();
        setResetSummary(summary);
      } catch (error) {
        console.error("Failed to load reset summary:", error);
      }
    }
    setActiveSheet(sheet);
    setIsOpen(true);
  };

  const closeSheet = () => {
    setIsOpen(false);
    setEditingProvider(null);
    setEditingModel(null);
    setApiKey("");
    setTimeout(() => setActiveSheet(null), 300);
  };

  const handleSaveProvider = async () => {
    if (!editingProvider) return;
    if (editingProvider.apiKeyRef) {
      editingProvider.apiKeyRef.credId = editingProvider.id;
    }
    await addOrUpdateProviderCredential(editingProvider);
    if (editingProvider.apiKeyRef && apiKey) {
      await setSecret(editingProvider.apiKeyRef, apiKey);
    }

    await loadSettings();
    setEditingProvider(null);
    setApiKey("");
  };

  const handleDeleteProvider = async (id: string) => {
    await removeProviderCredential(id);
    await loadSettings();
  };

  const handleSaveModel = async () => {
    if (!editingModel) return;

    await addOrUpdateModel(editingModel);
    await loadSettings();
    setEditingModel(null);
  };

  const handleDeleteModel = async (id: string) => {
    await removeModel(id);
    await loadSettings();
  };

  const handleSetDefaultModel = async (id: string) => {
    await setDefaultModel(id);
    await loadSettings();
  };

  const handleReset = async () => {
    try {
      setIsResetting(true);
      await ResetManager.resetAllData();

      await loadSettings();

      closeSheet();

      alert("All data has been reset successfully. The app will restart.");

      window.location.reload();
    } catch (error: any) {
      console.error("Reset failed:", error);
      alert(`Reset failed: ${error.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  const startEditProvider = (provider?: ProviderCredential) => {
    const newId = crypto.randomUUID();
    const newProvider = provider || {
      id: newId,
      providerId: providerRegistry[0].id,
      label: "",
      apiKeyRef: { providerId: providerRegistry[0].id, key: "apiKey", credId: newId }
    };
    setEditingProvider(newProvider as ProviderCredential);

    if (provider?.apiKeyRef) {
      const ref = { ...provider.apiKeyRef, credId: provider.id };
      getSecret(ref).then(key => setApiKey(key || ""));
    }
  };

  const startEditModel = (model?: Model) => {
    const newModel = model || {
      id: crypto.randomUUID(),
      name: "",
      displayName: "",
      providerId: providers[0]?.providerId || providerRegistry[0].id,
      providerLabel: providers[0]?.label || providerRegistry[0].name
    };
    setEditingModel(newModel as Model);
  };

  return (
    <>
      <div className="flex h-full flex-col gap-6 pb-16 text-gray-200">
        <section className="flex-1 overflow-y-auto px-4 pt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MenuItem
              icon={<Key className="h-5 w-5" />}
              title="Providers"
              subtitle="Manage API providers and credentials"
              badge={providers.length.toString()}
              onClick={() => openSheet("providers")}
            />
            <MenuItem
              icon={<Cpu className="h-5 w-5" />}
              title="Models"
              subtitle="Add and manage AI models"
              badge={models.length.toString()}
              onClick={() => openSheet("models")}
            />
            <MenuItem
              icon={<Shield className="h-5 w-5" />}
              title="Security"
              subtitle="Privacy and security settings"
              onClick={() => openSheet("security")}
            />
            <MenuItem
              icon={<BookOpen className="h-5 w-5" />}
              title="Setup Guide"
              subtitle="Rerun the welcome and onboarding flow"
              onClick={() => navigate("/welcome")}
            />
            <MenuItem
              icon={<RotateCcw className="h-5 w-5" />}
              title="Reset"
              subtitle="Clear all app data and start fresh"
              onClick={() => openSheet("reset")}
            />
          </div>
        </section>
      </div>

      <BottomSheet
        isOpen={isOpen && activeSheet === "providers"}
        onClose={closeSheet}
        title="Providers"
      >
        <div className="p-6">
          {!editingProvider ? (
            <>
              <button
                onClick={() => startEditProvider()}
                className="group mb-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/20"
              >
                <Plus className="w-5 h-5" />
                <span>Add Provider</span>
              </button>

              <div className="space-y-3">
                {providers.map((provider) => (
                  <div key={provider.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/45 px-5 py-4">
                    <div>
                      <div className="text-base font-semibold text-white">{provider.label}</div>
                      <div className="text-sm text-gray-500">
                        {providerRegistry.find(p => p.id === provider.providerId)?.name}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startEditProvider(provider)}
                        className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-white/20 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProvider(provider.id)}
                        className="rounded-full border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400/70 hover:text-red-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Provider Type</label>
                <select
                  value={editingProvider.providerId}
                  onChange={(e) => setEditingProvider({
                    ...editingProvider,
                    providerId: e.target.value,
                    apiKeyRef: { ...editingProvider.apiKeyRef!, providerId: e.target.value, credId: editingProvider.id }
                  })}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-white/30 focus:outline-none"
                >
                  {providerRegistry.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Label</label>
                <input
                  type="text"
                  value={editingProvider.label}
                  onChange={(e) => setEditingProvider({ ...editingProvider, label: e.target.value })}
                  placeholder="My OpenAI Account"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Base URL (Optional)</label>
                <input
                  type="url"
                  value={editingProvider.baseUrl || ""}
                  onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSaveProvider}
                  className="flex-1 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/70 hover:bg-emerald-400/30"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingProvider(null)}
                  className="flex-1 rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/20 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={isOpen && activeSheet === "models"}
        onClose={closeSheet}
        title="Models"
      >
        <div className="p-6">
          {!editingModel ? (
            <>
              <button
                onClick={() => startEditModel()}
                className="group mb-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/20"
              >
                <Plus className="w-5 h-5" />
                <span>Add Model</span>
              </button>

              <div className="space-y-3">
                {models.map((model) => (
                  <div key={model.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/45 px-5 py-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <div className="text-base font-semibold text-white">{model.displayName}</div>
                        {model.id === defaultModelId && (
                          <Check className="h-4 w-4 text-emerald-300" />
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {model.name} • {model.providerLabel || providerRegistry.find(p => p.id === model.providerId)?.name}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {model.id !== defaultModelId && (
                        <button
                          onClick={() => handleSetDefaultModel(model.id)}
                          className="rounded-full border border-emerald-400/40 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300/70 hover:text-emerald-100"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => startEditModel(model)}
                        className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-white/20 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        className="rounded-full border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400/70 hover:text-red-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Display Name</label>
                <input
                  type="text"
                  value={editingModel.displayName}
                  onChange={(e) => setEditingModel({ ...editingModel, displayName: e.target.value })}
                  placeholder="GPT-4 Turbo"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Model Name</label>
                <input
                  type="text"
                  value={editingModel.name}
                  onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                  placeholder="gpt-4-turbo-preview"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Provider</label>
                <select
                  value={editingModel.providerId}
                  onChange={(e) => {
                    const selectedProvider = providers.find(p => p.providerId === e.target.value);
                    setEditingModel({ 
                      ...editingModel, 
                      providerId: e.target.value,
                      providerLabel: selectedProvider?.label || e.target.value
                    });
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-white/30 focus:outline-none"
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.providerId}>{provider.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSaveModel}
                  className="flex-1 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/70 hover:bg-emerald-400/30"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingModel(null)}
                  className="flex-1 rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/20 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={isOpen && activeSheet === "security"}
        onClose={closeSheet}
        title="Security"
      >
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-1 items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">Pure Mode</h3>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${isPureModeEnabled
                      ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                      : 'border-orange-400/50 bg-orange-400/15 text-orange-200'
                      }`}>
                      {isPureModeEnabled ? 'Protected' : 'Open'}
                    </span>
                  </div>
                  <p className="max-w-md text-sm text-gray-400">
                    Restrict NSFW content in AI responses. When enabled, your characters stay within safe, respectful boundaries.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPureModeEnabled((v) => !v)}
                role="switch"
                aria-checked={isPureModeEnabled}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full px-1 transition-colors duration-200 focus:outline-none ${isPureModeEnabled ? 'bg-emerald-500/70' : 'bg-gray-600'}`}
              >
                <span className="sr-only">Toggle Pure Mode</span>
                <span
                  className={`block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                    isPureModeEnabled ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div
              className={`mt-6 rounded-2xl border px-4 py-3 text-xs font-medium ${
                isPureModeEnabled
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                  : 'border-orange-400/40 bg-orange-400/10 text-orange-200'
              }`}
            >
              {isPureModeEnabled ? 'Content filtering is active' : 'Content filtering is disabled'}
            </div>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={isOpen && activeSheet === "reset"}
        onClose={closeSheet}
        title="Reset App Data"
      >
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-red-500/50 bg-red-500/10 text-red-200">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-white">Reset all data</h3>
            <p className="mt-2 text-sm text-gray-400">
              This permanently deletes providers, models, chat sessions, and stored preferences from this device.
            </p>
          </div>

          {resetSummary && (
            <div className="rounded-3xl border border-white/10 bg-black/35 p-6 text-sm text-gray-300">
              <h4 className="text-base font-semibold text-white">What will be cleared</h4>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span>Providers & models</span>
                  <span>{providers.length + models.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Stored chats</span>
                  <span>≈ {resetSummary.estimatedSessions}</span>
                </div>
                <div>
                  <span className="font-semibold text-white">Preferences snapshot</span>
                  <ul className="mt-1 space-y-1 text-xs text-gray-500">
                    <li className="flex items-center justify-between text-gray-400">
                      <span>Onboarding completed</span>
                      <span className="text-gray-300">
                        {resetSummary.appState.onboarding.completed ? "Yes" : "No"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between text-gray-400">
                      <span>Provider setup</span>
                      <span className="text-gray-300">
                        {resetSummary.appState.onboarding.providerSetupCompleted ? "Done" : "Pending"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between text-gray-400">
                      <span>Model setup</span>
                      <span className="text-gray-300">
                        {resetSummary.appState.onboarding.modelSetupCompleted ? "Done" : "Pending"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between text-gray-400">
                      <span>Theme</span>
                      <span className="text-gray-300">{resetSummary.appState.theme}</span>
                    </li>
                    <li className="flex items-center justify-between text-gray-400">
                      <span>Tooltips seen</span>
                      <span className="text-gray-300">{resetSummary.appState.tooltipCount}</span>
                    </li>
                  </ul>
                </div>
                <div className="flex items-center justify-between">
                  <span>Files stored</span>
                  <span>{resetSummary.fileCount}</span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-5 text-left text-sm text-red-100">
            <h4 className="text-base font-semibold text-red-100">Warning</h4>
            <p className="mt-2 text-sm text-red-100/80">
              This action cannot be undone. The app will restart after the reset completes.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={closeSheet}
              className="flex-1 rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/20 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="flex-1 rounded-full border border-red-500/50 bg-red-500/20 px-6 py-3 text-sm font-semibold text-red-100 transition hover:border-red-500/70 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResetting ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-100 border-t-transparent" />
                  Resetting...
                </div>
              ) : (
                'Reset all data'
              )}
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
