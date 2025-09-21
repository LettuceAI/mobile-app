import { Moon, Sun } from "lucide-react";

import { useTheme } from "../../core/theme/ThemeContext";

interface ThemeToggleProps {
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "button";
  className?: string;
}

const sizeClasses = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-12 w-12",
} as const;

const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export function ThemeToggle({ size = "md", variant = "icon", className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const iconPalette =
    theme === "dark"
      ? "border-white/10 bg-white/10 text-white hover:border-white/30 hover:bg-white/20"
      : "border-black/10 bg-black/5 text-gray-900 hover:border-black/20 hover:bg-black/10";

  if (variant === "icon") {
    return (
      <button
        onClick={toggleTheme}
        className={`${sizeClasses[size]} rounded-full border transition-all duration-200 ${iconPalette} ${className}`}
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      >
        {theme === "light" ? (
          <Moon size={iconSizes[size]} />
        ) : (
          <Sun size={iconSizes[size]} />
        )}
      </button>
    );
  }

  const buttonPalette =
    theme === "dark"
      ? "border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/20"
      : "border-black/10 bg-black/5 text-gray-900 hover:border-black/20 hover:bg-black/10";

  return (
    <button
      onClick={toggleTheme}
      className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-medium transition-all duration-200 ${buttonPalette} ${className}`}
    >
      {theme === "light" ? (
        <>
          <Moon size={iconSizes[size]} />
          Dark mode
        </>
      ) : (
        <>
          <Sun size={iconSizes[size]} />
          Light mode
        </>
      )}
    </button>
  );
}
