import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { WelcomePage, ProviderSetupPage, ModelSetupPage } from "./ui/pages/onboarding";
import { SettingsPage } from "./ui/pages/settings/Settings";
import { ProvidersPage } from "./ui/pages/settings/ProvidersPage";
import { ModelsPage } from "./ui/pages/settings/ModelsPage";
import { SecurityPage } from "./ui/pages/settings/SecurityPage";
import { ResetPage } from "./ui/pages/settings/ResetPage";
import { CharactersPage } from "./ui/pages/settings/CharactersPage";
import { ChatPage, ChatConversationPage, ChatSettingsPage, ChatHistoryPage } from "./ui/pages/chats";
import { ThemeProvider } from "./core/theme/ThemeContext";
import { CreateCharacterPage, EditCharacterPage } from "./ui/pages/characters";
import { CreatePersonaPage, PersonasPage, EditPersonaPage } from "./ui/pages/personas";

import { CreateMenu, Tooltip, useFirstTimeTooltip } from "./ui/components";
import { isOnboardingCompleted } from "./core/storage/appState";
import { TopNav, BottomNav } from "./ui/components/App";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

function App() {
  // Global listeners that should persist across all routes
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      try {
        unlisten = await listen("chat://debug", (event) => {
          // Tauri backend emits: { state, payload } or { state, message }
          if (
            typeof event.payload === "object" &&
            event.payload !== null &&
            "state" in event.payload
          ) {
            const { state, payload, message } = event.payload as {
              state: string;
              payload?: unknown;
              message?: string;
            };
            if (message !== undefined) {
              // log_backend
              console.log(`[backend-${state}]`, message);
            } else if (payload !== undefined) {
              // emit_debug
              console.log(`[chat-${state}]`, payload);
            } else {
              console.log(`[chat-${state}]`, event.payload);
            }
          } else {
            console.log("[chat-unknown]", event.payload);
          }
        });
      } catch (err) {
        console.warn("ChatController: failed to attach debug listener", err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

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
  const isCreateRoute = useMemo(
    () => location.pathname.startsWith("/create/"),
    [location.pathname]
  );
  const showGlobalChrome = !isOnboardingRoute && !isChatDetailRoute && !isCreateRoute;

  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const { isVisible: showCreateTooltip, dismissTooltip: dismissCreateTooltip } = useFirstTimeTooltip("create_button");
  const [showDelayedTooltip, setShowDelayedTooltip] = useState(false);

  useEffect(() => {
    if (isOnboardingRoute || isCreateRoute) {
      setShowCreateMenu(false);
    }
  }, [isOnboardingRoute, isCreateRoute]); // Run when onboarding or create route changes



  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const firstTime = urlParams.get("firstTime");

    if (firstTime === "true" && isChatRoute) {
      window.history.replaceState({}, document.title, location.pathname);

      const timer = window.setTimeout(() => {
        setShowDelayedTooltip(true);
      }, 2000);

      return () => {
        window.clearTimeout(timer);
        setShowDelayedTooltip(false);
      };
    } else {
      setShowDelayedTooltip(false);
    }
  }, [location.search, location.pathname, isChatRoute]); // More specific dependencies

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full ${isChatDetailRoute ? "max-w-full" : "max-w-md"
          } flex-col ${showGlobalChrome ? "pb-[calc(72px+env(safe-area-inset-bottom))]" : "pb-0"}`}
      >
        {showGlobalChrome && (
          <TopNav
            currentPath={location.pathname}
            onCreateClick={() => setShowCreateMenu(true)}
          />
        )}

        <main
          className={`flex-1 ${isOnboardingRoute
              ? "overflow-y-auto px-4 pt-6 pb-6"
              : isChatDetailRoute
                ? "overflow-hidden px-0 pt-0 pb-0"
                : isCreateRoute
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
              <Route path="/settings/providers" element={<ProvidersPage />} />
              <Route path="/settings/models" element={<ModelsPage />} />
              <Route path="/settings/characters" element={<CharactersPage />} />
              <Route path="/settings/security" element={<SecurityPage />} />
              <Route path="/settings/reset" element={<ResetPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:characterId" element={<ChatConversationPage />} />
              <Route path="/chat/:characterId/settings" element={<ChatSettingsPage />} />
              <Route path="/chat/:characterId/history" element={<ChatHistoryPage />} />
              <Route path="/create/character" element={<CreateCharacterPage />} />
              <Route path="/characters/:characterId/edit" element={<EditCharacterPage />} />
              <Route path="/create/persona" element={<CreatePersonaPage />} />
              <Route path="/personas" element={<PersonasPage />} />
              <Route path="/personas/:personaId/edit" element={<EditPersonaPage />} />
            </Routes>
          </motion.div>
        </main>

        {showGlobalChrome && (
          <BottomNav onCreateClick={() => setShowCreateMenu(true)} />
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
