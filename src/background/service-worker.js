/**
 * Sahayak Extension - Background Service Worker (Manifest V3)
 */

import { STORAGE_KEYS, DEFAULT_CONFIG, GROQ_CONFIG, IPC_MESSAGES } from '../shared/constants.js';
import { generateContent, streamGenerateContent, findInteractiveElement } from './ai-orchestrator.js';
import { setupContextMenus, handleContextMenuClick } from './context-menu.js';
import { stateManager } from './state-manager.js';
// Phase 4 Slice 4.3 — Safety Guardrail Engine
import { checkDomainRestriction } from './safety-guardrails.js';

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

  // Initialize Right-Click Selection Context Menus (Slice 2.2)
  setupContextMenus();

  // Initialize default configuration in chrome.storage.local if empty
  try {
    const existing = await chrome.storage.local.get([
      STORAGE_KEYS.GEMINI_API_KEY,
      STORAGE_KEYS.DEFAULT_MODEL,
      STORAGE_KEYS.LANGUAGE,
      STORAGE_KEYS.THEME
    ]);

    const defaultsToSet = {};
    if (!existing[STORAGE_KEYS.GEMINI_API_KEY]) {
      // Gracefully load local development key if src/shared/env.js is present (omitted in public distribution)
      try {
        const envMod = await import('../shared/env.js');
        if (envMod?.DEV_CONFIG?.GEMINI_API_KEY) {
          defaultsToSet[STORAGE_KEYS.GEMINI_API_KEY] = envMod.DEV_CONFIG.GEMINI_API_KEY.trim();
        }
      } catch (_) {
        // env.js omitted in clean clones / release packages; user configures keys via Settings UI
      }
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

// Register Context Menu Click Listener at top-level for MV3 service worker reliability (Slice 2.2)
if (typeof chrome !== 'undefined' && chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
}

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

  if (message.type === IPC_MESSAGES.TEST_GROQ_KEY) {
    handleTestGroqApiKey(message.apiKey)
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

  // Handle Natural Language "Find It For Me" locator (Slice 3.3)
  if (message.type === IPC_MESSAGES.FIND_ELEMENT) {
    findInteractiveElement(message.payload || {})
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Phase 3 Slice 3.4: Human-in-the-Loop Agent State Machine Handlers
  if (message.type === IPC_MESSAGES.START_AGENT_TASK) {
    stateManager.startTask(message.payload || {})
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === IPC_MESSAGES.APPROVE_ACTION) {
    stateManager.approveStep()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === IPC_MESSAGES.SKIP_ACTION) {
    stateManager.skipStep(message.reason)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === IPC_MESSAGES.STOP_AGENT_TASK) {
    const result = stateManager.stopTask();
    sendResponse(result);
    return true;
  }

  if (message.type === IPC_MESSAGES.RESET_AGENT_TASK) {
    const result = stateManager.resetTask();
    sendResponse(result);
    return true;
  }

  if (message.type === IPC_MESSAGES.GET_AGENT_STATE) {
    sendResponse({ success: true, state: stateManager.getState() });
    return true;
  }

  // Phase 4 Slice 4.1: User Profile Memory Handlers
  if (message.type === IPC_MESSAGES.GET_USER_PROFILE) {
    chrome.storage.local.get([STORAGE_KEYS.USER_PROFILE], (result) => {
      sendResponse({ success: true, profile: result[STORAGE_KEYS.USER_PROFILE] || null });
    });
    return true;
  }

  if (message.type === IPC_MESSAGES.SAVE_USER_PROFILE) {
    chrome.storage.local.set({ [STORAGE_KEYS.USER_PROFILE]: message.profile }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Phase 4 Slice 4.2: Saved Skills Engine Handlers
  if (message.type === IPC_MESSAGES.GET_SAVED_SKILLS) {
    chrome.storage.local.get([STORAGE_KEYS.SAVED_SKILLS], (result) => {
      sendResponse({ success: true, skills: result[STORAGE_KEYS.SAVED_SKILLS] || null });
    });
    return true;
  }

  if (message.type === IPC_MESSAGES.SAVE_SKILLS) {
    chrome.storage.local.set({ [STORAGE_KEYS.SAVED_SKILLS]: message.skills }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Phase 4 Slice 4.3: Safety Guardrails — Domain restriction pre-flight check
  if (message.type === IPC_MESSAGES.CHECK_DOMAIN_SAFETY) {
    const check = checkDomainRestriction(message.url || '');
    sendResponse({ success: true, blocked: check.blocked, reason: check.reason });
    return true;
  }

  // Phase 4 Slice 4.3: Emergency Stop — halt running task immediately
  if (message.type === IPC_MESSAGES.EMERGENCY_STOP) {
    stateManager.stopTask()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Handle YouTube video seek routing to active tab
  if (message.type === IPC_MESSAGES.SEEK_YOUTUBE_VIDEO) {
    const targetTabId = message.tabId || sender?.tab?.id;
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, message, (res) => {
        sendResponse(res || { success: true });
      });
      return true;
    } else {
      chrome.tabs.query({ active: true, currentWindow: true })
        .then(([activeTab]) => {
          if (activeTab && activeTab.id) {
            chrome.tabs.sendMessage(activeTab.id, message, (res) => {
              sendResponse(res || { success: true });
            });
          } else {
            sendResponse({ success: false, error: 'No active tab found.' });
          }
        })
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  }

  // Handle Screenshot Viewport Capture (Slice 2.3)
  if (message.type === IPC_MESSAGES.CAPTURE_SCREENSHOT) {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(([activeTab]) => {
        if (!activeTab || !activeTab.id) {
          sendResponse({ success: false, error: 'No active tab found to capture.' });
          return;
        }

        if (isRestrictedUrl(activeTab.url)) {
          sendResponse({
            success: false,
            error: 'Browser system pages (chrome://, settings, webstore) cannot be captured.'
          });
          return;
        }

        chrome.tabs.captureVisibleTab(activeTab.windowId || null, { format: 'jpeg', quality: 85 }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else if (!dataUrl) {
            sendResponse({ success: false, error: 'Failed to capture visible tab.' });
          } else {
            sendResponse({
              success: true,
              dataUrl,
              tabId: activeTab.id,
              tabTitle: activeTab.title,
              tabUrl: activeTab.url
            });
          }
        });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

// Helper: Tests if URL is a restricted browser internal page
function isRestrictedUrl(url = '') {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:') ||
    url.includes('chromewebstore.google.com')
  );
}

// Helper: Tests if URL is a YouTube watch or shorts page
function isYouTubeWatchUrl(url = '') {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com' || u.hostname === 'm.youtube.com') &&
      (u.pathname === '/watch' || u.pathname.startsWith('/shorts/'))
    ) || (u.hostname === 'youtu.be');
  } catch {
    return false;
  }
}

// Slice 1.4: Detect tab navigation to youtube.com/watch?v=*
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab && tab.url && isYouTubeWatchUrl(tab.url)) {
    console.log('[Sahayak SW] Detected navigation to YouTube watch tab:', tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && isYouTubeWatchUrl(tab.url)) {
      console.log('[Sahayak SW] Activated YouTube tab:', tab.id, tab.url);
    }
  } catch {}
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
            onStatus: (status) => {
              port.postMessage({
                type: IPC_MESSAGES.STREAM_STATUS,
                ...status
              });
            },
            onChunk: (chunk, accumulatedText) => {
              port.postMessage({
                type: IPC_MESSAGES.STREAM_CHUNK,
                chunk,
                accumulatedText
              });
            },
            onDone: (fullText, meta = {}) => {
              port.postMessage({
                type: IPC_MESSAGES.STREAM_DONE,
                text: fullText,
                provider: meta.provider || 'gemini',
                model: meta.model || ''
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

/**
 * Validates Groq API Key by testing Llama-3.3-70b chat completions
 * @param {string} apiKey 
 */
async function handleTestGroqApiKey(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, error: 'Groq API key is empty.' };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(GROQ_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: GROQ_CONFIG.MODEL,
        messages: [{ role: 'user', content: 'Say "Groq Llama-3.3 fallback is online!" in 6 words or less.' }],
        max_tokens: 32,
        temperature: 0.1
      })
    });

    const latency = Date.now() - startTime;

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const message = errJson.error?.message || `Groq API error (HTTP ${res.status})`;
      return { success: false, error: message };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || 'Groq connection confirmed.';
    return {
      success: true,
      modelName: GROQ_CONFIG.MODEL,
      sampleOutput: text,
      latency: `${latency}ms`,
      message: 'Groq API Key is valid and generating tokens!'
    };
  } catch (err) {
    return { success: false, error: `Network error connecting to Groq: ${err.message}` };
  }
}
