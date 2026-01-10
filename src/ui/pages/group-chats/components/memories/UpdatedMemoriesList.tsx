import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { components, interactive, radius, spacing, colors, typography, cn } from "../../../../design-tokens";

export function UpdatedMemoriesList({ memories }: { memories: string[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!memories || memories.length === 0) return null;

  return (
    <div className="pt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between",
          components.listItem.base,
          "px-3 py-2",
          interactive.hover.brightness,
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isOpen ? "bg-emerald-400" : "bg-emerald-400/50",
            )}
          />
          <span className={cn(typography.caption.size, colors.text.secondary, "font-medium")}>
            Updated Memory State ({memories.length})
          </span>
        </div>
        {isOpen ? (
          <ChevronUp size={14} className={colors.text.tertiary} />
        ) : (
          <ChevronDown size={14} className={colors.text.tertiary} />
        )}
      </button>

      {isOpen && (
        <div className={cn("mt-2 space-y-2 pl-1", spacing.tight)}>
          {memories.map((m, i) => (
            <div key={i} className={cn(radius.sm, colors.accent.emerald.subtle, "px-3 py-2")}>
              <p className={cn(typography.caption.size, "leading-relaxed")}>{m}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
