import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { typography, interactive, cn } from "../../design-tokens";

interface TopNavProps {
  currentPath: string;
  onCreateClick: () => void;
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
    if (currentPath.startsWith("/settings/") && currentPath !== "/settings") return true;
    return false;
  }, [currentPath]);

  const handleBack = () => {
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
      <div className="relative mx-auto flex h-14 w-full items-center justify-between px-4">
        {/* Left side*/}
        <div className="flex items-center min-w-0 flex-1">
          {showBackButton && (
            <button
              onClick={handleBack}
              className={cn(
                "flex items-center gap-1 -ml-2 px-2 py-2",
                interactive.transition.fast,
                interactive.active.scale,
                "text-white/60 hover:text-white"
              )}
              aria-label="Go back"
            >
              <ChevronLeft size={20} strokeWidth={2} />
              <span className={cn(typography.body.size, "font-normal")}>
                Back
              </span>
            </button>
          )}
        </div>

        {/* Center - Title */}
        <div className="flex flex-col items-center absolute left-1/2 -translate-x-1/2">
          <span className={cn(
            typography.caption.size,
            "uppercase tracking-[0.4em] text-white/40"
          )}>
            LettuceAI
          </span>
          <span className={cn(
            typography.body.size,
            typography.h3.weight,
            "text-white"
          )}>
            {title}
          </span>
        </div>

        {/* Right side - Future action button space */}
        <div className="flex items-center justify-end min-w-0 flex-1">
          {/* Reserved for action buttons */}
        </div>
      </div>
    </header>
  );
}
