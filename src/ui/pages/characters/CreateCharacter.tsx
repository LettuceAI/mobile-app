import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveCharacter } from "../../../core/storage/repo";

export function CreateCharacterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [persona, setPersona] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canNext = name.trim().length > 0;
  const canSave = persona.trim().length > 0 && canNext;

  const onSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await saveCharacter({ name: name.trim(), avatarPath: avatar.trim() || undefined, persona: persona.trim() });
      navigate("/chat");
    } catch (e: any) {
      setError(e?.message || "Failed to save character");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm"
          >
            Back
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Create Character</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="p-6">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Wizard Mentor"
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Avatar</label>
              <input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="Emoji (🧙) or image URL"
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Tip: Paste an emoji or a URL to an image.</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl text-white shadow-md">
                {avatar ? (
                  isImageLike(avatar) ? (
                    <img src={avatar} alt="avatar" className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <span className="text-2xl">{avatar}</span>
                  )
                ) : (
                  <span className="text-lg">{name.trim().slice(0, 1) || "AI"}</span>
                )}
              </div>
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Preview</div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{name || "Untitled"}</div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                disabled={!canNext}
                onClick={() => setStep(2)}
                className={`px-4 py-2 rounded-lg text-white ${
                  canNext ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt</label>
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="You are a wizard mentor who speaks in mystical riddles..."
                rows={8}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Describe how the AI should act and speak.</p>
            </div>
            {error && <div className="text-sm text-red-500">{error}</div>}
            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100"
              >
                Back
              </button>
              <button
                disabled={!canSave || saving}
                onClick={onSave}
                className={`px-4 py-2 rounded-lg text-white ${
                  canSave && !saving ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function isImageLike(s: string) {
  const lower = s.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}

