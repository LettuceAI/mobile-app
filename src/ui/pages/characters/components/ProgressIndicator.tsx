import { motion } from "framer-motion";
import { typography, radius, cn } from "../../../design-tokens";

interface ProgressIndicatorProps {
  progress: number;
  currentStep: number;
  stepLabel: string;
}

export function ProgressIndicator({ progress, currentStep, stepLabel }: ProgressIndicatorProps) {
  return (
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
        <span
          className={cn(
            typography.overline.size,
            typography.overline.weight,
            typography.overline.tracking,
            "uppercase text-white/40"
          )}
        >
          Step {currentStep} of 2
        </span>
        <span className={cn(typography.caption.size, typography.caption.weight, "text-white/50")}>
          {stepLabel}
        </span>
      </div>
    </div>
  );
}
