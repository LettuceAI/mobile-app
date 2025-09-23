import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { WelcomePage, ProviderSetupPage, ModelSetupPage } from "./ui/pages/onboarding";
import { SettingsPage } from "./ui/pages/settings/Settings";
import { ChatPage, ChatConversationPage, ChatSettingsPage } from "./ui/pages/chats";
import { ThemeProvider } from "./core/theme/ThemeContext";
import { CreateCharacterPage } from "./ui/pages/characters";
import { CreatePersonaPage } from "./ui/pages/personas";

import { CreateMenu, Tooltip, useFirstTimeTooltip } from "./ui/components";
import { isOnboardingCompleted } from "./core/storage/appState";
import { TopNav, TabBar } from "./ui/components/App";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#050505] text-gray-100 antialiased">
          <AppContent />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

function AppContent() {
  const location = useLocation();
  const isChatRoute = location.pathname === "/chat" || location.pathname === "/";
  const isChatDetailRoute = location.pathname.startsWith("/chat/");
  const isOnboardingRoute = useMemo(
    () =>
      location.pathname.startsWith("/welcome") ||
      location.pathname.startsWith("/onboarding"),
    [location.pathname]
  );
  const showGlobalChrome = !isOnboardingRoute && !isChatDetailRoute;

  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const { isVisible: showCreateTooltip, dismissTooltip: dismissCreateTooltip } = useFirstTimeTooltip("create_button");
  const [showDelayedTooltip, setShowDelayedTooltip] = useState(false);

  useEffect(() => {
    if (isOnboardingRoute) {
      setShowCreateMenu(false);
    }
  }, [isOnboardingRoute]);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const firstTime = urlParams.get("firstTime");

    if (firstTime === "true" && isChatRoute) {
      window.history.replaceState({}, document.title, location.pathname);

      const timer = window.setTimeout(() => {
        setShowDelayedTooltip(true);
      }, 2000);

      return () => window.clearTimeout(timer);
    }

    return () => setShowDelayedTooltip(false);
  }, [location, isChatRoute]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <BackgroundAura />

      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full ${
          isChatDetailRoute ? "max-w-full" : "max-w-md"
        } flex-col ${showGlobalChrome ? "pb-[calc(72px+env(safe-area-inset-bottom))]" : "pb-0"}`}
      >
        {showGlobalChrome && (
          <TopNav
            currentPath={location.pathname}
            onCreateClick={() => setShowCreateMenu(true)}
          />
        )}

        <main
          className={`flex-1 ${
            isOnboardingRoute
              ? "overflow-y-auto px-4 pt-6 pb-6"
              : isChatDetailRoute
                ? "overflow-hidden px-0 pt-0 pb-0"
                : "overflow-y-auto px-4 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))]"
          }`}
        >
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-full"
          >
            <Routes>
              <Route path="/" element={<OnboardingCheck />} />
              <Route path="/welcome" element={<WelcomePage />} />
              <Route path="/onboarding/provider" element={<ProviderSetupPage />} />
              <Route path="/onboarding/models" element={<ModelSetupPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:characterId" element={<ChatConversationPage />} />
              <Route path="/chat/:characterId/settings" element={<ChatSettingsPage />} />
              <Route path="/create/character" element={<CreateCharacterPage />} />
              <Route path="/create/persona" element={<CreatePersonaPage />} />
            </Routes>
          </motion.div>
        </main>

        {showGlobalChrome && (
          <TabBar onCreateClick={() => setShowCreateMenu(true)} />
        )}
      </div>

      {showGlobalChrome && (
        <CreateMenu isOpen={showCreateMenu} onClose={() => setShowCreateMenu(false)} />
      )}

      {isChatRoute && showGlobalChrome && (showDelayedTooltip || showCreateTooltip) && (
        <Tooltip
          isVisible={true}
          message="Create custom AI characters and personas here!"
          onClose={() => {
            dismissCreateTooltip();
            setShowDelayedTooltip(false);
          }}
          position="bottom"
          className="bottom-[88px] right-4"
        />
      )}
    </div>
  );
}

function BackgroundAura() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute left-[-20%] top-[-30%] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[#1b1b1b] via-[#101012] to-transparent opacity-80 blur-3xl" />
      <div className="absolute right-[-25%] top-[20%] h-[520px] w-[520px] rounded-full bg-gradient-to-tr from-[#111827] via-[#0b0c0f] to-transparent opacity-70 blur-[120px]" />
      <div className="absolute inset-x-1/4 bottom-[-35%] h-[360px] rounded-[50%] bg-gradient-to-t from-[#0c0c0c] via-[#0f0f13] to-transparent opacity-90 blur-[140px]" />
    </div>
  );
}

function OnboardingCheck() {
  const [isChecking, setIsChecking] = useState(true);
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkOnboarding = async () => {
      const onboardingCompleted = await isOnboardingCompleted();
      if (cancelled) return;
      if (!onboardingCompleted) {
        setShouldShowOnboarding(true);
      }
      setIsChecking(false);
    };

    checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isChecking) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-white/5 bg-white/5 backdrop-blur-sm">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-white/60" />
      </div>
    );
  }

  if (shouldShowOnboarding) {
    return <Navigate to="/welcome" replace />;
  }

  return <ChatPage />;
}

export default App;
