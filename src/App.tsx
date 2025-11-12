import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { WelcomePage, ProviderSetupPage, ModelSetupPage } from "./ui/pages/onboarding";
import { SettingsPage } from "./ui/pages/settings/Settings";
import { ProvidersPage } from "./ui/pages/settings/ProvidersPage";
import { ModelsPage } from "./ui/pages/settings/ModelsPage";
import { EditModelPage } from "./ui/pages/settings/EditModelPage";
import { SystemPromptsPage } from "./ui/pages/settings/SystemPromptsPage";
import { EditPromptTemplate } from "./ui/pages/settings/EditPromptTemplate";
import { SecurityPage } from "./ui/pages/settings/SecurityPage";
import { ResetPage } from "./ui/pages/settings/ResetPage";
import { UsagePage } from "./ui/pages/settings/UsagePage";
import { CharactersPage } from "./ui/pages/settings/CharactersPage";
import { DeveloperPage } from "./ui/pages/settings/DeveloperPage";
import { ChatPage, ChatConversationPage, ChatSettingsPage, ChatHistoryPage } from "./ui/pages/chats";
import { ThemeProvider } from "./core/theme/ThemeContext";
import { CreateCharacterPage, EditCharacterPage } from "./ui/pages/characters";
import { CreatePersonaPage, PersonasPage, EditPersonaPage } from "./ui/pages/personas";
import { SearchPage } from "./ui/pages/search";

import { CreateMenu, Tooltip, useFirstTimeTooltip } from "./ui/components";
import { isOnboardingCompleted } from "./core/storage/appState";
import { TopNav, BottomNav } from "./ui/components/App";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useAndroidBackHandler } from "./ui/hooks/useAndroidBackHandler";
import { logManager, isLoggingEnabled } from "./core/utils/logger";

const chatLog = logManager({ component: "Chat" });

function App() {
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      try {
        unlisten = await listen("chat://debug", (event) => {
          if (
            typeof event.payload === "object" &&
            event.payload !== null &&
            "state" in event.payload
          ) {
            const { state, level, payload, message } = event.payload as {
              state: string;
              level?: string;
              payload?: unknown;
              message?: string;
            };
            
            // Backend logs come pre-formatted with timestamp
            if (message !== undefined) {
              if (isLoggingEnabled()) {
                const method = level?.toLowerCase() || "log";
                if (method in console) {
                  (console as any)[method](message);
                } else {
                  console.log(message);
                }
              }
            } else if (payload !== undefined) {
              chatLog.with({ fn: state }).log(payload);
            } else {
              chatLog.with({ fn: state }).log(event.payload);
            }
          } else {
            chatLog.warn("unknown event payload", event.payload);
          }
        });
      } catch (err) {
        console.error("Failed to attach debug listener:", err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <ThemeProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <div className="min-h-screen bg-[#050505] text-gray-100 antialiased">
          <AppContent />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

function AppContent() {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement | null>(null);
  const isChatRoute = location.pathname === "/chat" || location.pathname === "/";
  const isChatDetailRoute = location.pathname.startsWith("/chat/");
  const isSearchRoute = location.pathname === "/search";
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
  const showGlobalChrome = !isOnboardingRoute && !isChatDetailRoute && !isCreateRoute && !isSearchRoute;

  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const { isVisible: showCreateTooltip, dismissTooltip: dismissCreateTooltip } = useFirstTimeTooltip("create_button");
  const [showDelayedTooltip, setShowDelayedTooltip] = useState(false);

  useAndroidBackHandler();

  useEffect(() => {
    if (isOnboardingRoute || isCreateRoute) {
      setShowCreateMenu(false);
    }
  }, [isOnboardingRoute, isCreateRoute]); 



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
  }, [location.search, location.pathname, isChatRoute]);

  useEffect(() => {
    if (!location.pathname.startsWith("/settings")) return;

    const id = window.setTimeout(() => {
      const main = mainRef.current;
      if (main) {
        main.scrollTop = 0;

        const inner = main.querySelector('[data-settings-scroll], .settings-scroll') as HTMLElement | null;
        if (inner) {
          inner.scrollTop = 0;
        }
      }

      window.scrollTo(0, 0);
    }, 0);

    return () => window.clearTimeout(id);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full ${isChatDetailRoute ? "max-w-full" : "max-w-md"
          } flex-col ${showGlobalChrome ? "pb-[calc(72px+env(safe-area-inset-bottom))]" : "pb-0"}`}
      >
        {showGlobalChrome && (
          <TopNav
            currentPath={location.pathname + location.search}
            onCreateClick={() => setShowCreateMenu(true)}
          />
        )}
        
        <main
          ref={mainRef}
          className={`flex-1 ${showGlobalChrome ? "pt-[calc(56px+env(safe-area-inset-top)+8px)]" : ""} ${isOnboardingRoute
              ? "overflow-y-auto px-4 pt-6 pb-6"
              : isChatDetailRoute
                ? "overflow-hidden px-0 pt-0 pb-0"
                : isCreateRoute
                  ? "overflow-hidden px-0 pt-0 pb-0"
                  : isSearchRoute
                    ? "overflow-hidden px-0 pt-0 pb-0"
                    : "overflow-y-auto px-4 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))]"
            }`}
        >
          <motion.div
            key={location.pathname.startsWith("/settings") ? location.pathname : location.key}
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
              <Route path="/search" element={<SearchPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/providers" element={<ProvidersPage />} />
              <Route path="/settings/models" element={<ModelsPage />} />
              <Route path="/settings/models/new" element={<EditModelPage />} />
              <Route path="/settings/models/:modelId" element={<EditModelPage />} />
              <Route path="/settings/prompts" element={<SystemPromptsPage />} />
              <Route path="/settings/prompts/new" element={<EditPromptTemplate />} />
              <Route path="/settings/prompts/:id" element={<EditPromptTemplate />} />
              <Route path="/settings/characters" element={<CharactersPage />} />
              <Route path="/settings/security" element={<SecurityPage />} />
              <Route path="/settings/usage" element={<UsagePage />} />
              <Route path="/settings/developer" element={<DeveloperPage />} />
              <Route path="/settings/reset" element={<ResetPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:characterId" element={<ChatConversationPage />} />
              <Route path="/chat/:characterId/settings" element={<ChatSettingsPage />} />
              <Route path="/chat/:characterId/history" element={<ChatHistoryPage />} />
              <Route path="/create/character" element={<CreateCharacterPage />} />
              <Route path="/characters/:characterId/edit" element={<EditCharacterPage />} />
              <Route path="/create/persona" element={<CreatePersonaPage />} />
              <Route path="/personas" element={<PersonasPage />} />
              <Route path="/settings/personas" element={<PersonasPage />} />
              <Route path="/settings/personas/:personaId/edit" element={<EditPersonaPage />} />
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
