import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface TopNavProps {
  currentPath: string;
  onCreateClick: () => void;
}

export function TopNav({ currentPath }: TopNavProps) {
  const navigate = useNavigate();
  const title = useMemo(() => {
    if (currentPath.startsWith("/settings")) return "Settings";
    if (currentPath.startsWith("/create")) return "Create";
    if (currentPath.startsWith("/onboarding")) return "Setup";
    if (currentPath.startsWith("/welcome")) return "Welcome";
    if (currentPath.startsWith("/chat/")) return "Conversation";
    return "Chats";
  }, [currentPath]);

  const handleBack = () => {
    // Special handling for CreateCharacter page
    if (currentPath === "/create/character") {
      const handler = (window as any).__createCharacterBackHandler;
      if (handler && handler()) {
        return; // Handler managed the navigation
      }
    }
    
    navigate(-1);
  };

  const showBackButton = currentPath === "/create/character";

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
      </div>
    </header>
  );
}
