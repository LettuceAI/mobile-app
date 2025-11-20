
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Filter, Search, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { typography, interactive, cn } from "../../design-tokens";

interface TopNavProps {
  currentPath: string;
  onCreateClick: () => void;
}

export function TopNav({ currentPath }: TopNavProps) {
  const navigate = useNavigate();
  const title = useMemo(() => {
    if (currentPath === "/settings/providers") return "Providers";
    if (currentPath.includes("view=advanced")) return "Response Style";
    if (currentPath === "/settings/models" || currentPath.startsWith("/settings/models/")) return "Models";
    if (currentPath === "/settings/security") return "Security";
    if (currentPath === "/settings/reset") return "Reset";
    if (currentPath === "/settings/usage") return "Usage Analytics";
    if (currentPath === "/settings/changelog") return "Changelog";
    if (currentPath === "/settings/prompts/new") return "Create Template";
    if (currentPath.startsWith("/settings/prompts/")) return "Edit Template";
    if (currentPath === "/settings/prompts") return "Prompt Templates";
    if (currentPath === "/settings/developer") return "Developer";
    if (currentPath === "/settings/advanced") return "Advanced";
    if (currentPath === "/settings/characters") return "Characters";
    if (currentPath === "/settings/personas") return "Personas";
    if (currentPath === "/settings/advanced/memory") return "Dynamic Memory";
    if (currentPath.startsWith("/settings")) return "Settings";
    if (currentPath.startsWith("/create")) return "Create";
    if (currentPath.startsWith("/onboarding")) return "Setup";
    if (currentPath.startsWith("/welcome")) return "Welcome";
    if (currentPath.startsWith("/chat/")) return "Conversation";
    if (currentPath === "/library") return "Library";
    return "Chats";
  }, [currentPath]);

  const showBackButton = useMemo(() => {
    if (currentPath.startsWith("/settings/") || currentPath === "/settings") return true;
    return false;
  }, [currentPath]);

  const showFilterButton = useMemo(() => {
    return currentPath === "/settings/usage" || currentPath === "/settings/changelog" || currentPath === "/library";
  }, [currentPath]);

  const showSearchButton = useMemo(() => {
    return currentPath === "/chat" || currentPath === "/" || currentPath === "/library";
  }, [currentPath]);

  const showSettingsButton = useMemo(() => {
    return currentPath === "/chat" || currentPath === "/" || currentPath === "/library";
  }, [currentPath]);

  const isCenteredTitle = useMemo(() => {
    return currentPath.startsWith("/settings");
  }, [currentPath]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleFilterClick = () => {
    if (currentPath === "/settings/changelog") {
      window.dispatchEvent(new CustomEvent("changelog:openVersionSelector"));
    } else if (currentPath === "/library") {
      window.dispatchEvent(new CustomEvent("library:openFilter"));
    } else if (typeof window !== "undefined") {
      const globalWindow = window as any;
      if (typeof globalWindow.__openUsageFilters === "function") {
        globalWindow.__openUsageFilters();
      } else {
        window.dispatchEvent(new CustomEvent("usage:filters"));
      }
    }
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 border-b border-white/10 backdrop-blur-sm bg-black/60"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)", paddingBottom: "12px" }}
    >
      <div className="relative mx-auto flex w-full max-w-md items-center justify-between px-3 h-10">
        {/* Left side: Logo + Title */}
        <div className="flex items-center gap-1 overflow-hidden h-full">
          <div className={cn("flex items-center justify-center shrink-0", showBackButton ? "w-10" : "w-0")}>
            <AnimatePresence mode="wait" initial={false}>
              {showBackButton && (
                <motion.button
                  key="back"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  onClick={handleBack}
                  className={cn(
                    "flex items-center justify-center rounded-full p-2",
                    "text-white/70 hover:text-white hover:bg-white/10",
                    interactive.transition.fast,
                    interactive.active.scale
                  )}
                  aria-label="Go back"
                >
                  <ArrowLeft size={20} strokeWidth={2.5} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <motion.h1
            key={title}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
              typography.h1.size,
              "font-bold text-white tracking-tight truncate leading-none",
              isCenteredTitle && "absolute left-1/2 -translate-x-1/2 w-auto"
            )}
          >
            {title}
          </motion.h1>
        </div>

        {/* Right side: Actions - Fixed width container or flex-end to prevent layout shift */}
        <div className="flex items-center justify-end gap-1 shrink-0 min-w-[40px] h-full">
          {showSearchButton && (
            <button
              onClick={() => navigate("/search")}
              className={cn(
                "flex items-center justify-center rounded-full",
                "text-white/70 hover:text-white hover:bg-white/10",
                interactive.transition.fast,
                interactive.active.scale
              )}
              aria-label="Search"
            >
              <Search size={20} strokeWidth={2.5} className="text-white" />
            </button>
          )}
          {showSettingsButton && (
            <button
              onClick={() => navigate("/settings")}
              className={cn(
                "flex items-center justify-center rounded-full",
                "text-white/70 hover:text-white hover:bg-white/10",
                interactive.transition.fast,
                interactive.active.scale
              )}
              aria-label="Settings"
            >
              <Settings size={20} strokeWidth={2.5} className="text-white" />
            </button>
          )}
          {showFilterButton && (
            <button
              onClick={handleFilterClick}
              className={cn(
                "flex items-center justify-center rounded-full",
                "text-white/70 hover:text-white hover:bg-white/10",
                interactive.transition.fast,
                interactive.active.scale
              )}
              aria-label="Open filters"
            >
              <Filter size={20} strokeWidth={2.5} className="text-white" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
