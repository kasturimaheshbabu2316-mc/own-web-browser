/**
 * Shared constants for Sahayak Extension
 */

export const STORAGE_KEYS = {
  GEMINI_API_KEY: 'sahayak_gemini_api_key',
  GROQ_API_KEY: 'sahayak_groq_api_key',
  DEFAULT_MODEL: 'sahayak_default_model',
  LANGUAGE: 'sahayak_language',
  USER_PROFILE: 'sahayak_user_profile',
  SAVED_SKILLS: 'sahayak_saved_skills',
  AGENT_SETTINGS: 'sahayak_agent_settings',
  THEME: 'sahayak_theme'
};

export const DEFAULT_CONFIG = {
  MODEL: 'gemini-flash-lite-latest',
  FALLBACK_MODEL: 'gemini-flash-latest',
  LANGUAGE: 'en', // 'en' | 'hinglish'
  THEME: 'dark',
  MAX_STEPS: 10,
  DRY_RUN: false
};

export const AVAILABLE_MODELS = [
  {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini Flash-Lite Latest (Fast, Ultra-low Latency - Recommended)',
    tier: 'default'
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash Latest (Multimodal & Deep Reasoning)',
    tier: 'advanced'
  }
];

export const IPC_MESSAGES = {
  PING: 'SAHAYAK_PING',
  GET_SETTINGS: 'SAHAYAK_GET_SETTINGS',
  SAVE_SETTINGS: 'SAHAYAK_SAVE_SETTINGS',
  TEST_API_KEY: 'SAHAYAK_TEST_API_KEY',
  GENERATE_CONTENT: 'SAHAYAK_GENERATE_CONTENT',
  EXTRACT_CONTENT: 'SAHAYAK_EXTRACT_CONTENT',
  STREAM_CONNECT: 'SAHAYAK_STREAM_PORT',
  STREAM_CHUNK: 'SAHAYAK_STREAM_CHUNK',
  STREAM_DONE: 'SAHAYAK_STREAM_DONE',
  STREAM_ERROR: 'SAHAYAK_STREAM_ERROR'
};

