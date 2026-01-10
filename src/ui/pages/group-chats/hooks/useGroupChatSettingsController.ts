import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { storageBridge } from "../../../../core/storage/files";
import { listCharacters, listPersonas } from "../../../../core/storage/repo";
import type {
  GroupSession,
  GroupParticipation,
  Character,
  Persona,
} from "../../../../core/storage/schemas";
import {
  groupChatSettingsUiReducer,
  initialGroupChatSettingsUiState,
} from "../reducers/groupChatSettingsReducer";

export function useGroupChatSettingsController(groupSessionId?: string) {
  const [session, setSession] = useState<GroupSession | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [participationStats, setParticipationStats] = useState<GroupParticipation[]>([]);
  const [messageCount, setMessageCount] = useState<number>(0);
  const [ui, dispatch] = useReducer(groupChatSettingsUiReducer, initialGroupChatSettingsUiState);

  const setUi = useCallback((patch: Partial<typeof ui>) => {
    dispatch({ type: "PATCH", patch });
  }, []);

  const loadData = useCallback(async () => {
    if (!groupSessionId) return;

    try {
      setUi({ loading: true, error: null });
      const [sessionData, allChars, personaList, stats, msgCount] = await Promise.all([
        storageBridge.groupSessionGet(groupSessionId),
        listCharacters(),
        listPersonas(),
        storageBridge.groupParticipationStats(groupSessionId),
        storageBridge.groupMessageCount(groupSessionId),
      ]);

      if (!sessionData) {
        setUi({ error: "Group session not found" });
        return;
      }

      setSession(sessionData);
      setCharacters(allChars);
      setPersonas(personaList);
      setParticipationStats(stats);
      setMessageCount(msgCount);
      setUi({ nameDraft: sessionData.name });
    } catch (err) {
      console.error("Failed to load group chat settings:", err);
      setUi({ error: "Failed to load group chat settings" });
    } finally {
      setUi({ loading: false });
    }
  }, [groupSessionId, setUi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const groupCharacters = useMemo(() => {
    if (!session) return [];
    return session.characterIds
      .map((id) => characters.find((c) => c.id === id))
      .filter(Boolean) as Character[];
  }, [session, characters]);

  const availableCharacters = useMemo(() => {
    if (!session) return [];
    return characters.filter((c) => !session.characterIds.includes(c.id));
  }, [session, characters]);

  const currentPersona = useMemo(() => {
    if (!session?.personaId) return null;
    return personas.find((p) => p.id === session.personaId) || null;
  }, [session, personas]);

  const currentPersonaDisplay = useMemo(() => {
    if (!session?.personaId) return "No persona";
    if (!currentPersona) return "Custom persona";
    return currentPersona.isDefault ? `${currentPersona.title} (default)` : currentPersona.title;
  }, [currentPersona, session?.personaId]);

  const handleSaveName = useCallback(async () => {
    if (!session || !ui.nameDraft.trim()) return;

    try {
      setUi({ saving: true });
      const updated = await storageBridge.groupSessionUpdate(
        session.id,
        ui.nameDraft.trim(),
        session.characterIds,
        session.personaId,
      );
      setSession(updated);
      setUi({ editingName: false });
    } catch (err) {
      console.error("Failed to save name:", err);
    } finally {
      setUi({ saving: false });
    }
  }, [session, ui.nameDraft, setUi]);

  const handleChangePersona = useCallback(
    async (personaId: string | null) => {
      if (!session) return;

      try {
        setUi({ saving: true });
        const updated = await storageBridge.groupSessionUpdate(
          session.id,
          session.name,
          session.characterIds,
          personaId,
        );
        setSession(updated);
        setUi({ showPersonaSelector: false });
      } catch (err) {
        console.error("Failed to change persona:", err);
      } finally {
        setUi({ saving: false });
      }
    },
    [session],
  );

  const handleAddCharacter = useCallback(
    async (characterId: string) => {
      if (!session) return;

      try {
        setUi({ saving: true });
        const updated = await storageBridge.groupSessionAddCharacter(session.id, characterId);
        setSession(updated);
        setUi({ showAddCharacter: false });
      } catch (err) {
        console.error("Failed to add character:", err);
      } finally {
        setUi({ saving: false });
      }
    },
    [session, setUi],
  );

  const handleRemoveCharacter = useCallback(
    async (characterId: string) => {
      if (!session) return;

      if (session.characterIds.length <= 2) {
        setUi({ showRemoveConfirm: null });
        return;
      }

      try {
        setUi({ saving: true });
        const updated = await storageBridge.groupSessionRemoveCharacter(session.id, characterId);
        setSession(updated);
        setUi({ showRemoveConfirm: null });
      } catch (err) {
        console.error("Failed to remove character:", err);
      } finally {
        setUi({ saving: false });
      }
    },
    [session, setUi],
  );

  const getParticipationPercent = useCallback(
    (characterId: string) => {
      if (!participationStats.length) return 0;
      const total = participationStats.reduce((sum, stat) => sum + stat.speakCount, 0);
      const stat = participationStats.find((s) => s.characterId === characterId);
      if (!stat || total === 0) return 0;
      return Math.round((stat.speakCount / total) * 100);
    },
    [participationStats],
  );

  const setEditingName = useCallback((value: boolean) => setUi({ editingName: value }), [setUi]);
  const setNameDraft = useCallback((value: string) => setUi({ nameDraft: value }), [setUi]);
  const setShowPersonaSelector = useCallback(
    (value: boolean) => setUi({ showPersonaSelector: value }),
    [setUi],
  );
  const setShowAddCharacter = useCallback(
    (value: boolean) => setUi({ showAddCharacter: value }),
    [setUi],
  );
  const setShowRemoveConfirm = useCallback(
    (value: string | null) => setUi({ showRemoveConfirm: value }),
    [setUi],
  );

  return {
    session,
    characters,
    personas,
    participationStats,
    messageCount,
    groupCharacters,
    availableCharacters,
    currentPersona,
    currentPersonaDisplay,
    ui,
    setEditingName,
    setNameDraft,
    setShowPersonaSelector,
    setShowAddCharacter,
    setShowRemoveConfirm,
    handleSaveName,
    handleChangePersona,
    handleAddCharacter,
    handleRemoveCharacter,
    getParticipationPercent,
  } as const;
}
