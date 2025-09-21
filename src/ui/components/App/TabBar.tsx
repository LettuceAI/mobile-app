import { motion } from "framer-motion";
import { MessageCircle, Plus, Settings } from "lucide-react";
import { useLocation } from "react-router-dom";

import { TabItem } from "./TabItem";

export function TabBar({ onCreateClick }: { onCreateClick: () => void }) {
  const { pathname } = useLocation();
  return (
    <motion.nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/8 bg-[#0b0b0d]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3 text-white shadow-[0_-18px_60px_rgba(0,0,0,0.45)]"
      initial={{ y: 90 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.05 }}
    >
      <div className="mx-auto flex w-full max-w-md items-stretch gap-3">
        <TabItem
          to="/chat"
          icon={MessageCircle}
          label="Chats"
          active={pathname === "/" || pathname.startsWith("/chat")}
          className="flex-1 h-14"
        />

        <button
          onClick={onCreateClick}
          className="flex h-14 flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition hover:border-white/25 hover:bg-white/20"
          aria-label="Create"
        >
          <Plus size={20} />
        </button>

        <TabItem
          to="/settings"
          icon={Settings}
          label="Settings"
          active={pathname.startsWith("/settings")}
          className="flex-1 h-14"
        />
      </div>
    </motion.nav>
  );
}
