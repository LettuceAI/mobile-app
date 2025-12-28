import { invoke } from "@tauri-apps/api/core";
import { speak, stop, getVoices, isSpeaking } from "tauri-plugin-tts-api";

export type AudioProviderType = "gemini_tts" | "elevenlabs" | "device_tts";

export const DEVICE_TTS_PROVIDER_ID = "device_tts";
const DEVICE_TTS_LABEL = "Device TTS";

export interface AudioProvider {
    id: string;
    providerType: AudioProviderType;
    label: string;
    apiKey?: string;
    projectId?: string; // Gemini only
    location?: string; // Gemini only 
    createdAt?: number;
    updatedAt?: number;
    isSystem?: boolean;
}

export interface AudioModel {
    id: string;
    name: string;
    providerType: string;
}

export interface CachedVoice {
    id: string;
    providerId: string;
    voiceId: string;
    name: string;
    previewUrl?: string;
    labels: Record<string, string>;
    cachedAt: number;
}

export interface UserVoice {
    id: string;
    providerId: string;
    name: string;
    modelId: string;
    voiceId: string;
    prompt?: string;
    createdAt?: number;
    updatedAt?: number;
}

export interface TtsPreviewResponse {
    audioBase64: string;
    format: string;
}

export async function listAudioProviders(): Promise<AudioProvider[]> {
    const providers = await invoke<AudioProvider[]>("audio_provider_list");
    if (providers.some((provider) => provider.id === DEVICE_TTS_PROVIDER_ID)) {
        return providers;
    }
    return [
        ...providers,
        {
            id: DEVICE_TTS_PROVIDER_ID,
            providerType: "device_tts",
            label: DEVICE_TTS_LABEL,
            isSystem: true,
        },
    ];
}

export async function upsertAudioProvider(
    provider: AudioProvider
): Promise<AudioProvider> {
    return invoke<AudioProvider>("audio_provider_upsert", {
        providerJson: JSON.stringify(provider),
    });
}

export async function deleteAudioProvider(id: string): Promise<void> {
    return invoke("audio_provider_delete", { id });
}

export async function verifyAudioProvider(
    providerType: AudioProviderType,
    apiKey: string,
    projectId?: string
): Promise<boolean> {
    if (providerType === "device_tts") {
        return true;
    }
    return invoke<boolean>("audio_provider_verify", {
        providerType,
        apiKey,
        projectId,
    });
}

export async function listAudioModels(
    providerType: AudioProviderType
): Promise<AudioModel[]> {
    if (providerType === "device_tts") {
        return [];
    }
    return invoke<AudioModel[]>("audio_models_list", { providerType });
}

export async function getProviderVoices(
    providerId: string
): Promise<CachedVoice[]> {
    if (providerId === DEVICE_TTS_PROVIDER_ID) {
        const voices = await getVoices();
        const now = Date.now();
        return voices.map((voice) => ({
            id: `${providerId}:${voice.id}`,
            providerId,
            voiceId: voice.id,
            name: voice.name,
            previewUrl: undefined,
            labels: { language: voice.language },
            cachedAt: now,
        }));
    }
    return invoke<CachedVoice[]>("audio_provider_voices", { providerId });
}

export async function refreshProviderVoices(
    providerId: string
): Promise<CachedVoice[]> {
    if (providerId === DEVICE_TTS_PROVIDER_ID) {
        return getProviderVoices(providerId);
    }
    return invoke<CachedVoice[]>("audio_provider_refresh_voices", { providerId });
}

export async function listUserVoices(): Promise<UserVoice[]> {
    return invoke<UserVoice[]>("user_voice_list");
}

export async function upsertUserVoice(voice: UserVoice): Promise<UserVoice> {
    return invoke<UserVoice>("user_voice_upsert", {
        voiceJson: JSON.stringify(voice),
    });
}

export async function deleteUserVoice(id: string): Promise<void> {
    return invoke("user_voice_delete", { id });
}

export async function generateTtsPreview(
    providerId: string,
    modelId: string,
    voiceId: string,
    text: string,
    prompt?: string,
    requestId?: string
): Promise<TtsPreviewResponse> {
    return invoke<TtsPreviewResponse>("tts_preview", {
        providerId,
        modelId,
        voiceId,
        prompt,
        text,
        requestId: requestId ?? null,
    });
}

export function playAudioFromBase64(audioBase64: string, format: string): HTMLAudioElement {
    const audio = new Audio(`data:${format};base64,${audioBase64}`);
    void audio.play();
    return audio;
}

export async function abortAudioPreview(requestId: string): Promise<void> {
    return invoke("abort_request", { requestId });
}

export async function speakDeviceTts(options: {
    text: string;
    voiceId?: string;
    language?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
}): Promise<void> {
    await speak({
        text: options.text,
        voiceId: options.voiceId,
        language: options.language,
        rate: options.rate,
        pitch: options.pitch,
        volume: options.volume,
        queueMode: "flush",
    });
}

export async function stopDeviceTts(): Promise<void> {
    await stop();
}

export async function isDeviceTtsSpeaking(): Promise<boolean> {
    return isSpeaking();
}

export async function searchProviderVoices(
    providerId: string,
    search: string
): Promise<CachedVoice[]> {
    if (providerId === DEVICE_TTS_PROVIDER_ID) {
        const voices = await getProviderVoices(providerId);
        const lowered = search.trim().toLowerCase();
        if (!lowered) return voices;
        return voices.filter((voice) => {
            const name = voice.name.toLowerCase();
            const voiceId = voice.voiceId.toLowerCase();
            const language = voice.labels?.language?.toLowerCase() ?? "";
            return name.includes(lowered) || voiceId.includes(lowered) || language.includes(lowered);
        });
    }
    return invoke<CachedVoice[]>("audio_provider_search_voices", {
        providerId,
        search,
    });
}

export interface VoiceDesignPreview {
    generatedVoiceId: string;
    audioBase64: string;
    durationSecs: number;
    mediaType: string;
}

export interface CreatedVoiceResult {
    voiceId: string;
}

export async function listVoiceDesignModels(): Promise<AudioModel[]> {
    return invoke<AudioModel[]>("voice_design_models_list");
}

export async function designVoicePreview(
    providerId: string,
    textSample: string,
    voiceDescription: string,
    modelId?: string,
    numPreviews?: number
): Promise<VoiceDesignPreview[]> {
    return invoke<VoiceDesignPreview[]>("voice_design_preview", {
        providerId,
        textSample,
        voiceDescription,
        modelId,
        numPreviews,
    });
}

export async function createVoiceFromPreview(
    providerId: string,
    voiceName: string,
    generatedVoiceId: string,
    voiceDescription?: string
): Promise<CreatedVoiceResult> {
    return invoke<CreatedVoiceResult>("voice_design_create", {
        providerId,
        voiceName,
        generatedVoiceId,
        voiceDescription,
    });
}
