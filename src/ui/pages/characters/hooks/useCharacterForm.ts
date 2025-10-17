import { useReducer, useEffect, useCallback } from "react";
import { readSettings, saveCharacter, convertToImageRef } from "../../../../core/storage";
import type { Model, Scene } from "../../../../core/storage/schemas";

import { processBackgroundImage } from "../../../../core/utils/image";
export enum Step {
  Identity = 1,
  StartingScene = 2,
  Description = 3,
}

interface CharacterFormState {
  // Form data
  step: Step;
  name: string;
  avatarPath: string;
  backgroundImagePath: string;
  scenes: Scene[];
  defaultSceneId: string | null;
  description: string;
  selectedModelId: string | null;
  
  // Models
  models: Model[];
  loadingModels: boolean;
  
  // UI state
  saving: boolean;
  error: string | null;
}

type CharacterFormAction =
  | { type: 'SET_STEP'; payload: Step }
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_AVATAR_PATH'; payload: string }
  | { type: 'SET_BACKGROUND_IMAGE_PATH'; payload: string }
  | { type: 'SET_SCENES'; payload: Scene[] }
  | { type: 'SET_DEFAULT_SCENE_ID'; payload: string | null }
  | { type: 'SET_DESCRIPTION'; payload: string }
  | { type: 'SET_SELECTED_MODEL_ID'; payload: string | null }
  | { type: 'SET_MODELS'; payload: Model[] }
  | { type: 'SET_LOADING_MODELS'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_FORM' };

const initialState: CharacterFormState = {
  step: Step.Identity,
  name: '',
  avatarPath: '',
  backgroundImagePath: '',
  scenes: [],
  defaultSceneId: null,
  description: '',
  selectedModelId: null,
  models: [],
  loadingModels: true,
  saving: false,
  error: null,
};

function characterFormReducer(
  state: CharacterFormState,
  action: CharacterFormAction
): CharacterFormState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'SET_NAME':
      return { ...state, name: action.payload };
    case 'SET_AVATAR_PATH':
      return { ...state, avatarPath: action.payload };
    case 'SET_BACKGROUND_IMAGE_PATH':
      return { ...state, backgroundImagePath: action.payload };
    case 'SET_SCENES':
      return { ...state, scenes: action.payload };
    case 'SET_DEFAULT_SCENE_ID':
      return { ...state, defaultSceneId: action.payload };
    case 'SET_DESCRIPTION':
      return { ...state, description: action.payload };
    case 'SET_SELECTED_MODEL_ID':
      return { ...state, selectedModelId: action.payload };
    case 'SET_MODELS':
      return { ...state, models: action.payload };
    case 'SET_LOADING_MODELS':
      return { ...state, loadingModels: action.payload };
    case 'SET_SAVING':
      return { ...state, saving: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'RESET_FORM':
      return initialState;
    default:
      return state;
  }
}

