import { useCallback, useEffect, useReducer, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { listCharacters, saveCharacter, readSettings } from "../../../../core/storage/repo";
import type { Model, Scene, SystemPromptTemplate } from "../../../../core/storage/schemas";
import { processBackgroundImage } from "../../../../core/utils/image";
import { convertToImageRef } from "../../../../core/storage/images";
import { saveAvatar, loadAvatar } from "../../../../core/storage/avatars";
import { listPromptTemplates } from "../../../../core/prompts/service";
import { invalidateAvatarCache } from "../../../hooks/useAvatar";
import { exportCharacter, downloadJson, generateExportFilename } from "../../../../core/storage/characterTransfer";

type EditCharacterState = {
  loading: boolean;
  saving: boolean;
  exporting: boolean;
  error: string | null;
  name: string;
  description: string;
  avatarPath: string;
  backgroundImagePath: string;
  scenes: Scene[];
  defaultSceneId: string | null;
  newSceneContent: string;
  selectedModelId: string | null;

  disableAvatarGradient: boolean;
  customGradientEnabled: boolean;
  customGradientColors: string[];
  customTextColor: string;
  customTextSecondary: string;
  memoryType: "manual" | "dynamic";
  dynamicMemoryEnabled: boolean;
  models: Model[];
  loadingModels: boolean;
  promptTemplates: SystemPromptTemplate[];
  loadingTemplates: boolean;
  editingSceneId: string | null;
  editingSceneContent: string;
};

type EditCharacterAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SAVING"; payload: boolean }
  | { type: "SET_EXPORTING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_FIELDS"; payload: Partial<EditCharacterState> };

const initialState: EditCharacterState = {
  loading: true,
  saving: false,
  exporting: false,
  error: null,
  name: "",
  description: "",
  avatarPath: "",
  backgroundImagePath: "",
  scenes: [],
  defaultSceneId: null,
  newSceneContent: "",
  selectedModelId: null,

  disableAvatarGradient: false,
  customGradientEnabled: false,
  customGradientColors: [],
  customTextColor: "",
  customTextSecondary: "",
  memoryType: "manual",
  dynamicMemoryEnabled: false,
  models: [],
  loadingModels: false,
  promptTemplates: [],
  loadingTemplates: false,
  editingSceneId: null,
  editingSceneContent: "",
};

function reducer(state: EditCharacterState, action: EditCharacterAction): EditCharacterState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_SAVING":
      return { ...state, saving: action.payload };
    case "SET_EXPORTING":
      return { ...state, exporting: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_FIELDS":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function useEditCharacterForm(characterId: string | undefined) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, initialState);
  const avatarInitial = state.name.trim().charAt(0).toUpperCase() || "?";

  const setError = useCallback((value: string | null) => dispatch({ type: "SET_ERROR", payload: value }), []);
  const setSaving = useCallback((value: boolean) => dispatch({ type: "SET_SAVING", payload: value }), []);
  const setExporting = useCallback((value: boolean) => dispatch({ type: "SET_EXPORTING", payload: value }), []);
  const setLoading = useCallback((value: boolean) => dispatch({ type: "SET_LOADING", payload: value }), []);
  const setFields = useCallback(
    (payload: Partial<EditCharacterState>) => dispatch({ type: "SET_FIELDS", payload }),
    []
  );

  // Auto-set default scene if there's only one scene
  useEffect(() => {
    if (state.scenes.length === 1 && !state.defaultSceneId) {
      setFields({ defaultSceneId: state.scenes[0].id });
    }
  }, [state.scenes, state.defaultSceneId, setFields]);

  useEffect(() => {
    if (!state.dynamicMemoryEnabled && state.memoryType !== "manual") {
      setFields({ memoryType: "manual" });
    }
  }, [setFields, state.dynamicMemoryEnabled, state.memoryType]);

  const loadCharacter = useCallback(async () => {
    if (!characterId) return;

    try {
      setLoading(true);
      const allCharacters = await listCharacters();
      const character = allCharacters.find(c => c.id === characterId);
      if (!character) {
        navigate("/chat");
        return;
      }

      let loadedAvatarPath = "";
      let backgroundImage = character.backgroundImagePath || "";

      if (character.avatarPath) {
        try {
          const avatarUrl = await loadAvatar("character", character.id, character.avatarPath);
          loadedAvatarPath = avatarUrl || "";
        } catch (err) {
          console.warn("Failed to load avatar:", err);
          loadedAvatarPath = "";
        }
      } else {
        loadedAvatarPath = "";
      }

      if (backgroundImage && !backgroundImage.startsWith("data:") && backgroundImage.length === 36) {
        try {
          const { convertToImageUrl } = await import("../../../../core/storage/images");
          const assetUrl = await convertToImageUrl(backgroundImage);
          backgroundImage = assetUrl || backgroundImage;
        } catch (err) {
          console.warn("Failed to convert background image ID to URL:", err);
        }
      }

      setFields({
        name: character.name,
        description: character.description || "",
        avatarPath: loadedAvatarPath,
        backgroundImagePath: backgroundImage,
        scenes: character.scenes || [],
        defaultSceneId: character.defaultSceneId || null,
        selectedModelId: character.defaultModelId || null,

        disableAvatarGradient: character.disableAvatarGradient || false,
        customGradientEnabled: character.customGradientEnabled || false,
        customGradientColors: character.customGradientColors || [],
        customTextColor: character.customTextColor || "",
        customTextSecondary: character.customTextSecondary || "",
        memoryType: character.memoryType === "dynamic" ? "dynamic" : "manual",
      });
      setError(null);
    } catch (err) {
      console.error("Failed to load character:", err);
      setError("Failed to load character");
    } finally {
      setLoading(false);
    }
  }, [characterId, navigate, setError, setFields, setLoading]);

  const loadModels = useCallback(async () => {
    try {
      setFields({ loadingModels: true });
      const settings = await readSettings();
      const dynamicEnabled = settings.advancedSettings?.dynamicMemory?.enabled ?? false;
      setFields({
        models: settings.models,
        dynamicMemoryEnabled: dynamicEnabled,
        memoryType: dynamicEnabled ? state.memoryType : "manual",
      });
    } catch (err) {
      console.error("Failed to load models:", err);
    } finally {
      setFields({ loadingModels: false });
    }
  }, [setFields, state.memoryType]);

  const loadPromptTemplates = useCallback(async () => {
    try {
      setFields({ loadingTemplates: true });
      // Global list (scopes removed)
      const templates = await listPromptTemplates();
      setFields({ promptTemplates: templates });
    } catch (err) {
      console.error("Failed to load prompt templates:", err);
    } finally {
      setFields({ loadingTemplates: false });
    }
  }, [setFields]);

  useEffect(() => {
    if (!characterId) {
      navigate("/chat");
      return;
    }

    void loadCharacter();
    void loadModels();
    void loadPromptTemplates();
  }, [characterId, loadCharacter, loadModels, loadPromptTemplates, navigate]);

  const handleSave = useCallback(async () => {
    if (!characterId || !state.name.trim() || !state.description.trim()) return;

    try {
      setSaving(true);
      setError(null);

      // Save avatar using new centralized system if it's a new upload (data URL)
      let avatarFilename: string | undefined = undefined;
      if (state.avatarPath) {
        if (state.avatarPath.startsWith("data:")) {
          avatarFilename = await saveAvatar("character", characterId, state.avatarPath);
          if (!avatarFilename) {
            console.error("[EditCharacter] Failed to save avatar image");
          } else {
            invalidateAvatarCache("character", characterId);
          }
        } else {
          avatarFilename = state.avatarPath;
        }
      } else {
        invalidateAvatarCache("character", characterId);
      }

      const backgroundImageId = state.backgroundImagePath
        ? (state.backgroundImagePath.startsWith("data:") ? await convertToImageRef(state.backgroundImagePath) : state.backgroundImagePath)
        : undefined;

      await saveCharacter({
        id: characterId,
        name: state.name.trim(),
        description: state.description.trim(),
        avatarPath: avatarFilename,
        backgroundImagePath: backgroundImageId,
        scenes: state.scenes,
        defaultSceneId: state.defaultSceneId,
        defaultModelId: state.selectedModelId,

        disableAvatarGradient: state.disableAvatarGradient,
        customGradientEnabled: state.customGradientEnabled,
        customGradientColors: state.customGradientColors.length > 0 ? state.customGradientColors : undefined,
        customTextColor: state.customTextColor || undefined,
        customTextSecondary: state.customTextSecondary || undefined,
        memoryType: state.dynamicMemoryEnabled ? state.memoryType : "manual",
      });

      navigate("/chat");
    } catch (err: any) {
      console.error("Failed to save character:", err);
      setError(err?.message || "Failed to save character");
    } finally {
      setSaving(false);
    }
  }, [characterId, navigate, setError, setSaving, state]);

  const handleExport = useCallback(async () => {
    if (!characterId) return;

    try {
      setExporting(true);
      setError(null);

      const exportJson = await exportCharacter(characterId);
      const filename = generateExportFilename(state.name || "character");
      await downloadJson(exportJson, filename);
    } catch (err: any) {
      console.error("Failed to export character:", err);
      setError(err?.message || "Failed to export character");
    } finally {
      setExporting(false);
    }
  }, [characterId, setError, setExporting, state.name]);

  const addScene = useCallback(() => {
    if (!state.newSceneContent.trim()) return;

    const sceneId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const timestamp = Date.now();

    const newScenes = [...state.scenes, {
      id: sceneId,
      content: state.newSceneContent.trim(),
      createdAt: timestamp,
    }];

    setFields({
      scenes: newScenes,
      defaultSceneId: newScenes.length === 1 ? sceneId : state.defaultSceneId,
      newSceneContent: "",
    });
  }, [setFields, state.defaultSceneId, state.newSceneContent, state.scenes]);

  const deleteScene = useCallback((sceneId: string) => {
    const newScenes = state.scenes.filter(s => s.id !== sceneId);
    const nextDefaultSceneId = state.defaultSceneId === sceneId
      ? (newScenes.length === 1 ? newScenes[0].id : null)
      : state.defaultSceneId;

    setFields({ scenes: newScenes, defaultSceneId: nextDefaultSceneId });
  }, [setFields, state.defaultSceneId, state.scenes]);

  const startEditingScene = useCallback((scene: Scene) => {
    setFields({ editingSceneId: scene.id, editingSceneContent: scene.content });
  }, [setFields]);

  const saveEditedScene = useCallback(() => {
    if (!state.editingSceneId || !state.editingSceneContent.trim()) return;

    const updatedScenes = state.scenes.map(scene =>
      scene.id === state.editingSceneId
        ? { ...scene, content: state.editingSceneContent.trim() }
        : scene
    );

    setFields({
      scenes: updatedScenes,
      editingSceneId: null,
      editingSceneContent: "",
    });
  }, [setFields, state.editingSceneContent, state.editingSceneId, state.scenes]);

  const cancelEditingScene = useCallback(() => {
    setFields({ editingSceneId: null, editingSceneContent: "" });
  }, [setFields]);

  const handleBackgroundImageUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const input = event.target;
    void processBackgroundImage(file)
      .then((dataUrl: string) => {
        setFields({ backgroundImagePath: dataUrl });
      })
      .catch((error: any) => {
        console.warn("EditCharacter: failed to process background image", error);
      })
      .finally(() => {
        input.value = "";
      });
  }, [setFields]);

  const handleAvatarUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setFields({ avatarPath: reader.result as string });
    };
    reader.readAsDataURL(file);

    // Clear input so same file can be selected again
    event.target.value = "";
  }, [setFields]);

  return {
    state,
    actions: {
      setFields,
      handleSave,
      handleExport,
      addScene,
      deleteScene,
      startEditingScene,
      saveEditedScene,
      cancelEditingScene,
      handleBackgroundImageUpload,
      handleAvatarUpload,
    },
    computed: {
      avatarInitial,
      canSave: state.name.trim().length > 0 && state.description.trim().length > 0 && !state.saving,
    },
  };
}
