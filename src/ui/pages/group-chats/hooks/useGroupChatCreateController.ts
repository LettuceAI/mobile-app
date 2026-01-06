import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { storageBridge } from "../../../../core/storage/files";
import { listCharacters } from "../../../../core/storage/repo";
import type { Character } from "../../../../core/storage/schemas";
import {
  groupChatCreateReducer,
  initialGroupChatCreateState,
} from "../reducers/groupChatCreateReducer";

type GroupChatCreateControllerOptions = {
  onCreated?: (sessionId: string) => void;
};

export function useGroupChatCreateController(options: GroupChatCreateControllerOptions = {}) {
  const { onCreated } = options;
  const [characters, setCharacters] = useState<Character[]>([]);
  const [ui, dispatch] = useReducer(groupChatCreateReducer, initialGroupChatCreateState);

  useEffect(() => {
    let isActive = true;

    (async () => {
      try {
        const chars = await listCharacters();
        if (!isActive) return;
        setCharacters(chars);
      } catch (err) {
        console.error("Failed to load characters:", err);
        if (isActive) dispatch({ type: "set-error", value: "Failed to load characters" });
      } finally {
        if (isActive) dispatch({ type: "set-loading", value: false });
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const setGroupName = useCallback((value: string) => {
    dispatch({ type: "set-group-name", value });
  }, []);

  const toggleCharacter = useCallback((characterId: string) => {
    dispatch({ type: "toggle-character", id: characterId });
  }, []);

  const defaultName = useMemo(() => {
    const selectedChars = characters.filter((c) => ui.selectedIds.has(c.id));
    if (selectedChars.length <= 3) {
      return selectedChars.map((c) => c.name).join(", ");
    }
    return `${selectedChars
      .slice(0, 2)
      .map((c) => c.name)
      .join(", ")} & ${selectedChars.length - 2} others`;
  }, [characters, ui.selectedIds]);

  const handleCreate = useCallback(async () => {
    if (ui.selectedIds.size < 2) {
      dispatch({
        type: "set-error",
        value: "Please select at least 2 characters for a group chat",
      });
      return;
    }

    const name = ui.groupName.trim() || defaultName;

    try {
      dispatch({ type: "set-creating", value: true });
      dispatch({ type: "set-error", value: null });

      const session = await storageBridge.groupSessionCreate(name, Array.from(ui.selectedIds));
      onCreated?.(session.id);
    } catch (err) {
      console.error("Failed to create group session:", err);
      dispatch({ type: "set-error", value: "Failed to create group chat" });
    } finally {
      dispatch({ type: "set-creating", value: false });
    }
  }, [ui.selectedIds, ui.groupName, defaultName, onCreated]);

  return {
    characters,
    ui,
    defaultName,
    setGroupName,
    toggleCharacter,
    handleCreate,
  } as const;
}
