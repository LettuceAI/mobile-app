import { motion, AnimatePresence, useDragControls, PanInfo } from "framer-motion";
import { X, LucideIcon } from "lucide-react";
import { ReactNode, useCallback, useMemo } from "react";

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
  className = "",
}: BottomMenuProps) {
  const isBottomMenu = location === "bottom";
  const dragControls = useDragControls();

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (!isBottomMenu) return;
    const hasPulledFarEnough = info.offset.y > 100; // Reduced threshold for faster response
    const hasQuickSwipe = info.velocity.y > 600 && info.offset.y > 20; // More responsive swipe
    if (hasPulledFarEnough || hasQuickSwipe) {
      onClose();
      return;
    }

    // snap back into place when not closing
    dragControls.stop();
  }, [isBottomMenu, onClose, dragControls]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    dragControls.start(event);
  }, [dragControls]);

  const menuVariants = useMemo(() => ({
    hidden: {
      y: isBottomMenu ? "100%" : "-100%",
      opacity: 0,
    },
    visible: {
      y: 0,
      opacity: 1,
    },
    exit: {
      y: isBottomMenu ? "100%" : "-100%",
      opacity: 0,
    },
  }), [isBottomMenu]);

  const menuClasses = isBottomMenu
    ? "fixed bottom-0 left-0 right-0 rounded-t-3xl"
    : "fixed top-0 left-0 right-0 rounded-b-3xl";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={onClose}
            style={{ willChange: 'opacity' }}
          />

          <motion.div
            className={`${menuClasses} z-50 mx-auto max-w-xl border border-white/10 bg-[#0b0b0d] p-1 shadow-[0_30px_120px_rgba(0,0,0,0.65)] ${className}`}
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ 
              type: "tween", 
              duration: 0.25, 
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
            style={{ 
              willChange: 'transform, opacity',
              transform: 'translate3d(0,0,0)' // Force GPU acceleration
            }}
            {...(isBottomMenu
              ? {
                  drag: "y" as const,
                  dragControls,
                  dragListener: false,
                  dragConstraints: { top: 0, bottom: 200 }, // Reduced for better feel
                  dragElastic: { top: 0, bottom: 0.1 }, // Less elastic for snappier feel
                  dragMomentum: false,
                  onDragEnd: handleDragEnd,
                }
              : {})}
          >
            {isBottomMenu && (
              <motion.div 
                className="flex justify-center pt-4 pb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.1 }}
              >
              <button
                type="button"
                onPointerDown={handlePointerDown}
                style={{ touchAction: "none" }}
                className="flex h-8 w-28 items-center justify-center border-0 bg-transparent focus:outline-none transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                aria-label="Drag to close menu"
              >
                <span className="h-1.5 w-24 rounded-full bg-white/60 transition-all duration-150 hover:bg-white/70 active:bg-white/80" />
              </button>
              </motion.div>
            )}

            <div className={`flex items-center justify-between px-6 ${isBottomMenu ? "pb-4" : "pt-4 pb-4"}`}>
              <h3 className="text-xl font-semibold text-white">{title}</h3>
              {includeExitIcon && (
                <motion.button
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/70 transition-all duration-150 hover:border-white/20 hover:text-white hover:bg-white/15"
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "tween", duration: 0.1 }}
                  onClick={onClose}
                  style={{ willChange: 'transform' }}
                >
                  <X size={18} />
                </motion.button>
              )}
            </div>

            <div className={`px-6 ${isBottomMenu ? "pb-8" : "pt-2 pb-4"}`}>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export function MenuButton({
  icon: Icon,
  title,
  description,
  color = "from-purple-500 to-blue-500",
  onClick,
  disabled = false,
}: MenuButtonProps) {
  const handleClick = useCallback(() => {
    if (!disabled) onClick();
  }, [disabled, onClick]);

  return (
    <motion.button
      className={`w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-white transition-all duration-150 shadow-[0_18px_60px_rgba(0,0,0,0.35)] ${
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-white/25 hover:bg-white/10 hover:shadow-[0_20px_70px_rgba(0,0,0,0.4)]"
      }`}
      whileTap={disabled ? {} : { scale: 0.98 }}
      transition={{ type: "tween", duration: 0.1 }}
      onClick={handleClick}
      disabled={disabled}
      style={{ willChange: disabled ? 'auto' : 'transform' }}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-[0_18px_45px_rgba(0,0,0,0.35)] ${
            disabled ? "grayscale" : ""
          }`}
        >
          <Icon size={24} />
        </div>
        <div className="flex-1">
          <h4 className="text-base font-semibold text-white">{title}</h4>
          {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
        </div>
      </div>
    </motion.button>
  );
}

export function MenuLabel({ children, className = "" }: MenuLabelProps) {
  return (
    <div className={`py-2 px-1 ${className}`}>
      <h4 className="text-xs font-medium uppercase tracking-[0.35em] text-gray-500">{children}</h4>
    </div>
  );
}

export function MenuDivider({ label, className = "" }: MenuDividerProps) {
  return (
    <div className={`flex items-center py-4 ${className}`}>
      <div className="flex-1 border-t border-white/10" />
      {label && (
        <>
          <span className="px-3 text-xs font-medium uppercase tracking-[0.35em] text-gray-500">{label}</span>
          <div className="flex-1 border-t border-white/10" />
        </>
      )}
    </div>
  );
}

export function MenuButtonGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div 
      className={`space-y-3 ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  );
}

export function MenuSection({ label, children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <motion.div 
      className={`space-y-3 ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {label && (
        <motion.p 
          className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, delay: 0.1 }}
        >
          {label}
        </motion.p>
      )}
      {children}
    </motion.div>
  );
}
