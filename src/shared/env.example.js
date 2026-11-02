/**
 * Sahayak Extension - Local Environment Template
 *
 * Copy this file to `src/shared/env.js` and add your API keys for automatic
 * pre-filling during local development.
 *
 * NOTE: `src/shared/env.js` is ignored by Git and must NEVER be committed.
 * In production or release packages, users enter their API keys directly
 * via the extension's Settings tab, which securely saves to `chrome.storage.local`.
 */

export const DEV_CONFIG = {
  // Google Gemini API Key (get free at https://aistudio.google.com/app/apikey)
  GEMINI_API_KEY: '',

  // Optional: Groq API Key for free-tier rate-limit failover (https://console.groq.com)
  GROQ_API_KEY: ''
};
