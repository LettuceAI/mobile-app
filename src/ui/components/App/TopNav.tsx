import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutGrid, Plus, Settings2 } from "lucide-react";

import { ThemeToggle } from "../ThemeToggle";

interface TopNavProps {
  currentPath: string;
  onCreateClick: () => void;
}

export function TopNav({ currentPath, onCreateClick }: TopNavProps) {
  const navigate = useNavigate();
  const title = useMemo(() => {
    if (currentPath.startsWith("/settings")) return "Settings";
    if (currentPath.startsWith("/create")) return "Create";
    if (currentPath.startsWith("/onboarding")) return "Setup";
    if (currentPath.startsWith("/welcome")) return "Welcome";
    return "Chats";
  }, [currentPath]);

  return (
    <header
      className="sticky top-0 z-30 border-b border-white/5 bg-[#050505]/85 backdrop-blur-xl"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
    >
      <div className="mx-auto flex h-14 w-full items-center justify-center px-4">
        <div className="flex flex-col align-items items-center">
          <span className="text-[11px] uppercase tracking-[0.4em] text-gray-500">LettuceAI</span>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
      </div>
    </header>
  );
}