export function useCharacterForm() {
  const [state, dispatch] = useReducer(characterFormReducer, initialState);

  // Load models on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const settings = await readSettings();
        if (cancelled) return;
        
        dispatch({ type: 'SET_MODELS', payload: settings.models });
        const defaultId = settings.defaultModelId ?? settings.models[0]?.id ?? null;
        dispatch({ type: 'SET_SELECTED_MODEL_ID', payload: defaultId });
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        if (!cancelled) {
          dispatch({ type: 'SET_LOADING_MODELS', payload: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Actions
  const setStep = useCallback((step: Step) => {
    dispatch({ type: 'SET_STEP', payload: step });
  }, []);

  const setName = useCallback((name: string) => {
    dispatch({ type: 'SET_NAME', payload: name });
  }, []);

  const setAvatarPath = useCallback((path: string) => {
    dispatch({ type: 'SET_AVATAR_PATH', payload: path });
  }, []);

  const setBackgroundImagePath = useCallback((path: string) => {
    dispatch({ type: 'SET_BACKGROUND_IMAGE_PATH', payload: path });
  }, []);

  const setScenes = useCallback((scenes: Scene[]) => {
    dispatch({ type: 'SET_SCENES', payload: scenes });
  }, []);

  const setDefaultSceneId = useCallback((id: string | null) => {
    dispatch({ type: 'SET_DEFAULT_SCENE_ID', payload: id });
  }, []);

  const setDescription = useCallback((description: string) => {
    dispatch({ type: 'SET_DESCRIPTION', payload: description });
  }, []);

  const setSelectedModelId = useCallback((id: string | null) => {
    dispatch({ type: 'SET_SELECTED_MODEL_ID', payload: id });
  }, []);

  const handleAvatarUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      dispatch({ type: 'SET_AVATAR_PATH', payload: reader.result as string });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleBackgroundImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const input = event.target;
    void processBackgroundImage(file)
      .then((dataUrl: any) => {
        dispatch({ type: 'SET_BACKGROUND_IMAGE_PATH', payload: dataUrl });
      })
      .catch((error: any) => {
        console.warn("CharacterForm: failed to process background image", error);
      })
      .finally(() => {
        input.value = "";
      });
  }, []);

  const handleSave = useCallback(async () => {
    if (state.description.trim().length === 0 || state.selectedModelId === null || state.saving || state.scenes.length === 0) {
      return;
    }

    try {
      dispatch({ type: 'SET_SAVING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      console.log("[CreateCharacter] Saving with avatarPath:", state.avatarPath ? "present" : "empty");
      console.log("[CreateCharacter] Saving with backgroundImagePath:", state.backgroundImagePath ? "present" : "empty");
      
      // Convert base64 images to image IDs before saving
      let avatarImageId: string | undefined = undefined;
      if (state.avatarPath) {
        avatarImageId = await convertToImageRef(state.avatarPath);
        if (!avatarImageId) {
          console.error("[CreateCharacter] Failed to save avatar image");
        }
      }
      
      let backgroundImageId: string | undefined = undefined;
      if (state.backgroundImagePath) {
        backgroundImageId = await convertToImageRef(state.backgroundImagePath);
        if (!backgroundImageId) {
          console.error("[CreateCharacter] Failed to save background image");
        }
      }
      
      console.log("[CreateCharacter] Avatar image ID:", avatarImageId || "none");
      console.log("[CreateCharacter] Background image ID:", backgroundImageId || "none");
      
      const characterData = {
        name: state.name.trim(),
        avatarPath: avatarImageId || undefined,
        backgroundImagePath: backgroundImageId || undefined,
        description: state.description.trim(),
        scenes: state.scenes,
        defaultSceneId: state.defaultSceneId || state.scenes[0]?.id || null,
        defaultModelId: state.selectedModelId,
      };
      
      console.log("[CreateCharacter] Saving character data:", JSON.stringify(characterData, null, 2));
      
      await saveCharacter(characterData);

      return true; // Success
    } catch (e: any) {
      console.error("Failed to save character:", e);
      dispatch({ type: 'SET_ERROR', payload: e?.message || "Failed to save character" });
      return false; // Failure
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.name, state.avatarPath, state.backgroundImagePath, state.scenes, state.defaultSceneId, state.description, state.selectedModelId, state.saving]);

  // Computed values
  const canContinueIdentity = state.name.trim().length > 0 && !state.saving;
  const canContinueStartingScene = state.scenes.length > 0 && !state.saving;
  const canSaveDescription = state.description.trim().length > 0 && state.selectedModelId !== null && !state.saving;
  const progress = state.step === Step.Identity ? 0.33 : state.step === Step.StartingScene ? 0.66 : 1;

  return {
    state,
    actions: {
      setStep,
      setName,
      setAvatarPath,
      setBackgroundImagePath,
      setScenes,
      setDefaultSceneId,
      setDescription,
      setSelectedModelId,
      handleAvatarUpload,
      handleBackgroundImageUpload,
      handleSave,
    },
    computed: {
      canContinueIdentity,
      canContinueStartingScene,
      canSaveDescription,
      progress,
    },
  };
}
