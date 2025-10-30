import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { Globe, User, Cpu, Lock, RotateCcw } from "lucide-react";
import { cn } from "../../design-tokens";
import { 
  createPromptTemplate, 
  updatePromptTemplate, 
  getPromptTemplate,
  getAppDefaultTemplateId,
  resetAppDefaultTemplate 
} from "../../../core/prompts";
import { listCharacters, readSettings } from "../../../core/storage";
import type { PromptScope, Character, Model } from "../../../core/storage/schemas";

export function EditPromptTemplate() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [name, setName] = useState("");
  const [scope, setScope] = useState<PromptScope>("appWide");
  const [content, setContent] = useState("");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  
  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [isAppDefault, setIsAppDefault] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const chars = await listCharacters();
      setCharacters(chars);
      const settings = await readSettings();
      setModels(settings.models);

      if (isEditing && id) {
        const [template, appDefaultId] = await Promise.all([
          getPromptTemplate(id),
          getAppDefaultTemplateId(),
        ]);
        
        if (template) {
          setName(template.name);
          setScope(template.scope);
          setContent(template.content);
          setTargetIds(template.targetIds);
          setIsAppDefault(template.id === appDefaultId);
        }
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!name.trim() || !content.trim()) {
      return;
    }

    if ((scope === "modelSpecific" || scope === "characterSpecific") && targetIds.length === 0) {
      alert(`Please select at least one ${scope === "modelSpecific" ? "model" : "character"}`);
      return;
    }

    setSaving(true);
    try {
      if (isEditing && id) {
        await updatePromptTemplate(id, {
          name: name.trim(),
          scope: isAppDefault ? undefined : scope,
          content: content.trim(),
          targetIds: scope === "appWide" ? [] : targetIds,
        });
      } else {
        await createPromptTemplate(
          name.trim(),
          scope,
          scope === "appWide" ? [] : targetIds,
          content.trim()
        );
      }
      navigate("/settings/prompts");
    } catch (error) {
      console.error("Failed to save template:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset to the original default prompt template? This cannot be undone.")) {
      return;
    }

    setResetting(true);
    try {
      const updated = await resetAppDefaultTemplate();
      setContent(updated.content);
      alert("Reset to default successfully!");
    } catch (error) {
      console.error("Failed to reset template:", error);
      alert("Failed to reset template");
    } finally {
      setResetting(false);
    }
  }

  function getScopeIcon(s: PromptScope) {
    switch (s) {
      case "appWide":
        return <Globe className="h-4 w-4" />;
      case "modelSpecific":
        return <Cpu className="h-4 w-4" />;
      case "characterSpecific":
        return <User className="h-4 w-4" />;
    }
  }

  function getScopeColor(s: PromptScope) {
    switch (s) {
      case "appWide":
        return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
      case "modelSpecific":
        return "border-purple-400/30 bg-purple-400/10 text-purple-300";
      case "characterSpecific":
        return "border-blue-400/30 bg-blue-400/10 text-blue-300";
    }
  }

  const targetList = scope === "modelSpecific" ? models : characters;
  const targetLabel = scope === "modelSpecific" ? "model" : "character";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505]">
        <div className="text-sm text-white/50">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050505]">
      <main className="flex-1 px-4 pb-24 pt-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-2xl space-y-4"
        >
          {/* Form */}
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                Template Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Friendly Assistant"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>

            {/* Scope */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Scope
                </label>
                {isAppDefault && (
                  <div className="flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200">
                    <Lock className="h-3 w-3" />
                    <span>Protected</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(["appWide", "modelSpecific", "characterSpecific"] as PromptScope[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      if (!isAppDefault) {
                        setScope(s);
                        setTargetIds([]);
                      }
                    }}
                    disabled={isAppDefault}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border p-4 transition",
                      scope === s
                        ? getScopeColor(s)
                        : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10",
                      isAppDefault && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {getScopeIcon(s)}
                    <span className="text-xs font-medium">
                      {s === "appWide" ? "App-wide" : s === "modelSpecific" ? "Model" : "Character"}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/40">
                {scope === "appWide" && "Available everywhere as a default option"}
                {scope === "modelSpecific" && "Available only for selected models"}
                {scope === "characterSpecific" && "Available only for selected characters"}
              </p>
            </div>

            {/* Target Selection */}
            {scope !== "appWide" && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Select {targetLabel}s ({targetIds.length} selected)
                </label>
                {targetList.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/50">
                    No {targetLabel}s available
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap gap-2">
                      {targetList.map((target) => {
                        const selected = targetIds.includes(target.id);
                        return (
                          <button
                            key={target.id}
                            onClick={() => {
                              setTargetIds(
                                selected
                                  ? targetIds.filter((tid) => tid !== target.id)
                                  : [...targetIds, target.id]
                              );
                            }}
                            className={cn(
                              "rounded-lg border px-3 py-2 text-sm transition",
                              selected
                                ? "border-white/30 bg-white/20 text-white"
                                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                            )}
                          >
                            {target.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Prompt Content
                </label>
                {isAppDefault && (
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-200 transition hover:bg-blue-400/20 active:scale-95 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {resetting ? "Resetting..." : "Reset to Default"}
                  </button>
                )}
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="You are a helpful AI assistant..."
                rows={12}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
              <p className="text-xs text-white/40">{content.length} characters</p>
            </div>

            {/* Template Variables Info */}
            <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-blue-200">
                Available Variables
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-blue-200/70">
                <div><code className="text-emerald-300">{"{{char.name}}"}</code> - Character name</div>
                <div><code className="text-emerald-300">{"{{char.desc}}"}</code> - Description</div>
                <div><code className="text-emerald-300">{"{{scene}}"}</code> - Starting scene</div>
                <div><code className="text-emerald-300">{"{{persona.name}}"}</code> - Persona name</div>
                <div><code className="text-emerald-300">{"{{persona.desc}}"}</code> - Persona desc</div>
                <div><code className="text-emerald-300">{"{{rules}}"}</code> - Character rules</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !content.trim()}
                className={cn(
                  "flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition",
                  saving || !name.trim() || !content.trim()
                    ? "border border-white/10 bg-white/5 text-white/30"
                    : "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30 active:scale-[0.99]"
                )}
              >
                {saving ? "Saving..." : isEditing ? "Update Template" : "Create Template"}
              </button>
              <button
                onClick={() => navigate("/settings/prompts")}
                disabled={saving}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10 active:scale-[0.99] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
