import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import {
  setOnboardingCompleted,
  setOnboardingSkipped,
} from "../../../core/storage/appState";
import logoSvg from "../../../assets/logo.svg";
import { typography, radius, spacing, interactive, shadows, cn } from "../../design-tokens";

export function WelcomePage() {
  const navigate = useNavigate();
  const [showSkipWarning, setShowSkipWarning] = useState(false);

  const handleAddProvider = () => {
    navigate("/onboarding/provider");
  };

  const handleConfirmSkip = async () => {
    await setOnboardingCompleted(true);
    await setOnboardingSkipped(true);
    navigate("/chat");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] text-gray-200">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        
        {/* Logo Section - Hero */}
        <motion.div 
          className="flex flex-col items-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="relative mb-8">
            {/* Glow effect */}
            <div className="absolute -inset-6 rounded-full bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-emerald-500/20 blur-2xl animate-pulse" />
            
            {/* Logo container */}
            <div className={cn(
              "relative flex h-24 w-24 items-center justify-center border border-white/20 bg-gradient-to-br from-white/10 to-white/5",
              radius.full,
              shadows.xl
            )}>
              <img src={logoSvg} alt="LettuceAI" className="h-14 w-14" />
            </div>
          </div>
          
          {/* Brand name */}
          <h1 className={cn(
            typography.display.size,
            typography.display.weight,
            "mb-3 bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent"
          )}>
            LettuceAI
          </h1>
          
          {/* Tagline */}
          <p className={cn(
            typography.body.size,
            typography.body.lineHeight,
            "max-w-[280px] text-center text-white/60"
          )}>
            Your personal AI companion. Private, secure, and always on-device.
          </p>
        </motion.div>

        {/* Feature Pills */}
        <motion.div 
          className={cn("mb-8 flex items-center justify-center", spacing.inlineSmall)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {quickFacts.map(({ icon: Icon, label }) => (
            <div 
              key={label} 
              className={cn(
                "flex items-center gap-1.5 border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm",
                radius.full
              )}
            >
              <Icon size={14} className="text-emerald-400" strokeWidth={2.5} />
              <span className={cn(typography.bodySmall.size, typography.label.weight, "text-white/70")}>
                {label}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Beta Warning */}
        <motion.div
          className={cn(
            "mb-8 w-full max-w-sm rounded-xl border border-amber-400/30 bg-amber-400/10 p-4"
          )}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <div>
              <h3 className={cn(typography.bodySmall.size, typography.body.weight, "text-amber-200")}>
                Beta Build
              </h3>
              <p className={cn(typography.caption.size, "mt-1 text-amber-200/70")}>
                This is a beta version. Please report any issues or feedback on our GitHub repository.
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div 
          className={cn("w-full max-w-xs", spacing.field)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <button
            className={cn(
              "group w-full flex items-center justify-center gap-2 px-6 py-4",
              radius.md,
              "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
              typography.body.size,
              typography.h3.weight,
              shadows.glow,
              interactive.transition.default,
              interactive.active.scale,
              "hover:border-emerald-400/60 hover:bg-emerald-400/30"
            )}
            onClick={handleAddProvider}
          >
            <span>Get Started</span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
          </button>

          <button
            className={cn(
              "w-full px-6 py-3",
              radius.md,
              "border border-white/10 bg-white/5 text-white/60",
              typography.body.size,
              interactive.transition.default,
              interactive.active.scale,
              "hover:border-white/20 hover:bg-white/[0.08] hover:text-white/80"
            )}
            onClick={() => setShowSkipWarning(true)}
          >
            Skip for now
          </button>
        </motion.div>

        {/* Bottom hint */}
        <motion.p 
          className={cn(
            "mt-8 text-center",
            typography.caption.size,
            "text-white/40"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          Setup takes less than 2 minutes
        </motion.p>
      </div>

      {showSkipWarning && (
        <SkipWarning
          onClose={() => setShowSkipWarning(false)}
          onConfirm={handleConfirmSkip}
          onAddProvider={handleAddProvider}
        />
      )}
    </div>
  );
}

const quickFacts = [
  { icon: ShieldCheck, label: "On-device only" },
  { icon: Sparkles, label: "Character ready" },
];

function SkipWarning({
  onClose,
  onConfirm,
  onAddProvider,
}: {
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onAddProvider: () => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 200);
  };

  const handleConfirm = () => {
    setIsExiting(true);
    setTimeout(() => void onConfirm(), 200);
  };

  const handleAddProvider = () => {
    setIsExiting(true);
    setTimeout(onAddProvider, 200);
  };

  return (
    <motion.div 
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.2 }}
      onClick={handleClose}
    >
      <motion.div 
        className={cn(
          "w-full max-w-lg border border-white/10 bg-[#0b0b0d] p-6",
          "rounded-t-3xl sm:rounded-3xl sm:mb-8",
          shadows.xl
        )}
        initial={{ y: "100%", opacity: 0 }}
        animate={{ 
          y: isExiting ? "100%" : 0, 
          opacity: isExiting ? 0 : 1 
        }}
        transition={{ 
          type: "spring",
          damping: 30,
          stiffness: 350,
          duration: 0.2
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className={cn(typography.h2.size, typography.h2.weight, "text-white")}>
            Skip setup?
          </h3>
        </div>

        {/* Warning content */}
        <div className={cn(
          "flex items-start gap-3 border border-amber-400/20 bg-amber-400/5 p-4 mb-6",
          radius.md
        )}>
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center bg-amber-400/20 text-amber-300",
            radius.md
          )}>
            <AlertTriangle size={20} strokeWidth={2.5} />
          </div>
          <div className={spacing.tight}>
            <h4 className={cn(
              typography.body.size,
              typography.h3.weight,
              "text-white"
            )}>
              Provider needed to chat
            </h4>
            <p className={cn(
              typography.bodySmall.size,
              typography.bodySmall.lineHeight,
              "text-white/60"
            )}>
              Without a provider, you won't be able to send messages. You can add one later from settings.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className={cn("flex flex-col", spacing.field)}>
          <button
            className={cn(
              "inline-flex items-center justify-center gap-2 px-6 py-3",
              radius.md,
              "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
              typography.body.size,
              typography.h3.weight,
              interactive.transition.fast,
              interactive.active.scale,
              "hover:border-emerald-400/60 hover:bg-emerald-400/30"
            )}
            onClick={handleAddProvider}
          >
            <span>Add Provider</span>
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
          <button
            className={cn(
              "px-6 py-3",
              radius.md,
              "border border-white/10 bg-white/5 text-white/60",
              typography.body.size,
              interactive.transition.fast,
              interactive.active.scale,
              "hover:border-white/20 hover:bg-white/10 hover:text-white"
            )}
            onClick={handleConfirm}
          >
            Skip anyway
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
