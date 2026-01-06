import { useCallback, useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { storageBridge } from "../../../../core/storage/files";
import { listCharacters } from "../../../../core/storage/repo";
import type { GroupSessionPreview, Character } from "../../../../core/storage/schemas";

export function useGroupChatsListController() {
  const [groupSessions, setGroupSessions] = useState<GroupSessionPreview[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<GroupSessionPreview | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sessions, chars] = await Promise.all([
        storageBridge.groupSessionsList(),
        listCharacters(),
      ]);
      setGroupSessions(sessions);
      setCharacters(chars);
    } catch (err) {
      console.error("Failed to load group sessions:", err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadData();
      } finally {
        setLoading(false);
      }
    })();

    let unlisten: UnlistenFn | null = null;
    (async () => {
      unlisten = await listen("database-reloaded", () => {
        console.log("Database reloaded, refreshing group sessions...");
        void loadData();
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [loadData]);

  const handleDelete = useCallback(async () => {
    if (!selectedSession) return;

    try {
      setDeleting(true);
      await storageBridge.groupSessionDelete(selectedSession.id);
      await loadData();
      setShowDeleteConfirm(false);
      setSelectedSession(null);
    } catch (err) {
      console.error("Failed to delete group session:", err);
    } finally {
      setDeleting(false);
    }
  }, [selectedSession, loadData]);

  return {
    groupSessions,
    characters,
    loading,
    selectedSession,
    showDeleteConfirm,
    deleting,
    setSelectedSession,
    setShowDeleteConfirm,
    handleDelete,
  } as const;
}
