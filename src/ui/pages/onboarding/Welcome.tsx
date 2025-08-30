import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, ArrowRight, AlertTriangle, X } from "lucide-react";
import { localStorage_ } from "../../../core/storage/localstorage";
import logoSvg from "../../../assets/logo.svg";

export function WelcomePage() {
  const navigate = useNavigate();
  const [showSkipWarning, setShowSkipWarning] = useState(false);

  const handleAddProvider = () => {
    navigate("/onboarding/provider");
  };

  const handleSkipWarning = () => {
    setShowSkipWarning(true);
  };

  const handleConfirmSkip = () => {
    localStorage_.setOnboardingCompleted(true);
    localStorage_.setOnboardingSkipped(true);
    navigate("/chat");
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors">
      {/* Content */}
      <div className="flex-1 flex flex-col justify-center px-8 -mt-12">
        <div className="text-center space-y-10 max-w-md mx-auto">
          {/* Logo and Title */}
          <div className="space-y-8">
            <div className="w-28 h-28 mx-auto">
              <img 
                src={logoSvg} 
                alt="LettuceAI Logo" 
                className="w-full h-full object-contain"
              />
            </div>
            
            <div className="space-y-4">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                Welcome to LettuceAI
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-400 font-light">
                Your privacy-first AI companion
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-lg">
              Start chatting with AI characters by configuring your preferred provider.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Your credentials are stored securely on your device.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4 pt-6">
            {/* Primary Button - Get Started */}
            <button
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white p-6 rounded-3xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 flex items-center justify-center space-x-4"
              onClick={handleAddProvider}
            >
              <div className="w-7 h-7 bg-white/20 rounded-xl flex items-center justify-center">
                <Settings size={20} className="text-white" />
              </div>
              <span>Get Started</span>
              <ArrowRight size={22} />
            </button>

            {/* Secondary Button - Skip */}
            <button
              className="w-full text-gray-600 dark:text-gray-400 p-5 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 rounded-3xl transition-all duration-300 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-lg"
              onClick={handleSkipWarning}
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>

      {/* Skip Warning Modal */}
      {showSkipWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end z-50">
          <div className="w-full bg-white dark:bg-gray-900 rounded-t-3xl p-8 space-y-6 border-t border-gray-200 dark:border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Skip Setup?</h3>
              <button
                onClick={() => setShowSkipWarning(false)}
                className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                <X size={22} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={28} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 text-lg">
                  Provider Setup Recommended
                </h4>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  Without a provider, you won't be able to chat with AI characters. 
                  You can add one later in Settings.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white p-5 rounded-3xl font-semibold text-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                onClick={handleAddProvider}
              >
                Add Provider Now
              </button>
              
              <button
                className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 p-5 rounded-3xl font-semibold text-lg transition-all duration-300"
                onClick={handleConfirmSkip}
              >
                Skip Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
