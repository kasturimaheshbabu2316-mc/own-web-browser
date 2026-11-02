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
  THEME: 'sahayak_theme',
  PENDING_CONTEXT_ACTION: 'sahayak_pending_context_action',
  AGENT_TASK_STATE: 'sahayak_agent_task_state'
};

export const AGENT_STATES = {
  IDLE: 'IDLE',
  SCANNING: 'SCANNING',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  STOPPED: 'STOPPED'
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

export const GROQ_CONFIG = {
  ENDPOINT: 'https://api.groq.com/openai/v1/chat/completions',
  MODEL: 'llama-3.3-70b-versatile',
  DEFAULT_TEMPERATURE: 0.3,
  MAX_TOKENS: 2048
};

export const CONTEXT_MENU_IDS = {
  EXPLAIN: 'sahayak-explain',
  TRANSLATE: 'sahayak-translate',
  DRAFT: 'sahayak-draft'
};

export const IPC_MESSAGES = {
  PING: 'SAHAYAK_PING',
  GET_SETTINGS: 'SAHAYAK_GET_SETTINGS',
  SAVE_SETTINGS: 'SAHAYAK_SAVE_SETTINGS',
  TEST_API_KEY: 'SAHAYAK_TEST_API_KEY',
  TEST_GROQ_KEY: 'SAHAYAK_TEST_GROQ_KEY',
  GENERATE_CONTENT: 'SAHAYAK_GENERATE_CONTENT',
  EXTRACT_CONTENT: 'SAHAYAK_EXTRACT_CONTENT',
  EXTRACT_YOUTUBE_DATA: 'SAHAYAK_EXTRACT_YOUTUBE_DATA',
  SEEK_YOUTUBE_VIDEO: 'SAHAYAK_SEEK_YOUTUBE_VIDEO',
  FETCH_YOUTUBE_TRANSCRIPT: 'SAHAYAK_FETCH_YOUTUBE_TRANSCRIPT',
  LANGUAGE_CHANGED: 'SAHAYAK_LANGUAGE_CHANGED',
  EXECUTE_CONTEXT_ACTION: 'SAHAYAK_EXECUTE_CONTEXT_ACTION',
  CAPTURE_SCREENSHOT: 'SAHAYAK_CAPTURE_SCREENSHOT',
  STREAM_CONNECT: 'SAHAYAK_STREAM_PORT',
  STREAM_STATUS: 'SAHAYAK_STREAM_STATUS',
  STREAM_CHUNK: 'SAHAYAK_STREAM_CHUNK',
  STREAM_DONE: 'SAHAYAK_STREAM_DONE',
  STREAM_ERROR: 'SAHAYAK_STREAM_ERROR',
  FALLBACK_STATUS_CHANGED: 'SAHAYAK_FALLBACK_STATUS_CHANGED',
  SCAN_ELEMENTS: 'SAHAYAK_SCAN_ELEMENTS',
  HIGHLIGHT_ELEMENT: 'SAHAYAK_HIGHLIGHT_ELEMENT',
  CLEAR_HIGHLIGHTS: 'SAHAYAK_CLEAR_HIGHLIGHTS',
  RENDER_BADGES: 'SAHAYAK_RENDER_BADGES',
  TOGGLE_BADGES: 'SAHAYAK_TOGGLE_BADGES',
  REMOVE_BADGES: 'SAHAYAK_REMOVE_BADGES',
  BADGE_CLICKED: 'SAHAYAK_BADGE_CLICKED',
  FIND_ELEMENT: 'SAHAYAK_FIND_ELEMENT',
  PULSE_FIND_ELEMENT: 'SAHAYAK_PULSE_FIND_ELEMENT',
  // Phase 3 Slice 3.4 HITL Agent State Machine messages
  START_AGENT_TASK: 'SAHAYAK_START_AGENT_TASK',
  APPROVE_ACTION: 'SAHAYAK_APPROVE_ACTION',
  SKIP_ACTION: 'SAHAYAK_SKIP_ACTION',
  STOP_AGENT_TASK: 'SAHAYAK_STOP_AGENT_TASK',
  RESET_AGENT_TASK: 'SAHAYAK_RESET_AGENT_TASK',
  GET_AGENT_STATE: 'SAHAYAK_GET_AGENT_STATE',
  AGENT_STATE_CHANGED: 'SAHAYAK_AGENT_STATE_CHANGED',
  EXECUTE_ACTION: 'SAHAYAK_EXECUTE_ACTION',
  // Phase 4 Slice 4.1 User Profile Memory messages
  GET_USER_PROFILE: 'SAHAYAK_GET_USER_PROFILE',
  SAVE_USER_PROFILE: 'SAHAYAK_SAVE_USER_PROFILE'
};

export const DEFAULT_USER_PROFILE = {
  fullName: '',
  email: '',
  phone: '',
  collegeOrCompany: '',
  graduationYear: '2026',
  skills: '',
  portfolioUrl: '',
  linkedinUrl: '',
  githubUrl: '',
  preferredTone: 'formal',
  notes: ''
};

