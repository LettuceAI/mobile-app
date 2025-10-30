import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Globe, Cpu, User } from "lucide-react";
import { cn } from "../design-tokens";
import { createPromptTemplate, updatePromptTemplate } from "../../core/prompts";
import { listCharacters, readSettings } from "../../core/storage";
import type { SystemPromptTemplate, PromptScope, Character, Model } from "../../core/storage/schemas";

interface PromptTemplateEditorProps {
  template?: SystemPromptTemplate;
  onClose: () => void;
  onSave: () => void;
}

export function PromptTemplateEditor({ template, onClose, onSave }: PromptTemplateEditorProps) {
  const isEditing = !!template;
  
  const [name, setName] = useState(template?.name || "");
  const [scope, setScope] = useState<PromptScope>(template?.scope || "appWide");
  const [content, setContent] = useState(template?.content || "");
  const [targetIds, setTargetIds] = useState<string[]>(template?.targetIds || []);
  
  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const chars = await listCharacters();
      setCharacters(chars);
      
      const settings = await readSettings();
      setModels(settings.models);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!name.trim() || !content.trim()) {
      alert("Name and content are required");
      return;
    }

    if ((scope === "modelSpecific" || scope === "characterSpecific") && targetIds.length === 0) {
      alert(`Please select at least one ${scope === "modelSpecific" ? "model" : "character"}`);
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updatePromptTemplate(template.id, {
          name: name.trim(),
          scope,
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
      
      onSave();
      onClose();
    } catch (error) {
      console.error("Failed to save template:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  function handleScopeChange(newScope: PromptScope) {
    setScope(newScope);
    setTargetIds([]);
  }

  function toggleTargetId(id: string) {
    setTargetIds(prev => 
      prev.includes(id) 
        ? prev.filter(tid => tid !== id)
        : [...prev, id]
    );
  }

  const showTargetSelection = scope === "modelSpecific" || scope === "characterSpecific";
  const targetList = scope === "modelSpecific" ? models : characters;
  const targetLabel = scope === "modelSpecific" ? "Models" : "Characters";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl rounded-2xl border border-white/20 bg-[#0b0b0d] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? "Edit Prompt Template" : "Create Prompt Template"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* Name Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              TEMPLATE NAME
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Friendly Assistant"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
            />
          </div>

          {/* Scope Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              SCOPE
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleScopeChange("appWide")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm transition",
                  scope === "appWide"
                    ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-100"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                )}
              >
                <Globe className="h-4 w-4" />
                App-wide
              </button>
              <button
                onClick={() => handleScopeChange("modelSpecific")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm transition",
                  scope === "modelSpecific"
                    ? "border-purple-400/40 bg-purple-400/20 text-purple-100"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                )}
              >
                <Cpu className="h-4 w-4" />
                Model
              </button>
              <button
                onClick={() => handleScopeChange("characterSpecific")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm transition",
                  scope === "characterSpecific"
                    ? "border-blue-400/40 bg-blue-400/20 text-blue-100"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                )}
              >
                <User className="h-4 w-4" />
                Character
              </button>
            </div>
          </div>

          {/* Target Selection */}
          {showTargetSelection && (
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-white/70">
                SELECT {targetLabel.toUpperCase()}
              </label>
              {loading ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/50">
                  Loading {targetLabel.toLowerCase()}...
                </div>
              ) : targetList.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/50">
                  No {targetLabel.toLowerCase()} available
                </div>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
                  {targetList.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleTargetId(item.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                        targetIds.includes(item.id)
                          ? "border-white/30 bg-white/20 text-white"
                          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      )}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-white/50">
                Selected: {targetIds.length} {targetLabel.toLowerCase()}
              </p>
            </div>
          )}

          {/* Content Textarea */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              PROMPT CONTENT
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your custom system prompt..."
              rows={12}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/40">
              {content.length} characters
            </p>
          </div>

          {/* Template Variables Info */}
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3">
            <div className="text-xs font-medium text-blue-200">Available Variables:</div>
            <div className="mt-2 space-y-1 text-xs text-blue-200/70">
              <div><code className="text-emerald-300">{"{{char.name}}"}</code> - Character name</div>
              <div><code className="text-emerald-300">{"{{char.desc}}"}</code> - Character description</div>
              <div><code className="text-emerald-300">{"{{scene}}"}</code> - Starting scene</div>
              <div><code className="text-emerald-300">{"{{persona.name}}"}</code> - Persona name</div>
              <div><code className="text-emerald-300">{"{{persona.desc}}"}</code> - Persona description</div>
              <div><code className="text-emerald-300">{"{{rules}}"}</code> - Character rules</div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 border-t border-white/10 px-6 py-4">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !content.trim()}
            className={cn(
              "flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
              saving || !name.trim() || !content.trim()
                ? "border-white/10 bg-white/5 text-white/30"
                : "border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30 active:scale-[0.99]"
            )}
          >
            {saving ? "Saving..." : isEditing ? "Update Template" : "Create Template"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 active:scale-[0.99] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

