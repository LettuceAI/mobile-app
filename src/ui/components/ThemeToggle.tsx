import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../core/theme/ThemeContext";

interface ThemeToggleProps {
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "button";
  className?: string;
}

export function ThemeToggle({ size = "md", variant = "icon", className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10", 
    lg: "w-12 h-12"
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24
  };

  if (variant === "icon") {
    return (
      <button
        onClick={toggleTheme}
        className={`${sizeClasses[size]} rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-center ${className}`}
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

  return (
    <button
      onClick={toggleTheme}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors ${className}`}
    >
      {theme === "light" ? (
        <>
          <Moon size={iconSizes[size]} />
          <span>Dark Mode</span>
        </>
      ) : (
        <>
          <Sun size={iconSizes[size]} />
          <span>Light Mode</span>
        </>
      )}
    </button>
  );
}
