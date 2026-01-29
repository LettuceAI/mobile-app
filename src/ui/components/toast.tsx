import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "../design-tokens";

type ToastVariant = "info" | "warning" | "success" | "error";

// Base styling that matches your UI design language
const baseClassName =
  "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-white/10 bg-black/80 px-4 py-3 shadow-lg backdrop-blur-sm";

const titleClassName = "text-sm font-semibold text-white leading-tight";
const descriptionClassName = "text-xs text-white/80 leading-relaxed";

// More subtle, professional variant styling that fits your dark UI
const variantClasses: Record<ToastVariant, string> = {
  info: "border-blue-400/30 bg-blue-500/20",
  warning: "border-amber-400/30 bg-amber-500/20",
  success: "border-emerald-400/30 bg-emerald-500/20",
  error: "border-red-400/30 bg-red-500/20",
};

// Icon styling to match your UI's color scheme
const variantIcons: Record<ToastVariant, ReactNode> = {
  info: <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />,
  error: <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />,
};

type ToastActionOptions = {
  actionLabel?: string;
  onAction?: () => void;
  id?: string | number;
};

function showToast(
  variant: ToastVariant,
  title: string,
  description?: string,
  options?: ToastActionOptions,
) {
  return sonnerToast(
    <div className="flex items-start gap-3 w-full">
      {variantIcons[variant]}
      <div className="flex-1 min-w-0">
        <div className={titleClassName}>{title}</div>
        {description && <div className={cn(descriptionClassName, "mt-0.5")}>{description}</div>}
      </div>
      {options?.actionLabel && (
        <button
          onClick={() => {
            options.onAction?.();
            if (options.id) sonnerToast.dismiss(options.id);
          }}
          className={cn(
            "shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5",
            "text-xs font-medium text-white/70",
            "hover:bg-white/10 hover:text-white transition-colors",
          )}
        >
          {options.actionLabel}
        </button>
      )}
    </div>,
    {
      className: cn(baseClassName, variantClasses[variant]),
      unstyled: true,
      duration: 5000,
      id: options?.id,
    },
  );
}

export const toast = {
  info: (title: string, description?: string, options?: ToastActionOptions) =>
    showToast("info", title, description, options),
  
  warning: (title: string, description?: string, options?: ToastActionOptions) =>
    showToast("warning", title, description, options),
  
  success: (title: string, description?: string, options?: ToastActionOptions) =>
    showToast("success", title, description, options),
  
  error: (title: string, description?: string, options?: ToastActionOptions) =>
    showToast("error", title, description, options),
  
  // Legacy support for warningAction
  warningAction: (
    title: string,
    description: string | undefined,
    actionLabel: string,
    onAction: () => void,
    id?: string | number,
  ) => showToast("warning", title, description, { actionLabel, onAction, id }),
};