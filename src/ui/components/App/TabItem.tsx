import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export function TabItem({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
    return (
        <Link to={to} className="relative">
            <motion.div
                className={`flex flex-col items-center p-2 rounded-lg transition-colors ${active
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400"
                    }`}
                whileTap={{ scale: 0.95 }}
            >
                {active && (
                    <motion.div
                        className="absolute inset-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg"
                        layoutId="activeTab"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                )}
                <Icon size={20} className="relative z-10" />
                <span className="text-xs mt-1 relative z-10">{label}</span>
            </motion.div>
        </Link>
    );
}