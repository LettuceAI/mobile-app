import { readSettings, writeSettings } from "./repo";
import { createDefaultAppState, type AppState } from "./schemas";

type Theme = AppState["theme"];

function cloneAppState(state?: AppState): AppState {
  const source = state ?? createDefaultAppState();
  return {
    onboarding: { ...source.onboarding },
    theme: source.theme,
    tooltips: { ...source.tooltips },
    pureModeEnabled: source.pureModeEnabled,
  };
}

async function saveAppState(nextState: AppState): Promise<AppState> {
  const settings = await readSettings();
  const updated = cloneAppState(nextState);
  await writeSettings({ ...settings, appState: updated });
  return cloneAppState(updated);
}

async function withAppState(mutator: (draft: AppState) => void): Promise<AppState> {
  const settings = await readSettings();
  const draft = cloneAppState(settings.appState);
  mutator(draft);
  await writeSettings({ ...settings, appState: draft });
  return cloneAppState(draft);
}

export async function getAppState(): Promise<AppState> {
  const settings = await readSettings();
  return cloneAppState(settings.appState);
}

export async function resetAppState(): Promise<AppState> {
  return saveAppState(createDefaultAppState());
}

export async function isOnboardingCompleted(): Promise<boolean> {
  const state = await getAppState();
  return state.onboarding.completed;
}

export async function setOnboardingCompleted(completed: boolean = true): Promise<void> {
  await withAppState((state) => {
    state.onboarding.completed = completed;
    if (completed) {
      state.onboarding.skipped = false;
    }
  });
}

export async function isOnboardingSkipped(): Promise<boolean> {
  const state = await getAppState();
  return state.onboarding.skipped;
}

export async function setOnboardingSkipped(skipped: boolean = true): Promise<void> {
  await withAppState((state) => {
    state.onboarding.skipped = skipped;
    if (skipped) {
      state.onboarding.completed = true;
    }
  });
}

export async function isProviderSetupCompleted(): Promise<boolean> {
  const state = await getAppState();
  return state.onboarding.providerSetupCompleted;
}

export async function setProviderSetupCompleted(completed: boolean = true): Promise<void> {
  await withAppState((state) => {
    state.onboarding.providerSetupCompleted = completed;
    if (!completed) {
      state.onboarding.completed = false;
      state.onboarding.skipped = false;
    }
  });
}

export async function isModelSetupCompleted(): Promise<boolean> {
  const state = await getAppState();
  return state.onboarding.modelSetupCompleted;
}

export async function setModelSetupCompleted(completed: boolean = true): Promise<void> {
  await withAppState((state) => {
    state.onboarding.modelSetupCompleted = completed;
    if (!completed) {
      state.onboarding.completed = false;
      state.onboarding.skipped = false;
    }
  });
}

export async function getTheme(): Promise<Theme> {
  const state = await getAppState();
  return state.theme;
}

export async function setTheme(theme: Theme): Promise<void> {
  await withAppState((state) => {
    state.theme = theme;
  });
}

export async function hasSeenTooltip(id: string): Promise<boolean> {
  const state = await getAppState();
  return Boolean(state.tooltips[id]);
}

export async function setTooltipSeen(id: string, seen: boolean = true): Promise<void> {
  await withAppState((state) => {
    if (seen) {
      state.tooltips[id] = true;
    } else {
      delete state.tooltips[id];
    }
  });
}

export async function clearTooltipState(): Promise<void> {
  await withAppState((state) => {
    state.tooltips = {};
  });
}

export async function getAppStateSummary(): Promise<{
  onboarding: AppState["onboarding"];
  theme: Theme;
  tooltipCount: number;
}> {
  const state = await getAppState();
  return {
    onboarding: { ...state.onboarding },
    theme: state.theme,
    tooltipCount: Object.keys(state.tooltips).length,
  };
}
