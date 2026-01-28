import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export function TabItem({
  to,
  icon: Icon,
  label,
  active,
  className = "",
}: {
  to: string;
  icon: any;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative block ${className}`}
    >
      <motion.div
        className={`relative flex h-full w-full items-center justify-center rounded-2xl font-medium transition ${
          active ? "text-white" : "text-gray-500 hover:text-white"
        }`}
        whileTap={{ scale: 0.95 }}
      >
        {active && (
          <motion.div
            className="absolute inset-0 rounded-2xl border border-white/15 bg-white/10"
            layoutId="activeTab"
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          />
        )}
        <Icon size={22} className="relative z-10" />
        <span className="sr-only">{label}</span>
      </motion.div>
    </Link>
  );
}
