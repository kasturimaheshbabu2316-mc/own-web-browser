/**
 * Sahayak Extension - Side Panel Controller
 */

import { STORAGE_KEYS, DEFAULT_CONFIG, IPC_MESSAGES } from '../shared/constants.js';
import { DEV_CONFIG } from '../shared/env.js';
import { SummaryView } from './components/summary-view.js';
import { ChatView } from './components/chat-view.js';

// Component References
let summaryView = null;
let chatView = null;

// DOM Element References
const elements = {
  // Navigation Tabs
  navTabs: document.querySelectorAll('.nav-tab'),
  tabPanes: document.querySelectorAll('.tab-pane'),

  // Header Elements
  langSegmentControl: document.getElementById('lang-segment-control'),
  langBtnEn: document.getElementById('lang-btn-en'),
  langBtnHinglish: document.getElementById('lang-btn-hinglish'),
  langSegmentBtns: document.querySelectorAll('.lang-segment-btn'),
  connectionStatusPill: document.getElementById('connection-status-pill'),
  connectionStatusText: document.getElementById('connection-status-text'),

  // Settings Elements
  geminiApiKeyInput: document.getElementById('gemini-api-key'),
  toggleKeyVisibilityBtn: document.getElementById('toggle-key-visibility'),
  eyeIcon: document.getElementById('eye-icon'),
  defaultModelSelect: document.getElementById('default-model'),
  languageSelect: document.getElementById('language-select'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  testKeyBtn: document.getElementById('test-key-btn'),
  clearKeyBtn: document.getElementById('clear-key-btn'),
  settingsAlert: document.getElementById('settings-alert'),
  testResultBox: document.getElementById('test-result-box'),
  testLatency: document.getElementById('test-latency'),
  testResultText: document.getElementById('test-result-text')
};

// Application State
let appState = {
  activeTab: 'settings',
  apiKey: '',
  defaultModel: DEFAULT_CONFIG.MODEL,
  language: DEFAULT_CONFIG.LANGUAGE,
  isKeyVisible: false
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Sahayak SidePanel] Initializing controller...');
  initNavigation();
  initSettingsListeners();
  initSubComponents();
  initRuntimeMessageListener();
  await loadSavedSettings();
  await checkPendingContextAction();
});

/**
 * Initializes sub-views (SummaryView, etc.)
 */
function initSubComponents() {
  const summaryContainer = document.getElementById('view-summary');
  if (summaryContainer) {
    summaryView = new SummaryView({
      container: summaryContainer,
      onNavigateToSettings: () => switchTab('settings')
    });
  }

  const chatContainer = document.getElementById('view-chat');
  if (chatContainer) {
    chatView = new ChatView({
      container: chatContainer,
      onNavigateToSettings: () => switchTab('settings')
    });
  }
}

/**
 * Initializes Tab Navigation
 */
function initNavigation() {
  elements.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

/**
 * Switches the active tab view
 * @param {string} tabName
 */
function switchTab(tabName) {
  appState.activeTab = tabName;

  elements.navTabs.forEach(tab => {
    const isActive = tab.getAttribute('data-tab') === tabName;
    tab.classList.toggle('active', isActive);
  });

  elements.tabPanes.forEach(pane => {
    const isTarget = pane.id === `view-${tabName}`;
    pane.classList.toggle('active', isTarget);
  });

  if (tabName === 'summary' && summaryView) {
    summaryView.refreshActiveTabInfo();
  } else if (tabName === 'chat' && chatView) {
    chatView.onTabActivated();
  }
}

/**
 * Sets up Settings form event listeners
 */
function initSettingsListeners() {
  // Toggle API key visibility (password <-> text)
  elements.toggleKeyVisibilityBtn.addEventListener('click', () => {
    appState.isKeyVisible = !appState.isKeyVisible;
    elements.geminiApiKeyInput.type = appState.isKeyVisible ? 'text' : 'password';
    elements.toggleKeyVisibilityBtn.setAttribute('title', appState.isKeyVisible ? 'Hide Key' : 'Show Key');
  });

  // Save Settings Button
  elements.saveSettingsBtn.addEventListener('click', async () => {
    await saveSettings();
  });

  // Test Key Connection Button
  elements.testKeyBtn.addEventListener('click', async () => {
    await testApiKeyConnection();
  });

  // Clear Key Button
  elements.clearKeyBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear your saved Gemini API key?')) {
      await clearApiKey();
    }
  });

  // Bilingual Language Segment Switch in Header (Slice 1.5)
  elements.langSegmentBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const selectedLang = btn.getAttribute('data-lang');
      if (selectedLang && selectedLang !== appState.language) {
        await updateLanguage(selectedLang);
      }
    });
  });

  // Language Select in Settings syncs with state
  elements.languageSelect.addEventListener('change', async (e) => {
    await updateLanguage(e.target.value);
  });

  // Listen to storage changes to keep language preference synchronized
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.LANGUAGE]) {
        const newLang = changes[STORAGE_KEYS.LANGUAGE].newValue;
        if (newLang && newLang !== appState.language) {
          appState.language = newLang;
          elements.languageSelect.value = newLang;
          updateLanguageUI(newLang);
        }
      }
    });
  }
}

