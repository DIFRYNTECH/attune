const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "https://uat.useattune.co",
  "https://www.useattune.co",
  "https://useattune.co",
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/attune-[a-z0-9-]+-difryngrouppgmailcoms-projects\.vercel\.app$/,
];

export function getServerConfig(env = process.env) {
  const port = Number(env.PORT || 8787);
  const attuneEnv = env.ATTUNE_ENV || env.NODE_ENV || "development";
  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const boardModel = env.OPENAI_BOARD_MODEL || model;
  const boardFallbackModel = env.OPENAI_BOARD_FALLBACK_MODEL || model;
  const boardModelCandidates = Array.from(
    new Set([boardModel, boardFallbackModel].map((value) => String(value || "").trim()).filter(Boolean))
  );
  const allowedOriginOverrides = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port,
    attuneEnv,
    openAiApiKey: env.OPENAI_API_KEY,
    model,
    boardTotalTaskCount: 12,
    boardModel,
    boardFallbackModel,
    boardModelCandidates,
    boardAiCandidateCount: 50,
    boardMaxCompletionTokens: Math.max(1200, Math.min(5000, Number(env.OPENAI_BOARD_MAX_COMPLETION_TOKENS) || 3200)),
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    upstashRedisRestUrl: env.UPSTASH_REDIS_REST_URL,
    upstashRedisRestToken: env.UPSTASH_REDIS_REST_TOKEN,
    trustProxy: String(env.TRUST_PROXY || "").trim() === "1",
    allowedOrigins: Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...allowedOriginOverrides])),
    allowedOriginPatterns: ALLOWED_ORIGIN_PATTERNS,
  };
}
