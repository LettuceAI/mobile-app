import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { radius, interactive, typography, cn } from "../../../../design-tokens";

export function QuickChip({
  icon,
  label,
  value,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full min-h-14 items-center justify-between",
        radius.md,
        "border p-4 text-left",
        interactive.transition.default,
        interactive.active.scale,
        disabled
          ? "border-white/5 bg-[#0c0d13]/50 opacity-50 cursor-not-allowed"
          : "border-white/10 bg-[#0c0d13]/85 hover:border-white/20 hover:bg-white/10",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center",
            radius.full,
            "border border-white/15 bg-white/10 text-white/80",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              typography.overline.size,
              typography.overline.weight,
              typography.overline.tracking,
              typography.overline.transform,
              "text-white/50",
            )}
          >
            {label}
          </div>
          <div className={cn(typography.bodySmall.size, "text-white truncate")}>{value}</div>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
    </button>
  );
}
