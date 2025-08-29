import { invoke } from "@tauri-apps/api/core";
import { localStorage_ } from "./localstorage";
import { dataFiles } from "./files";

export class ResetManager {
  static async clearAppFiles(): Promise<void> {
    try {
      const filesToRemove = [
        dataFiles.settings,
        dataFiles.characters,
        dataFiles.sessionsIndex,
      ];

      for (const file of filesToRemove) {
        try {
          await invoke("write_app_file", { path: file, content: "" });
          console.log(`Cleared file: ${file}`);
        } catch (error) {
          console.warn(`Failed to clear file ${file}:`, error);
        }
      }

      try {
        const sessionsIndexText = await invoke<string>("read_app_file", { path: dataFiles.sessionsIndex });
        const sessionIds = JSON.parse(sessionsIndexText || "[]") as string[];
        
        for (const sessionId of sessionIds) {
          try {
            const sessionFile = dataFiles.session(sessionId);
            await invoke("write_app_file", { path: sessionFile, content: "" });
            console.log(`Cleared session file: ${sessionFile}`);
          } catch (error) {
            console.warn(`Failed to clear session ${sessionId}:`, error);
          }
        }
      } catch (error) {
        console.warn("Failed to clear session files:", error);
      }

      console.log("App files cleared successfully");
    } catch (error) {
      console.error("Failed to clear app files:", error);
      throw new Error("Failed to clear app files. Please try again.");
    }
  }

  static clearLocalStorage(): void {
    try {
      localStorage_.clearAll();
      console.log("localStorage cleared successfully");
    } catch (error) {
      console.error("Failed to clear localStorage:", error);
      throw new Error("Failed to clear localStorage. Please try again.");
    }
  }

  static async resetAllData(): Promise<void> {
    try {
      this.clearLocalStorage();
      
      await this.clearAppFiles();
      
      console.log("All app data reset successfully");
    } catch (error) {
      console.error("Failed to reset all data:", error);
      throw error;
    }
  }

  static async getResetSummary(): Promise<{
    localStorageItems: Record<string, string | null>;
    fileCount: number;
    estimatedSessions: number;
  }> {
    const localStorageItems = localStorage_.getAll();
    
    let sessionCount = 0;
    try {
      const sessionsIndexText = await invoke<string>("read_app_file", { path: dataFiles.sessionsIndex });
      const sessionIds = JSON.parse(sessionsIndexText || "[]") as string[];
      sessionCount = sessionIds.length;
    } catch { }

    return {
      localStorageItems,
      fileCount: 3, 
      estimatedSessions: sessionCount,
    };
  }
}
