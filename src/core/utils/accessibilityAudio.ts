import sendSoundUrl from "../../assets/audio/send.mp3";
import successSoundUrl from "../../assets/audio/success.mp3";
import failSoundUrl from "../../assets/audio/fail.mp3";
import type { AccessibilitySettings } from "../storage/schemas";

export type AccessibilitySoundType = keyof AccessibilitySettings;

const soundUrls: Record<AccessibilitySoundType, string> = {
  send: sendSoundUrl,
  success: successSoundUrl,
  failure: failSoundUrl,
};

function clampVolume(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function playAccessibilitySound(
  type: AccessibilitySoundType,
  settings: AccessibilitySettings | undefined
): void {
  const config = settings?.[type];
  if (!config?.enabled) return;
  const audio = new Audio(soundUrls[type]);
  audio.volume = clampVolume(config.volume);
  audio.preload = "auto";
  void audio.play().catch(() => undefined);
}
