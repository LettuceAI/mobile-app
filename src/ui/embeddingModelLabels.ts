type EmbeddingModelVersion = "v1" | "v2" | "v3";

const EMBEDDING_MODEL_CODENAMES: Record<EmbeddingModelVersion, string> = {
  v1: "Legacy",
  v2: "Atlas",
  v3: "Nova",
};

function asKnownVersion(version?: string | null): EmbeddingModelVersion | null {
  if (version === "v1" || version === "v2" || version === "v3") {
    return version;
  }
  return null;
}

export function getEmbeddingModelCodename(version?: string | null): string {
  const known = asKnownVersion(version);
  return known ? EMBEDDING_MODEL_CODENAMES[known] : "Embedding Model";
}

export function getEmbeddingModelDisplayName(version?: string | null): string {
  const known = asKnownVersion(version);
  if (!known) {
    return version ?? "Unknown";
  }
  return `${EMBEDDING_MODEL_CODENAMES[known]} (${known})`;
}
