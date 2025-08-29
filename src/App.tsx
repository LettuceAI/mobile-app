import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

import { WelcomePage, ProviderSetupPage, ModelSetupPage } from "./ui/pages/onboarding";
import { SettingsPage } from "./ui/pages/settings/Settings";
import { ChatPage } from "./ui/pages/chats/Chat";
import { ThemeProvider } from "./core/theme/ThemeContext";

import { CreateMenu, Tooltip, useFirstTimeTooltip } from "./ui/components";
import { localStorage_ } from "./core/storage/localstorage";
import { TabBar } from "./ui/components/App";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-colors">
          <AppContent />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

function AppContent() {
  const location = useLocation();
  const isChat = location.pathname === "/chat" || location.pathname === "/";
  const isOnboarding = location.pathname.startsWith("/welcome") || location.pathname.startsWith("/onboarding");
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const { isVisible: showCreateTooltip, dismissTooltip: dismissCreateTooltip } = useFirstTimeTooltip("create_button");
  const [showDelayedTooltip, setShowDelayedTooltip] = useState(false);

  useEffect(() => {
    if (isOnboarding) {
      setShowCreateMenu(false);
    }
  }, [isOnboarding]);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const firstTime = urlParams.get("firstTime");

    if (firstTime === "true" && isChat) {
      window.history.replaceState({}, document.title, location.pathname);

      setTimeout(() => {
        setShowDelayedTooltip(true);
      }, 2000);
    }
  }, [location, isChat]);

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white dark:bg-slate-900 shadow-xl relative transition-colors">
      {/*!isChat && !isOnboarding && (
        <motion.header
          className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 shadow-lg"
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 100 }}
        >
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">LettuceAI</h1>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          </div>
          <p className="text-indigo-100 text-sm mt-1">AI Roleplay Assistant</p>
        </motion.header>
      )*/}

      <main className="flex-1 overflow-hidden">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          <Routes>
            <Route path="/" element={<OnboardingCheck />} />
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/onboarding/provider" element={<ProviderSetupPage />} />
            <Route path="/onboarding/models" element={<ModelSetupPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/chat" element={<ChatPage />} />
          </Routes>
        </motion.div>
      </main>

      {!isOnboarding && <TabBar onCreateClick={() => setShowCreateMenu(true)} />}

      {!isOnboarding && <CreateMenu isOpen={showCreateMenu} onClose={() => setShowCreateMenu(false)} />}

      {isChat && !isOnboarding && (showDelayedTooltip || showCreateTooltip) && (
        <Tooltip
          isVisible={true}
          message="Create custom AI characters and personas here!"
          onClose={() => {
            dismissCreateTooltip();
            setShowDelayedTooltip(false);
          }}
          position="top"
          className="bottom-20"
        />
      )}
    </div>
  );
}

function OnboardingCheck() {
  const [isChecking, setIsChecking] = useState(true);
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);

  useEffect(() => {
    const checkOnboarding = () => {
      const onboardingCompleted = localStorage_.isOnboardingCompleted();
      if (!onboardingCompleted) {
        setShouldShowOnboarding(true);
      }
      setIsChecking(false);
    };

    checkOnboarding();
  }, []);

  if (isChecking) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 transition-colors">
        <div className="w-8 h-8 border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (shouldShowOnboarding) {
    return <WelcomePage />;
  }

  return <ChatPage />;
}

export default App;
