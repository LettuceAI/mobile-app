import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "../design-tokens";

type ToastVariant = "info" | "warning" | "success" | "error";

const baseClassName =
  "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-lg";

const titleClassName = "text-sm font-semibold leading-tight";
const descriptionClassName = "text-xs text-current opacity-80";

const variantClasses: Record<ToastVariant, string> = {
  info: "border-sky-400/30 bg-sky-500/15 text-sky-100 shadow-sky-500/20",
  warning: "border-amber-400/30 bg-amber-500/15 text-amber-100 shadow-amber-500/20",
  success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100 shadow-emerald-500/20",
  error: "border-red-400/30 bg-red-500/15 text-red-100 shadow-red-500/20",
};

const variantIcons: Record<ToastVariant, ReactNode> = {
  info: <Info className="h-4 w-4 text-sky-200" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-200" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-200" />,
  error: <XCircle className="h-4 w-4 text-red-200" />,
};

function showToast(variant: ToastVariant, title: string, description?: string) {
  return sonnerToast(<span className={titleClassName}>{title}</span>, {
    description,
    icon: variantIcons[variant],
    className: cn(baseClassName, variantClasses[variant]),
    descriptionClassName,
    unstyled: true,
    duration: 8000,
  });
}

export const toast = {
  info: (title: string, description?: string) => showToast("info", title, description),
  warning: (title: string, description?: string) => showToast("warning", title, description),
  success: (title: string, description?: string) => showToast("success", title, description),
  error: (title: string, description?: string) => showToast("error", title, description),
};
