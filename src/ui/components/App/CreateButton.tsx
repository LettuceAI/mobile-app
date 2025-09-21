import { motion } from "framer-motion";
import { Plus } from "lucide-react";

export function CreateButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white transition hover:border-white/20 hover:bg-white/20"
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
      onClick={onClick}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
        <Plus size={22} />
      </span>
      <span className="text-xs font-semibold tracking-[0.3em] text-white/70">Create</span>
    </motion.button>
  );
}
