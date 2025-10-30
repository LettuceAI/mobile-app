import { motion } from "framer-motion";
import { MessageCircle, Plus, Settings } from "lucide-react";
import { useLocation } from "react-router-dom";

import { TabItem } from "./NavItem";

export function BottomNav({ onCreateClick }: { onCreateClick: () => void }) {
  const { pathname } = useLocation();

  const handleCreateClick = () => {
    if (typeof window !== "undefined") {
      const globalWindow = window as any;
      if (pathname.startsWith("/settings/providers")) {
        if (typeof globalWindow.__openAddProvider === "function") {
          globalWindow.__openAddProvider();
        } else {
          window.dispatchEvent(new CustomEvent("providers:add"));
        }
        return;
      }

      if (pathname.startsWith("/settings/models")) {
        if (typeof globalWindow.__openAddModel === "function") {
          globalWindow.__openAddModel();
        } else {
          window.dispatchEvent(new CustomEvent("models:add"));
        }
        return;
      }

      if (pathname.startsWith("/settings/prompts")) {
        if (typeof globalWindow.__openAddPromptTemplate === "function") {
          globalWindow.__openAddPromptTemplate();
        } else {
          window.dispatchEvent(new CustomEvent("prompts:add"));
        }
        return;
      }
    }

    onCreateClick();
  };
  return (
    <motion.nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/8 bg-[#0b0b0d]/95 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 text-white shadow-[0_-12px_32px_rgba(0,0,0,0.35)]"
      initial={{ y: 90 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.05 }}
    >
      <div className="mx-auto flex w-full max-w-md items-stretch gap-2">
        <TabItem
          to="/chat"
          icon={MessageCircle}
          label="Chats"
          active={pathname === "/" || pathname.startsWith("/chat")}
          className="flex-1 h-10 text-sm"
        />

        <button
          onClick={handleCreateClick}
          className="flex h-10 flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)] transition hover:border-white/25 hover:bg-white/20"
          aria-label="Create"
        >
          <Plus size={16} />
        </button>

        <TabItem
          to="/settings"
          icon={Settings}
          label="Settings"
          active={pathname.startsWith("/settings")}
          className="flex-1 h-10 text-sm"
        />
      </div>
    </motion.nav>
  );
}
