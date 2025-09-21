import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Settings, ShieldCheck, Sparkles, X } from "lucide-react";

import { localStorage_ } from "../../../core/storage/localstorage";
import logoSvg from "../../../assets/logo.svg";

export function WelcomePage() {
  const navigate = useNavigate();
  const [showSkipWarning, setShowSkipWarning] = useState(false);

  const handleAddProvider = () => {
    navigate("/onboarding/provider");
  };

  const handleConfirmSkip = () => {
    localStorage_.setOnboardingCompleted(true);
    localStorage_.setOnboardingSkipped(true);
    navigate("/chat");
  };

  return (
    <div className="flex min-h-screen flex-col text-gray-200">
      <div className="flex flex-1 flex-col items-center justify-center space-y-8">
        {/* Logo and branding */}
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-purple-500/20 to-emerald-400/20 blur-xl"></div>
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl">
              <img src={logoSvg} alt="LettuceAI" className="h-12 w-12" />
            </div>
          </div>
          
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white">LettuceAI</h1>
            <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
              Your personal AI assistant that keeps everything private and on-device
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="flex items-center justify-center gap-3">
          {quickFacts.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
              <Icon size={16} className="text-emerald-400" />
              <span className="text-xs font-medium text-gray-300">{label}</span>
            </div>
          ))}
        </div>

        {/* Call to action */}
        <div className="w-full max-w-xs space-y-3">
          <button
            className="group w-full flex items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-6 py-4 font-semibold text-white transition-all hover:border-white/30 hover:bg-white/15 hover:scale-[1.02]"
            onClick={handleAddProvider}
          >
            <Settings size={18} />
            <span>Get started</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </button>

          <button
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-gray-400 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
            onClick={() => setShowSkipWarning(true)}
          >
            Skip for now
          </button>
        </div>

        {/* Bottom hint */}
        <p className="text-xs text-gray-500 text-center max-w-sm">
          Quick setup takes less than 2 minutes
        </p>
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
  onConfirm: () => void;
  onAddProvider: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0d] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-white">Skip setup?</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex items-start gap-4 rounded-2xl border border-white/5 bg-black/40 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
            <AlertTriangle size={26} />
          </div>
          <div className="space-y-2 text-sm text-gray-300">
            <h4 className="text-base font-semibold text-white">Provider setup recommended</h4>
            <p>
              Without connecting a provider you won't be able to send messages yet. You can add one anytime from settings.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/20"
            onClick={onAddProvider}
          >
            Go to provider setup
            <ArrowRight size={16} />
          </button>
          <button
            className="flex-1 rounded-full border border-emerald-400/30 bg-emerald-400/20 px-6 py-3 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/60 hover:bg-emerald-400/30"
            onClick={onConfirm}
          >
            Skip anyway
          </button>
        </div>
      </div>
    </div>
  );
}
