import { useState } from "react";
import type { ComponentType } from "react";
import {
  Plus,
  Trash2,
  Pin,
  Check,
  Cpu,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";

import type { GroupSession } from "../../../../../core/storage/schemas";
import {
  components,
  colors,
  radius,
  spacing,
  typography,
  cn,
  interactive,
} from "../../../../design-tokens";

type MemoryToolEvent = NonNullable<GroupSession["memoryToolEvents"]>[number];

function relativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

const ACTION_STYLES: Record<
  string,
  {
    icon: ComponentType<{ size?: string | number; className?: string }>;
    color: string;
    label: string;
    bg: string;
    border: string;
  }
> = {
  create_memory: {
    icon: Plus,
    color: "text-emerald-300",
    label: "Created",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
  },
  delete_memory: {
    icon: Trash2,
    color: "text-red-300",
    label: "Deleted",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
  },
  pin_memory: {
    icon: Pin,
    color: "text-amber-300",
    label: "Pinned",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
  },
  unpin_memory: {
    icon: Pin,
    color: "text-amber-300/60",
    label: "Unpinned",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
  },
  done: {
    icon: Check,
    color: "text-blue-300",
    label: "Done",
    bg: "bg-blue-400/10",
    border: "border-blue-400/20",
  },
};

function ActionCard({
  action,
}: {
  action: NonNullable<MemoryToolEvent["actions"]>[number];
}) {
  const style = ACTION_STYLES[action.name] || {
    icon: Cpu,
    color: "text-zinc-300",
    label: action.name,
    bg: "bg-white/5",
    border: "border-white/10",
  };
  const Icon = style.icon;
  const args = action.arguments as Record<string, unknown> | undefined;
  const memoryText = args?.text as string | undefined;
  const category = args?.category as string | undefined;
  const important = args?.important as boolean | undefined;
  const confidence = args?.confidence as number | undefined;
  const id = args?.id as string | undefined;

  return (
    <div
      className={cn(
        radius.md,
        "border px-3 py-2.5 flex items-start gap-2.5",
        style.bg,
        style.border,
      )}
    >
      <Icon size={14} className={cn(style.color, "mt-0.5 shrink-0")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-[11px] font-semibold", style.color)}>
            {style.label}
          </span>
          {category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {category.replace(/_/g, " ")}
            </span>
          )}
          {important && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              pinned
            </span>
          )}
          {confidence != null && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full border",
                confidence < 0.7
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                  : "bg-red-500/20 text-red-300 border-red-500/30",
              )}
            >
              {confidence < 0.7
                ? "soft-delete"
                : `${Math.round(confidence * 100)}%`}
            </span>
          )}
        </div>
        {memoryText && (
          <p
            className={cn(
              typography.caption.size,
              colors.text.secondary,
              "mt-1 leading-relaxed",
            )}
          >
            {memoryText}
          </p>
        )}
        {id && !memoryText && (
          <p
            className={cn(
              typography.caption.size,
              colors.text.tertiary,
              "mt-1 font-mono",
            )}
          >
            #{id}
          </p>
        )}
      </div>
    </div>
  );
}

function summarizeActions(
  actions: NonNullable<MemoryToolEvent["actions"]>,
): string {
  const counts: Record<string, number> = {};
  for (const a of actions) {
    const label = ACTION_STYLES[a.name]?.label || a.name;
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => `${count} ${label.toLowerCase()}`)
    .join(", ");
}

function CycleCard({
  event,
  defaultOpen,
}: {
  event: MemoryToolEvent;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const hasError = !!event.error;
  const actions = event.actions || [];
  const actionSummary = actions.length ? summarizeActions(actions) : null;
  const eventTime = event.createdAt || event.timestamp || 0;
  const windowStart = event.windowStart ?? 0;
  const windowEnd = event.windowEnd ?? 0;

  return (
    <div
      className={cn(
        components.card.base,
        "overflow-hidden",
        hasError && "border-red-400/20",
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left",
          interactive.hover.brightness,
        )}
      >
        <div
          className={cn(
            "h-2 w-2 rounded-full shrink-0",
            hasError ? "bg-red-400" : "bg-emerald-400",
          )}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                typography.caption.size,
                colors.text.secondary,
                "font-medium",
              )}
            >
              {eventTime ? relativeTime(eventTime) : "Memory Cycle"}
            </span>
            {actionSummary && (
              <span className={cn(typography.caption.size, colors.text.tertiary)}>
                — {actionSummary}
              </span>
            )}
            {hasError && (
              <AlertTriangle size={12} className="text-red-400 shrink-0" />
            )}
          </div>

          {event.summary && !isOpen && (
            <p className={cn("text-[11px] mt-0.5 truncate", colors.text.tertiary)}>
              {event.summary}
            </p>
          )}
        </div>

        <ChevronDown
          size={14}
          className={cn(
            colors.text.tertiary,
            "shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {event.summary && (
            <div
              className={cn(
                radius.md,
                "border border-blue-400/20 bg-blue-400/10 px-3 py-2.5",
              )}
            >
              <p className="text-[12px] leading-relaxed text-blue-200/90">
                {event.summary}
              </p>
            </div>
          )}

          {event.error && (
            <div
              className={cn(
                radius.md,
                "border border-red-400/20 bg-red-400/10 px-3 py-2.5",
              )}
            >
              <p className="text-[12px] text-red-200/90">{event.error}</p>
              {event.stage && (
                <p className="text-[11px] mt-1 text-red-200/60">
                  Failed at: {event.stage}
                </p>
              )}
            </div>
          )}

          {actions.length > 0 && (
            <div className="space-y-2">
              {actions
                .filter((a) => a.name !== "done")
                .map((action, idx) => (
                  <ActionCard key={idx} action={action} />
                ))}
            </div>
          )}

          <div
            className={cn(
              "flex items-center gap-3 pt-1",
              typography.caption.size,
              colors.text.disabled,
            )}
          >
            <span>
              Window {windowStart}–{windowEnd}
            </span>
            {eventTime > 0 && <span>{new Date(eventTime).toLocaleString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ToolLog({ events }: { events: MemoryToolEvent[] }) {
  if (!events.length) {
    return (
      <div className={cn(components.card.base, "px-6 py-8 text-center")}>
        <p className={cn(typography.bodySmall.size, colors.text.tertiary)}>
          No tool calls captured yet. Tool calls appear when AI manages memories
          in dynamic mode.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(spacing.item, "space-y-2")}>
      {events.map((event, idx) => (
        <CycleCard
          key={event.id ?? `event-${idx}`}
          event={event}
          defaultOpen={idx === events.length - 1}
        />
      ))}
    </div>
  );
}
