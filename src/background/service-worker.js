/**
 * Sahayak Extension - Background Service Worker (Manifest V3)
 */

import { STORAGE_KEYS, DEFAULT_CONFIG, IPC_MESSAGES } from '../shared/constants.js';
import { generateContent, streamGenerateContent } from './ai-orchestrator.js';
import { DEV_CONFIG } from '../shared/env.js';

// Configure Chrome Side Panel to open automatically when extension action icon is clicked
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Sahayak SW] Extension installed/updated:', details.reason);

  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('[Sahayak SW] Side panel behavior configured.');
    }
  } catch (error) {
    console.error('[Sahayak SW] Error setting panel behavior:', error);
  }

  // Initialize default configuration in chrome.storage.local if empty
  try {
    const existing = await chrome.storage.local.get([
      STORAGE_KEYS.GEMINI_API_KEY,
      STORAGE_KEYS.DEFAULT_MODEL,
      STORAGE_KEYS.LANGUAGE,
      STORAGE_KEYS.THEME
    ]);

    const defaultsToSet = {};
    if (!existing[STORAGE_KEYS.GEMINI_API_KEY] && DEV_CONFIG && DEV_CONFIG.GEMINI_API_KEY) {
      defaultsToSet[STORAGE_KEYS.GEMINI_API_KEY] = DEV_CONFIG.GEMINI_API_KEY.trim();
    }
    if (!existing[STORAGE_KEYS.DEFAULT_MODEL]) {
      defaultsToSet[STORAGE_KEYS.DEFAULT_MODEL] = DEFAULT_CONFIG.MODEL;
    }
    if (!existing[STORAGE_KEYS.LANGUAGE]) {
      defaultsToSet[STORAGE_KEYS.LANGUAGE] = DEFAULT_CONFIG.LANGUAGE;
    }
    if (!existing[STORAGE_KEYS.THEME]) {
      defaultsToSet[STORAGE_KEYS.THEME] = DEFAULT_CONFIG.THEME;
    }

    if (Object.keys(defaultsToSet).length > 0) {
      await chrome.storage.local.set(defaultsToSet);
      console.log('[Sahayak SW] Default settings initialized:', defaultsToSet);
    }
  } catch (error) {
    console.error('[Sahayak SW] Error initializing defaults:', error);
  }
});

// Runtime message router for standard request-response IPC
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  console.log('[Sahayak SW] Received message:', message.type);

  if (message.type === IPC_MESSAGES.PING) {
    sendResponse({ status: 'OK', timestamp: Date.now() });
    return true;
  }

  if (message.type === IPC_MESSAGES.TEST_API_KEY) {
    handleTestApiKey(message.apiKey, message.model)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === IPC_MESSAGES.GENERATE_CONTENT) {
    generateContent(message.payload || {})
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});

// Port listener for real-time streaming connections from Side Panel
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sahayak-stream-port') {
    console.log('[Sahayak SW] Side panel streaming port connected.');

    port.onMessage.addListener(async (msg) => {
      if (msg && msg.type === IPC_MESSAGES.GENERATE_CONTENT) {
        try {
          await streamGenerateContent({
            ...msg.payload,
            onChunk: (chunk, accumulatedText) => {
              port.postMessage({
                type: IPC_MESSAGES.STREAM_CHUNK,
                chunk,
                accumulatedText
              });
            },
            onDone: (fullText) => {
              port.postMessage({
                type: IPC_MESSAGES.STREAM_DONE,
                text: fullText
              });
            },
            onError: (error) => {
              port.postMessage({
                type: IPC_MESSAGES.STREAM_ERROR,
                error: error.message
              });
            }
          });
        } catch (err) {
          port.postMessage({
            type: IPC_MESSAGES.STREAM_ERROR,
            error: err.message
          });
        }
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('[Sahayak SW] Side panel streaming port disconnected.');
    });
  }
});

/**
 * Validates Gemini API Key by generating a real response snippet
 * @param {string} apiKey 
 * @param {string} model 
 */
async function handleTestApiKey(apiKey, model = DEFAULT_CONFIG.MODEL) {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, error: 'API key is empty.' };
  }

  // First verify key with lightweight metadata call
  const metadataEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${apiKey.trim()}`;

  try {
    const metaRes = await fetch(metadataEndpoint, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!metaRes.ok) {
      const errorData = await metaRes.json().catch(() => ({}));
      const message = errorData.error?.message || `API error (HTTP ${metaRes.status})`;
      return { success: false, error: message, status: metaRes.status };
    }

    const metaData = await metaRes.json();
    const modelName = metaData.displayName || model;

    // Next test actual token generation with a short prompt
    const genResult = await generateContent({
      prompt: 'Confirm connection in one short sentence: "Sahayak AI is online and connected."',
      model,
      apiKey: apiKey.trim(),
      temperature: 0.2,
      maxOutputTokens: 64
    });

    if (genResult.success) {
      return {
        success: true,
        modelName,
        sampleOutput: genResult.text.trim(),
        message: 'API Key is valid and generating tokens!'
      };
    }

    return {
      success: false,
      error: genResult.error || 'Metadata passed, but generation failed.'
    };
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}