/**
 * Loads saved preferences from chrome.storage.local
 */
async function loadSavedSettings() {
  try {
    let data = {};
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      data = await chrome.storage.local.get([
        STORAGE_KEYS.GEMINI_API_KEY,
        STORAGE_KEYS.DEFAULT_MODEL,
        STORAGE_KEYS.LANGUAGE
      ]);
    }

    let apiKey = data[STORAGE_KEYS.GEMINI_API_KEY] || '';
    if (!apiKey && DEV_CONFIG && DEV_CONFIG.GEMINI_API_KEY) {
      apiKey = DEV_CONFIG.GEMINI_API_KEY.trim();
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEYS.GEMINI_API_KEY]: apiKey });
      }
      console.log('[Sahayak SidePanel] Automatically preloaded API key from local environment.');
    }

    appState.apiKey = apiKey;
    appState.defaultModel = data[STORAGE_KEYS.DEFAULT_MODEL] || DEFAULT_CONFIG.MODEL;
    appState.language = data[STORAGE_KEYS.LANGUAGE] || DEFAULT_CONFIG.LANGUAGE;

    // Populate Settings UI
    elements.geminiApiKeyInput.value = appState.apiKey;
    elements.defaultModelSelect.value = appState.defaultModel;
    elements.languageSelect.value = appState.language;

    // Update Header indicators
    updateLanguageUI(appState.language);
    updateStatusPill(Boolean(appState.apiKey));

    // If API key is configured, land directly on Summary tab
    if (appState.apiKey) {
      switchTab('summary');
    }

    console.log('[Sahayak SidePanel] Settings loaded successfully.');
  } catch (error) {
    console.error('[Sahayak SidePanel] Failed to load settings:', error);
    showAlert('Failed to load local settings from storage.', 'error');
  }
}

/**
 * Saves current settings to chrome.storage.local
 */
async function saveSettings() {
  const apiKey = elements.geminiApiKeyInput.value.trim();
  const defaultModel = elements.defaultModelSelect.value;
  const language = elements.languageSelect.value;

  try {
    elements.saveSettingsBtn.classList.add('loading');

    await chrome.storage.local.set({
      [STORAGE_KEYS.GEMINI_API_KEY]: apiKey,
      [STORAGE_KEYS.DEFAULT_MODEL]: defaultModel,
      [STORAGE_KEYS.LANGUAGE]: language
    });

    appState.apiKey = apiKey;
    appState.defaultModel = defaultModel;
    appState.language = language;

    updateLanguageUI(language);
    updateStatusPill(Boolean(apiKey));

    showAlert('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('[Sahayak SidePanel] Error saving settings:', error);
    showAlert(`Error saving settings: ${error.message}`, 'error');
  } finally {
    elements.saveSettingsBtn.classList.remove('loading');
  }
}

/**
 * Tests connection to Google Gemini API using real-time streaming
 */
async function testApiKeyConnection() {
  const apiKey = elements.geminiApiKeyInput.value.trim();
  const model = elements.defaultModelSelect.value;

  if (!apiKey) {
    showAlert('Please enter an API key first.', 'error');
    elements.geminiApiKeyInput.focus();
    return;
  }

  showAlert('Connecting to Gemini Flash-Lite...', 'info');
  elements.testKeyBtn.classList.add('loading');
  elements.testResultBox.classList.remove('hidden');
  elements.testLatency.textContent = 'Connecting...';
  elements.testResultText.textContent = 'Requesting live verification response from Gemini...';

  const startTime = Date.now();

  try {
    // Open a port connection for streaming
    const port = chrome.runtime.connect({ name: 'sahayak-stream-port' });
    let streamedContent = '';

    port.onMessage.addListener((msg) => {
      if (msg.type === IPC_MESSAGES.STREAM_CHUNK) {
        streamedContent = msg.accumulatedText;
        elements.testResultText.textContent = streamedContent;
        elements.testLatency.textContent = `${Date.now() - startTime}ms`;
      } else if (msg.type === IPC_MESSAGES.STREAM_DONE) {
        elements.testLatency.textContent = `${Date.now() - startTime}ms (Complete)`;
        showAlert(`Connected! ${model} is streaming responses successfully.`, 'success');
        updateStatusPill(true);
        elements.testKeyBtn.classList.remove('loading');
        port.disconnect();
      } else if (msg.type === IPC_MESSAGES.STREAM_ERROR) {
        elements.testResultText.textContent = `Error: ${msg.error}`;
        elements.testLatency.textContent = 'Failed';
        showAlert(`Authentication or API error: ${msg.error}`, 'error');
        updateStatusPill(false);
        elements.testKeyBtn.classList.remove('loading');
        port.disconnect();
      }
    });

    port.postMessage({
      type: IPC_MESSAGES.GENERATE_CONTENT,
      payload: {
        prompt: 'Introduce yourself in one encouraging sentence: "Hello! Sahayak AI is online and ready to assist you on the web."',
        model,
        apiKey,
        temperature: 0.3,
        maxOutputTokens: 64
      }
    });

    // Fallback timeout in case port hangs
    setTimeout(() => {
      if (elements.testKeyBtn.classList.contains('loading')) {
        elements.testKeyBtn.classList.remove('loading');
        if (!streamedContent) {
          showAlert('Connection test timed out after 12 seconds.', 'error');
        }
      }
    }, 12000);

  } catch (error) {
    elements.testResultText.textContent = `Error: ${error.message}`;
    elements.testLatency.textContent = 'Failed';
    showAlert(`Communication error: ${error.message}`, 'error');
    updateStatusPill(false);
    elements.testKeyBtn.classList.remove('loading');
  }
}

/**
 * Clears saved Gemini API key
 */
async function clearApiKey() {
  try {
    await chrome.storage.local.remove([STORAGE_KEYS.GEMINI_API_KEY]);
    appState.apiKey = '';
    elements.geminiApiKeyInput.value = '';
    updateStatusPill(false);
    showAlert('API key has been cleared from local storage.', 'info');
  } catch (error) {
    showAlert(`Failed to clear key: ${error.message}`, 'error');
  }
}

/**
 * Updates language state and persists to storage
 * @param {'en' | 'hinglish'} lang
 */
async function updateLanguage(lang) {
  appState.language = lang;
  elements.languageSelect.value = lang;
  updateLanguageUI(lang);

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: lang });
    console.log('[Sahayak SidePanel] Language set to:', lang);
  } catch (err) {
    console.error('[Sahayak SidePanel] Error saving language:', err);
  }
}

