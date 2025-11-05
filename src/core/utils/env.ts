/**
 * Detect if the app is running in development mode
 * In Tauri, we can use the Vite environment variable or check the build mode
 */
export function isDevelopmentMode(): boolean {
  // Check Vite's environment mode
  return import.meta.env.DEV;
}

/**
 * Get the current environment (development, production, etc.)
 */
export function getEnvironment(): string {
  return import.meta.env.MODE;
}
