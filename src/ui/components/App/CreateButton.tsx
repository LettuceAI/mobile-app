import { motion } from "framer-motion";
import { Plus } from "lucide-react";

export function CreateButton({ onClick }: { onClick: () => void }) {
    return (
        <motion.button
            className="flex flex-col items-center p-2 rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={onClick}
        >
            <Plus size={24} className="relative z-10" />
            <span className="text-xs mt-1 relative z-10">Create</span>
        </motion.button>
    );
}