/**
 * Updates Header Language Segment Control UI
 * @param {string} lang
 */
function updateLanguageUI(lang) {
  if (elements.langSegmentBtns) {
    elements.langSegmentBtns.forEach(btn => {
      const isTarget = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
    });
  }

  // Notify SummaryView of active language change
  if (summaryView && typeof summaryView.onLanguageChanged === 'function') {
    summaryView.onLanguageChanged(lang);
  }

  // Notify ChatView of active language change
  if (chatView && typeof chatView.onLanguageChanged === 'function') {
    chatView.onLanguageChanged(lang);
  }
}

/**
 * Updates Top Header Connection Status Indicator Pill
 * @param {boolean} isConfigured
 */
function updateStatusPill(isConfigured) {
  elements.connectionStatusPill.className = `status-pill ${isConfigured ? 'status-success' : 'status-warning'}`;
  elements.connectionStatusText.textContent = isConfigured ? 'Key Configured' : 'Setup Required';
}

/**
 * Displays feedback banner in Settings view
 * @param {string} message
 * @param {'success' | 'error' | 'info'} type
 */
function showAlert(message, type = 'info') {
  elements.settingsAlert.className = `alert-banner alert-${type}`;
  elements.settingsAlert.querySelector('.alert-text').textContent = message;
  elements.settingsAlert.classList.remove('hidden');

  // Auto-dismiss after 6 seconds for success/info alerts
  if (type !== 'error') {
    setTimeout(() => {
      elements.settingsAlert.classList.add('hidden');
    }, 6000);
  }
}

/**
 * Sets up runtime message listener for active side panel communication (Slice 2.2)
 */
function initRuntimeMessageListener() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === IPC_MESSAGES.EXECUTE_CONTEXT_ACTION) {
        handlePendingContextAction(message.payload);
      }
    });
  }
}

/**
 * Checks and executes any pending context action stored in chrome.storage.local (Slice 2.2)
 */
async function checkPendingContextAction() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.PENDING_CONTEXT_ACTION]);
    const pending = data[STORAGE_KEYS.PENDING_CONTEXT_ACTION];
    if (pending && pending.selectionText) {
      await chrome.storage.local.remove([STORAGE_KEYS.PENDING_CONTEXT_ACTION]);
      // Consume only if recent (< 60 seconds old)
      if (Date.now() - (pending.timestamp || 0) < 60000) {
        handlePendingContextAction(pending);
      }
    }
  } catch (err) {
    console.warn('[Sahayak SidePanel] Error checking pending context action:', err);
  }
}

/**
 * Dispatches context action to ChatView (Slice 2.2)
 * @param {object} payload
 */
function handlePendingContextAction(payload) {
  if (!payload || !payload.selectionText) return;

  // Switch directly to Chat tab
  switchTab('chat');

  if (chatView && typeof chatView.handleContextAction === 'function') {
    chatView.handleContextAction(payload);
  } else {
    setTimeout(() => {
      if (chatView && typeof chatView.handleContextAction === 'function') {
        chatView.handleContextAction(payload);
      }
    }, 150);
  }
}
