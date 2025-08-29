import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  BookOpen,
  Palette
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
import { ThemeToggle } from "../../components/ThemeToggle";
import type { ProviderCredential, Model } from "../../../core/storage/schemas";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl z-50 max-h-[85vh] overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(85vh-80px)]">
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
      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <div className="flex items-center space-x-4">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
          {icon}
        </div>
        <div className="text-left">
          <div className="font-medium text-gray-900 dark:text-white">{title}</div>
          {subtitle && <div className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {badge && (
          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full">
            {badge}
          </span>
        )}
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>
    </button>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<"providers" | "models" | "security" | "reset" | "appearance" | null>(null);
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<ProviderCredential | null>(null);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetSummary, setResetSummary] = useState<{
    localStorageItems: Record<string, string | null>;
    fileCount: number;
    estimatedSessions: number;
  } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await readSettings();
    setProviders(settings.providerCredentials);
    setModels(settings.models);
    setDefaultModelId(settings.defaultModelId);
  };

  const openSheet = async (sheet: "providers" | "models" | "security" | "reset" | "appearance") => {
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
      providerId: providers[0]?.providerId || providerRegistry[0].id
    };
    setEditingModel(newModel as Model);
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="p-6 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <MenuItem
              icon={<Key className="w-5 h-5" />}
              title="Providers"
              subtitle="Manage API providers and credentials"
              badge={providers.length.toString()}
              onClick={() => openSheet("providers")}
            />
            <MenuItem
              icon={<Cpu className="w-5 h-5" />}
              title="Models"
              subtitle="Add and manage AI models"
              badge={models.length.toString()}
              onClick={() => openSheet("models")}
            />
            <MenuItem
              icon={<Palette className="w-5 h-5" />}
              title="Appearance"
              subtitle="Theme and display settings"
              onClick={() => openSheet("appearance")}
            />
            <MenuItem
              icon={<Shield className="w-5 h-5" />}
              title="Security"
              subtitle="Privacy and security settings"
              onClick={() => openSheet("security")}
            />
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <MenuItem
              icon={<BookOpen className="w-5 h-5" />}
              title="Setup Guide"
              subtitle="Rerun the welcome and setup process"
              onClick={() => navigate("/welcome")}
            />
            <MenuItem
              icon={<RotateCcw className="w-5 h-5" />}
              title="Reset"
              subtitle="Clear all app data and start fresh"
              onClick={() => openSheet("reset")}
            />
          </div>
        </div>
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
                className="w-full flex items-center justify-center space-x-2 p-4 bg-blue-600 text-white rounded-xl mb-4 hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Provider</span>
              </button>
              
              <div className="space-y-3">
                {providers.map((provider) => (
                  <div key={provider.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{provider.label}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {providerRegistry.find(p => p.id === provider.providerId)?.name}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startEditProvider(provider)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProvider(provider.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Provider Type</label>
                <select
                  value={editingProvider.providerId}
                  onChange={(e) => setEditingProvider({ 
                    ...editingProvider, 
                    providerId: e.target.value,
                    apiKeyRef: { ...editingProvider.apiKeyRef!, providerId: e.target.value, credId: editingProvider.id }
                  })}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {providerRegistry.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Label</label>
                <input
                  type="text"
                  value={editingProvider.label}
                  onChange={(e) => setEditingProvider({ ...editingProvider, label: e.target.value })}
                  placeholder="My OpenAI Account"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Base URL (Optional)</label>
                <input
                  type="url"
                  value={editingProvider.baseUrl || ""}
                  onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSaveProvider}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingProvider(null)}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={isOpen && activeSheet === "appearance"}
        onClose={closeSheet}
        title="Appearance"
      >
        <div className="p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Theme</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Choose your preferred theme</p>
              </div>
              <ThemeToggle size="lg" variant="button" />
            </div>
            
            <div className="text-center py-8">
              <Palette className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">More Customization Coming Soon</h3>
              <p className="text-gray-500 dark:text-gray-400">Additional appearance options will be available in future updates.</p>
            </div>
          </div>
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
                className="w-full flex items-center justify-center space-x-2 p-4 bg-blue-600 text-white rounded-xl mb-4 hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Model</span>
              </button>
              
              <div className="space-y-3">
                {models.map((model) => (
                  <div key={model.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div>
                      <div className="flex items-center space-x-2">
                        <div className="font-medium text-gray-900 dark:text-white">{model.displayName}</div>
                        {model.id === defaultModelId && (
                          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {model.name} • {providerRegistry.find(p => p.id === model.providerId)?.name}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {model.id !== defaultModelId && (
                        <button
                          onClick={() => handleSetDefaultModel(model.id)}
                          className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors text-sm"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => startEditModel(model)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Display Name</label>
                <input
                  type="text"
                  value={editingModel.displayName}
                  onChange={(e) => setEditingModel({ ...editingModel, displayName: e.target.value })}
                  placeholder="GPT-4 Turbo"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Model Name</label>
                <input
                  type="text"
                  value={editingModel.name}
                  onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                  placeholder="gpt-4-turbo-preview"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Provider</label>
                <select
                  value={editingModel.providerId}
                  onChange={(e) => setEditingModel({ ...editingModel, providerId: e.target.value })}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.providerId}>{provider.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSaveModel}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingModel(null)}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
        <div className="p-6">
          <div className="text-center py-12">
            <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Security Settings</h3>
            <p className="text-gray-500 dark:text-gray-400">Security features will be available soon.</p>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={isOpen && activeSheet === "reset"}
        onClose={closeSheet}
        title="Reset App Data"
      >
        <div className="p-6">
          <div className="text-center mb-6">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Reset All Data</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              This will permanently delete all your app data including providers, models, chat sessions, and settings.
            </p>
          </div>

          {resetSummary && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-6">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">What will be deleted:</h4>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Providers & Models:</span>
                  <span>{providers.length + models.length} items</span>
                </div>
                <div className="flex justify-between">
                  <span>Chat Sessions:</span>
                  <span>{resetSummary.estimatedSessions} sessions</span>
                </div>
                <div className="flex justify-between">
                  <span>App Settings:</span>
                  <span>{Object.keys(resetSummary.localStorageItems).length} items</span>
                </div>
                <div className="flex justify-between">
                  <span>Data Files:</span>
                  <span>{resetSummary.fileCount + resetSummary.estimatedSessions} files</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-red-900 dark:text-red-300">Warning</h4>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  This action cannot be undone. All your data will be permanently deleted and the app will restart.
                </p>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={closeSheet}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="flex-1 bg-red-600 text-white py-3 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResetting ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Resetting...</span>
                </div>
              ) : (
                "Reset All Data"
              )}
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
