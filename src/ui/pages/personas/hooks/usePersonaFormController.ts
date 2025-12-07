import { useCallback, useEffect, useReducer, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { getPersona, savePersona } from "../../../../core/storage/repo";
import { loadAvatar, saveAvatar } from "../../../../core/storage/avatars";
import { invalidateAvatarCache } from "../../../hooks/useAvatar";

type PersonaFormState = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  title: string;
  description: string;
  isDefault: boolean;
  avatarPath: string | null;
};

type Action =
  | { type: "set_loading"; payload: boolean }
  | { type: "set_saving"; payload: boolean }
  | { type: "set_error"; payload: string | null }
  | { type: "set_fields"; payload: Partial<Omit<PersonaFormState, "loading" | "saving" | "error">> };

const initialState: PersonaFormState = {
  loading: true,
  saving: false,
  error: null,
  title: "",
  description: "",
  isDefault: false,
  avatarPath: null,
};

function reducer(state: PersonaFormState, action: Action): PersonaFormState {
  switch (action.type) {
    case "set_loading":
      return { ...state, loading: action.payload };
    case "set_saving":
      return { ...state, saving: action.payload };
    case "set_error":
      return { ...state, error: action.payload };
    case "set_fields":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function usePersonaFormController(personaId: string | undefined) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, initialState);

  // Track initial state for change detection
  const initialStateRef = useRef<{
    title: string;
    description: string;
    isDefault: boolean;
    avatarPath: string | null;
  } | null>(null);

  const loadPersona = useCallback(async () => {
    if (!personaId) {
      navigate("/personas");
      return;
    }

    dispatch({ type: "set_loading", payload: true });
    try {
      const persona = await getPersona(personaId);
      if (!persona) {
        navigate("/personas");
        return;
      }

      // Load avatar if it exists
      let avatarDataUrl: string | null = null;
      if (persona.avatarPath) {
        const loadedAvatar = await loadAvatar("persona", personaId, persona.avatarPath);
        avatarDataUrl = loadedAvatar ?? null;
      }

      dispatch({
        type: "set_fields",
        payload: {
          title: persona.title,
          description: persona.description,
          isDefault: persona.isDefault ?? false,
          avatarPath: avatarDataUrl,
        },
      });

      // Store initial state for change detection
      initialStateRef.current = {
        title: persona.title,
        description: persona.description,
        isDefault: persona.isDefault ?? false,
        avatarPath: avatarDataUrl,
      };
      dispatch({ type: "set_error", payload: null });
    } catch (error) {
      console.error("Failed to load persona:", error);
      dispatch({
        type: "set_error",
        payload: "Failed to load persona",
      });
    } finally {
      dispatch({ type: "set_loading", payload: false });
    }
  }, [personaId, navigate]);

  useEffect(() => {
    void loadPersona();
  }, [loadPersona]);

  const setTitle = useCallback((value: string) => {
    dispatch({ type: "set_fields", payload: { title: value } });
  }, []);

  const setDescription = useCallback((value: string) => {
    dispatch({ type: "set_fields", payload: { description: value } });
  }, []);

  const setIsDefault = useCallback((value: boolean) => {
    dispatch({ type: "set_fields", payload: { isDefault: value } });
  }, []);

  const setAvatarPath = useCallback((value: string | null) => {
    dispatch({ type: "set_fields", payload: { avatarPath: value } });
  }, []);

  const handleSave = useCallback(async () => {
    if (!personaId) {
      return;
    }

    const { title, description, isDefault, avatarPath } = state;
    if (!title.trim() || !description.trim()) {
      return;
    }

    dispatch({ type: "set_saving", payload: true });
    dispatch({ type: "set_error", payload: null });

    try {
      // Save avatar if provided
      let avatarFilename: string | undefined = undefined;
      if (avatarPath) {
        avatarFilename = await saveAvatar("persona", personaId, avatarPath);
        if (!avatarFilename) {
          console.error("[EditPersona] Failed to save avatar image");
        } else {
          invalidateAvatarCache("persona", personaId);
        }
      }

      await savePersona({
        id: personaId,
        title: title.trim(),
        description: description.trim(),
        isDefault,
        avatarPath: avatarFilename,
      });

      // Update initial state to match current (for change detection)
      initialStateRef.current = {
        title: title.trim(),
        description: description.trim(),
        isDefault,
        avatarPath,
      };

      // Sync trimmed values
      dispatch({
        type: "set_fields",
        payload: {
          title: title.trim(),
          description: description.trim(),
        },
      });
    } catch (error: any) {
      console.error("Failed to save persona:", error);
      dispatch({
        type: "set_error",
        payload: error?.message || "Failed to save persona",
      });
    } finally {
      dispatch({ type: "set_saving", payload: false });
    }
  }, [personaId, state, navigate]);

  // Compute canSave based on changes from initial state
  const canSave = (() => {
    // Must have name and description
    if (!state.title.trim() || !state.description.trim() || state.saving) return false;

    // If initial state not yet loaded, don't allow save
    const initial = initialStateRef.current;
    if (!initial) return false;

    // Check for actual changes
    const hasChanges =
      state.title !== initial.title ||
      state.description !== initial.description ||
      state.isDefault !== initial.isDefault ||
      state.avatarPath !== initial.avatarPath;

    return hasChanges;
  })();

  return {
    state,
    setTitle,
    setDescription,
    setIsDefault,
    setAvatarPath,
    handleSave,
    canSave,
  };
}
