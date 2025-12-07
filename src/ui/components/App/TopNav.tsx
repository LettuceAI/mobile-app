
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Filter, Search, Settings, Plus, Check, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { typography, interactive, cn } from "../../design-tokens";

interface TopNavProps {
  currentPath: string;
  onBackOverride?: () => void;
}

export function TopNav({ currentPath, onBackOverride }: TopNavProps) {
  const navigate = useNavigate();
  const basePath = useMemo(() => currentPath.split("?")[0], [currentPath]);
  const hasAdvancedView = useMemo(() => currentPath.includes("view=advanced"), [currentPath]);

  const title = useMemo(() => {
    if (basePath === "/settings/providers") return "Providers";
    if (hasAdvancedView) return "Response Style";
    if (basePath === "/settings/models" || basePath.startsWith("/settings/models/")) return "Models";
    if (basePath === "/settings/security") return "Security";
    if (basePath === "/settings/reset") return "Reset";
    if (basePath === "/settings/backup") return "Backup & Restore";
    if (basePath === "/settings/usage") return "Usage Analytics";
    if (basePath === "/settings/changelog") return "Changelog";
    if (basePath === "/settings/prompts/new") return "Create Template";
    if (basePath.startsWith("/settings/prompts/")) return "Edit Template";
    if (basePath === "/settings/prompts") return "Prompt Templates";
    if (basePath === "/settings/developer") return "Developer";
    if (basePath === "/settings/advanced") return "Advanced";
    if (basePath === "/settings/characters") return "Characters";
    if (basePath === "/settings/personas") return "Personas";
    if (basePath === "/settings/advanced/memory") return "Dynamic Memory";
    if (basePath.startsWith("/settings")) return "Settings";
    if (basePath.startsWith("/create")) return "Create";
    if (basePath.startsWith("/onboarding")) return "Setup";
    if (basePath.startsWith("/welcome")) return "Welcome";
    if (basePath.startsWith("/chat/")) return "Conversation";
    if (basePath === "/library") return "Library";
    return "Chats";
  }, [basePath, hasAdvancedView]);

  const showBackButton = useMemo(() => {
    if (basePath.startsWith("/settings/") || basePath === "/settings") return true;
    if (basePath.startsWith("/create/")) return true;
    return false;
  }, [basePath]);

  const showFilterButton = useMemo(() => {
    return basePath === "/settings/usage" || basePath === "/settings/changelog" || basePath === "/library";
  }, [basePath]);

  const showSearchButton = useMemo(() => {
    return basePath === "/chat" || basePath === "/" || basePath === "/library";
  }, [basePath]);

  const showSettingsButton = useMemo(() => {
    return basePath === "/chat" || basePath === "/" || basePath === "/library";
  }, [basePath]);

  const showAddButton = useMemo(() => {
    if (basePath.startsWith("/settings/providers")) return true;
    if (basePath.startsWith("/settings/models") && !hasAdvancedView) return true;
    if (basePath === "/settings/prompts") return true;
    return false;
  }, [basePath, hasAdvancedView]);

  const isCenteredTitle = useMemo(() => {
    return basePath.startsWith("/settings");
  }, [basePath]);

  // Check if we're on a character edit page
  const showSaveButton = useMemo(() => {
    return /^\/settings\/characters\/[^/]+\/edit$/.test(basePath);
  }, [basePath]);

  // Track save button state from window globals
  const [canSave, setCanSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!showSaveButton) return;

    const checkGlobals = () => {
      const globalWindow = window as any;
      const newCanSave = !!globalWindow.__saveCharacterCanSave;
      const newIsSaving = !!globalWindow.__saveCharacterSaving;

      // Only update state if values actually changed
      setCanSave(prev => prev !== newCanSave ? newCanSave : prev);
      setIsSaving(prev => prev !== newIsSaving ? newIsSaving : prev);
    };

    // Check immediately and on interval
    checkGlobals();
    const interval = setInterval(checkGlobals, 200);

    return () => clearInterval(interval);
  }, [showSaveButton]);

  const handleBack = () => {
    if (onBackOverride) {
      onBackOverride();
      return;
    }
    navigate(-1);
  };

  const handleAddClick = () => {
    if (basePath.startsWith("/settings/providers")) {
      window.dispatchEvent(new CustomEvent("providers:add"));
      return;
    }
    if (basePath.startsWith("/settings/models") && !hasAdvancedView) {
      window.dispatchEvent(new CustomEvent("models:add"));
      return;
    }
    if (basePath === "/settings/prompts") {
      window.dispatchEvent(new CustomEvent("prompts:add"));
      return;
    }
  };

  const handleFilterClick = () => {
    if (basePath === "/settings/changelog") {
      window.dispatchEvent(new CustomEvent("changelog:openVersionSelector"));
    } else if (basePath === "/library") {
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
          {showAddButton && (
            <button
              onClick={handleAddClick}
              className={cn(
                "flex items-center justify-center rounded-full",
                "text-white/70 hover:text-white hover:bg-white/10",
                interactive.transition.fast,
                interactive.active.scale
              )}
              aria-label="Add"
            >
              <Plus size={20} strokeWidth={2.5} className="text-white" />
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
          {showSaveButton && (
            <button
              onClick={() => {
                const globalWindow = window as any;
                if (typeof globalWindow.__saveCharacter === "function") {
                  globalWindow.__saveCharacter();
                }
              }}
              disabled={!canSave || isSaving}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5",
                interactive.transition.fast,
                canSave && !isSaving
                  ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30"
                  : "bg-white/5 border border-white/10 text-white/40 cursor-not-allowed"
              )}
              aria-label="Save"
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              <span className="text-xs font-medium">Save</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
