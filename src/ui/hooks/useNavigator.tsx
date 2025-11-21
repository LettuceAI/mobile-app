import { createContext, ReactNode, useCallback, useContext, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type BackMapping = {
  match: (path: string) => boolean;
  target: string;
};

const BACK_MAPPINGS: BackMapping[] = [
  { match: (p) => p.includes("/settings/models") && p.includes("view=advanced"), target: "/settings/models" },
  { match: (p) => p.startsWith("/settings/models/"), target: "/settings/models" },
  { match: (p) => p.startsWith("/settings/providers/"), target: "/settings/providers" },
  { match: (p) => p.startsWith("/settings/prompts/new"), target: "/settings/prompts" },
  { match: (p) => p.startsWith("/settings/prompts/"), target: "/settings/prompts" },
  { match: (p) => p.startsWith("/settings/advanced/memory"), target: "/settings/advanced" },
  { match: (p) => p.startsWith("/settings/embedding-download"), target: "/settings/advanced" },
  { match: (p) => p.startsWith("/settings/embedding-test"), target: "/settings/advanced" },
  { match: (p) => p.startsWith("/settings/security"), target: "/settings" },
  { match: (p) => p.startsWith("/settings/usage"), target: "/settings" },
  { match: (p) => p.startsWith("/settings/changelog"), target: "/settings" },
  { match: (p) => p.startsWith("/settings/developer"), target: "/settings" },
  { match: (p) => p.startsWith("/settings/reset"), target: "/settings" },
  { match: (p) => p.startsWith("/settings/personas/"), target: "/settings/personas" },
  { match: (p) => p.startsWith("/settings/personas"), target: "/settings" },
  { match: (p) => p.startsWith("/settings/characters"), target: "/settings" },
  { match: (p) => p.startsWith("/settings"), target: "/" },
];

function resolveBackTarget(path: string): string | null {
  // Chat settings -> chat detail
  if (path.startsWith("/chat/") && path.includes("/settings")) {
    const parts = path.split("/").filter(Boolean);
    const charId = parts[1];
    if (charId) return `/chat/${charId}`;
  }
  // Chat history -> chat settings
  if (path.startsWith("/chat/") && path.includes("/history")) {
    const parts = path.split("/").filter(Boolean);
    const charId = parts[1];
    if (charId) return `/chat/${charId}/settings`;
  }

  for (const entry of BACK_MAPPINGS) {
    if (entry.match(path)) {
      return entry.target;
    }
  }
  return null;
}

type NavigatorApi = {
  back: () => void;
  canExitApp: (path: string) => boolean;
};

const NavigatorContext = createContext<NavigatorApi | null>(null);

export function NavigatorProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const back = useCallback(() => {
    const currentPath = location.pathname + location.search;
    const target = resolveBackTarget(currentPath);
    if (target) {
      navigate(target);
    } else {
      navigate(-1);
    }
  }, [location.pathname, location.search, navigate]);

  const canExitApp = useCallback((path: string) => {
    return path === "/" || path === "/chat" || path === "/library";
  }, []);

  const value = useMemo(() => ({ back, canExitApp }), [back, canExitApp]);

  return <NavigatorContext.Provider value={value}>{children}</NavigatorContext.Provider>;
}

export function useNavigator(): NavigatorApi {
  const ctx = useContext(NavigatorContext);
  if (!ctx) {
    throw new Error("useNavigator must be used within a NavigatorProvider");
  }
  return ctx;
}
