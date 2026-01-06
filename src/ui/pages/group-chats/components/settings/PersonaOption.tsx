import { useState } from "react";
import { Check } from "lucide-react";

import { radius, interactive, typography, cn } from "../../../../design-tokens";

export function PersonaOption({
  title,
  description,
  isDefault,
  isSelected,
  onClick,
  onLongPress,
}: {
  title: string;
  description: string;
  isDefault?: boolean;
  isSelected: boolean;
  onClick: () => void;
  onLongPress?: () => void;
}) {
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [isLongPressTriggered, setIsLongPressTriggered] = useState(false);

  const handleTouchStart = () => {
    if (!onLongPress) return;
    setIsLongPressTriggered(false);
    const timer = window.setTimeout(() => {
      setIsLongPressTriggered(true);
      onLongPress();
    }, 500);
    setLongPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    if (!isLongPressTriggered) {
      onClick();
    }
  };

  return (
    <button
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        if (!isLongPressTriggered) {
          onClick();
        }
      }}
      className={cn(
        "group relative flex w-full items-center gap-3 justify-between",
        radius.lg,
        "p-4 text-left",
        interactive.transition.default,
        interactive.active.scale,
        isSelected
          ? "border border-emerald-400/40 bg-emerald-400/15 ring-2 ring-emerald-400/30 text-emerald-100"
          : "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10",
      )}
      aria-pressed={isSelected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={cn(typography.body.size, typography.h3.weight, "truncate", "py-0.5")}>{title}</div>
          {isDefault && (
            <span
              className={cn(
                "shrink-0 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 text-[10px] font-medium text-blue-200",
              )}
            >
              App default
            </span>
          )}
        </div>
        <div className={cn(typography.caption.size, "mt-1 truncate text-gray-400")}>{description}</div>
      </div>

      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border",
          isSelected
            ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
            : "bg-white/5 border-white/10 text-white/70 group-hover:border-white/20",
        )}
        aria-hidden="true"
      >
        {isSelected ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
      </div>
    </button>
  );
}
