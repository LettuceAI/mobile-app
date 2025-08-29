import { motion, AnimatePresence } from "framer-motion";
import { X, LucideIcon } from "lucide-react";
import { ReactNode } from "react";

export interface MenuButtonProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface MenuDividerProps {
  label?: string;
  className?: string;
}

export interface MenuLabelProps {
  children: ReactNode;
  className?: string;
}

export interface BottomMenuProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  includeExitIcon?: boolean;
  location?: "top" | "bottom";
  children: ReactNode;
  className?: string;
}

export function BottomMenu({ 
  isOpen, 
  onClose, 
  title = "Menu", 
  includeExitIcon = true,
  location = "bottom",
  children,
  className = ""
}: BottomMenuProps) {
  const isBottomMenu = location === "bottom";
  
  const menuVariants = {
    hidden: { 
      y: isBottomMenu ? "100%" : "-100%",
      opacity: 0 
    },
    visible: { 
      y: 0,
      opacity: 1 
    },
    exit: { 
      y: isBottomMenu ? "100%" : "-100%",
      opacity: 0 
    }
  };

  const menuClasses = isBottomMenu 
    ? "fixed bottom-0 left-0 right-0 rounded-t-3xl" 
    : "fixed top-0 left-0 right-0 rounded-b-3xl";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          {/* Menu Container */}
          <motion.div
            className={`${menuClasses} bg-white dark:bg-slate-900 shadow-2xl z-50 max-w-md mx-auto ${className}`}
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Handle (only for bottom menu) */}
            {isBottomMenu && (
              <div className="flex justify-center pt-4 pb-2">
                <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
              </div>
            )}
            
            {/* Header */}
            <div className={`flex items-center justify-between px-6 ${isBottomMenu ? 'pb-4' : 'pt-4 pb-4'}`}>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
              {includeExitIcon && (
                <motion.button
                  className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                >
                  <X size={20} />
                </motion.button>
              )}
            </div>
            
            {/* Content */}
            <div className={`px-6 ${isBottomMenu ? 'pb-8' : 'pt-2 pb-4'}`}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function MenuButton({ 
  icon: Icon, 
  title, 
  description, 
  color = "from-gray-500 to-gray-600", 
  onClick,
  disabled = false 
}: MenuButtonProps) {
  return (
    <motion.button
      className={`w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-left ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      whileTap={disabled ? {} : { scale: 0.98 }}
      whileHover={disabled ? {} : { scale: 1.02 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <div className="flex items-center space-x-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg ${
          disabled ? 'grayscale' : ''
        }`}>
          <Icon size={24} className="text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h4>
          {description && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {description}
            </p>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export function MenuLabel({ children, className = "" }: MenuLabelProps) {
  return (
    <div className={`py-2 px-1 ${className}`}>
      <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
        {children}
      </h4>
    </div>
  );
}

export function MenuDivider({ label, className = "" }: MenuDividerProps) {
  return (
    <div className={`flex items-center my-4 ${className}`}>
      <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
      {label && (
        <>
          <span className="px-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {label}
          </span>
          <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
        </>
      )}
    </div>
  );
}

// Utility components for common menu patterns
export function MenuButtonGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {children}
    </div>
  );
}

export function MenuSection({ 
  label, 
  children, 
  className = "" 
}: { 
  label?: string; 
  children: ReactNode; 
  className?: string; 
}) {
  return (
    <div className={`${className}`}>
      {label && <MenuLabel>{label}</MenuLabel>}
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}
