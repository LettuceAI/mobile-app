import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";

interface TopNavProps {
  currentPath: string;
  onCreateClick: () => void; // (reserved for future primary action button if needed)
}

export function TopNav({ currentPath }: TopNavProps) {
  const navigate = useNavigate();
  const title = useMemo(() => {
    if (currentPath === "/settings/providers") return "Providers";
    if (currentPath === "/settings/models") return "Models";
    if (currentPath === "/settings/security") return "Security";
    if (currentPath === "/settings/reset") return "Reset";
    if (currentPath.startsWith("/settings")) return "Settings";
    if (currentPath.startsWith("/create")) return "Create";
    if (currentPath.startsWith("/onboarding")) return "Setup";
    if (currentPath.startsWith("/welcome")) return "Welcome";
    if (currentPath.startsWith("/chat/")) return "Conversation";
    return "Chats";
  }, [currentPath]);

  const showBackButton = useMemo(() => {
    if (currentPath === "/create/character") return true;
    if (currentPath.startsWith("/settings/") && currentPath !== "/settings") return true;
    return false;
  }, [currentPath]);

  const handleBack = () => {
    if (currentPath === "/create/character") {
      const handler = (window as any).__createCharacterBackHandler;
      if (handler && handler()) return;
      navigate(-1);
      return;
    }
    if (currentPath.startsWith("/settings/") && currentPath !== "/settings") {
      navigate("/settings");
      return;
    }
    navigate(-1);
  };

  return (
    <header
      className="sticky top-0 z-30 border-b border-white/5 bg-[#050505]/85 backdrop-blur-xl"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
    >
      <div className="relative mx-auto flex h-14 w-full items-center justify-center px-4">
        {showBackButton && (
          <button
            onClick={handleBack}
            className="absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-white/30 hover:text-white"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        )}
        <div className="flex flex-col items-center">
          <span className="text-[11px] uppercase tracking-[0.4em] text-gray-500">LettuceAI</span>
          <span className="text-sm font-semibold text-white">{title}</span>
          </div>
        {(currentPath === "/settings/models" || currentPath === "/settings/providers") && (
          <button
            onClick={() => {
              const g: any = window;
              if (currentPath === "/settings/models") {
                if (typeof g.__openAddModel === "function") g.__openAddModel();
                else window.dispatchEvent(new CustomEvent("models:add"));
              } else if (currentPath === "/settings/providers") {
                if (typeof g.__openAddProvider === "function") g.__openAddProvider();
                else window.dispatchEvent(new CustomEvent("providers:add"));
              }
            }}
            aria-label={currentPath === "/settings/models" ? "Add model" : "Add provider"}
            className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-white/30 hover:text-white"
          >
            <Plus size={14} />
          </button>
        )}
        </div>
    </header>
  );
}
