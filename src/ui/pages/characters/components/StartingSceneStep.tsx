import { motion } from "framer-motion";

interface StartingSceneStepProps {
  startingScene: string;
  onStartingSceneChange: (scene: string) => void;
  onContinue: () => void;
  canContinue: boolean;
}

export function StartingSceneStep({
  startingScene,
  onStartingSceneChange,
  onContinue,
  canContinue,
}: StartingSceneStepProps) {
  return (
    <motion.div
      key="starting-scene"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Starting Scene</h2>
        <p className="text-sm text-gray-400">
          Set the opening scenario for conversations with this character. This will establish the roleplay context and setting.
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-[11px] font-medium text-white/70">
          STARTING SCENE *
        </label>
        <textarea
          value={startingScene}
          onChange={(e) => onStartingSceneChange(e.target.value)}
          placeholder="Describe the setting, scenario, and context for conversations with this character. For example: 'You are both students at a magical academy...' or 'It's a quiet evening in a cozy café...'"
          className="min-h-[120px] w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
          rows={6}
        />
        <p className="text-xs text-white/60">
          This scene will be used to start every new conversation with this character.
        </p>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className={`
            rounded-full px-6 py-2 text-sm font-medium transition-all duration-150
            ${
              canContinue
                ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:border-emerald-400/60 hover:bg-emerald-400/30"
                : "border border-white/10 bg-white/5 text-white/40"
            }
          `}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}