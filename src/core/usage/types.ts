/**
 * TypeScript types for usage tracking (mirrors Rust structures)
 */

export interface RequestCost {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCost: number;
  completionCost: number;
  totalCost: number;
}

export interface RequestUsage {
  id: string;
  timestamp: number; // Unix timestamp in milliseconds
  sessionId: string;
  characterId: string;
  characterName: string;
  modelId: string;
  modelName: string;
  providerId: string;
  providerLabel: string;
  operationType: string; // Type of operation (chat, regenerate, continue, summary, memory_manager, etc.)
  
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  
  // Token breakdown for prompt analysis
  memoryTokens?: number;  // Tokens from memory embeddings
  summaryTokens?: number; // Tokens from memory summary
  
  cost?: RequestCost;
  
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, string>;
}

export interface UsageFilter {
  startTimestamp?: number;
  endTimestamp?: number;
  providerId?: string;
  modelId?: string;
  characterId?: string;
  sessionId?: string;
  successOnly?: boolean;
}

export interface ProviderStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  averageCostPerRequest: number;
}

export interface ModelStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  averageCostPerRequest: number;
}

export interface CharacterStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  averageCostPerRequest: number;
}

export interface UsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  averageCostPerRequest: number;
  byProvider: Record<string, ProviderStats>;
  byModel: Record<string, ModelStats>;
  byCharacter: Record<string, CharacterStats>;
}
