import { Clock } from "lucide-react";

import type { GroupSession } from "../../../../../core/storage/schemas";
import { components, colors, radius, spacing, typography, cn } from "../../../../design-tokens";
import { UpdatedMemoriesList } from "./UpdatedMemoriesList";

type MemoryToolEvent = NonNullable<GroupSession["memoryToolEvents"]>[number];

export function ToolLog({ events }: { events: MemoryToolEvent[] }) {
  if (!events.length) {
    return (
      <div className={cn(components.card.base, "px-6 py-8 text-center")}>
        <p className={cn(typography.bodySmall.size, colors.text.tertiary)}>
          No tool calls captured yet. Tool calls appear when AI manages memories in dynamic mode.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(spacing.item, "space-y-3")}>
      {events.map((event, index) => {
        const windowStart = event.windowStart ?? 0;
        const windowEnd = event.windowEnd ?? 0;
        const eventDate = event.createdAt || event.timestamp || 0;
        const hasWindow = event.windowStart !== undefined || event.windowEnd !== undefined;

        return (
          <div
            key={event.id ?? `event-${index}`}
            className={cn(components.card.base, "p-4 space-y-3")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className={colors.text.tertiary} />
                <span className={cn(typography.caption.size, colors.text.tertiary)}>
                  {hasWindow ? `Messages ${windowStart}-${windowEnd}` : "Memory Cycle"}
                </span>
              </div>
              {eventDate ? (
                <span className={cn(typography.caption.size, colors.text.disabled)}>
                  {new Date(eventDate).toLocaleDateString()}
                </span>
              ) : null}
            </div>

            {event.summary && (
              <div className={cn(radius.md, "border border-blue-400/20 bg-blue-400/10 px-3 py-3")}>
                <p className={cn(typography.bodySmall.size, "text-blue-200/90")}>{event.summary}</p>
              </div>
            )}

            {event.error && (
              <div className={cn(radius.md, "border border-red-400/20 bg-red-400/10 px-3 py-3")}>
                <p className={cn(typography.bodySmall.size, "text-red-200/90")}>{event.error}</p>
                {event.stage && (
                  <p className={cn(typography.caption.size, "mt-1 text-red-200/70")}>
                    Stage: {event.stage}
                  </p>
                )}
              </div>
            )}

            {event.actions && event.actions.length > 0 && (
              <div className={spacing.field}>
                <p className={cn(typography.caption.size, colors.text.tertiary, "font-semibold")}>
                  Actions ({event.actions.length})
                </p>
                {event.actions.map((action, actionIndex) => (
                  <div
                    key={`${action.name}-${actionIndex}`}
                    className={cn(
                      radius.md,
                      "border border-white/5 bg-black/20 p-3",
                      spacing.field,
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          typography.bodySmall.size,
                          "font-semibold uppercase tracking-wide text-emerald-300",
                        )}
                      >
                        {action.name}
                      </span>
                      {action.timestamp && (
                        <span className={cn(typography.caption.size, colors.text.disabled)}>
                          {new Date(action.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    {action.arguments && (
                      <div className={cn(radius.sm, "bg-black/40 p-3 overflow-x-auto")}>
                        <pre
                          className={cn(
                            typography.caption.size,
                            colors.text.secondary,
                            "font-mono",
                          )}
                        >
                          {JSON.stringify(action.arguments, null, 2)}
                        </pre>
                      </div>
                    )}

                    {action.updatedMemories?.length ? (
                      <UpdatedMemoriesList memories={action.updatedMemories} />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
