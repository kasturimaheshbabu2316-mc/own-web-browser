/**
 * Sahayak Extension - Side Panel Controller
 */

import { STORAGE_KEYS, DEFAULT_CONFIG, IPC_MESSAGES } from '../shared/constants.js';
import { DEV_CONFIG } from '../shared/env.js';
import { SummaryView } from './components/summary-view.js';
import { ChatView } from './components/chat-view.js';
import { AgentView } from './components/agent-view.js';

// Component References
let summaryView = null;
let chatView = null;
let agentView = null;

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
  testResultText: document.getElementById('test-result-text'),

  // Groq Fallback Settings Elements (Slice 2.4)
  groqApiKeyInput: document.getElementById('groq-api-key'),
  toggleGroqVisibilityBtn: document.getElementById('toggle-groq-visibility'),
  groqEyeIcon: document.getElementById('groq-eye-icon'),
  saveGroqBtn: document.getElementById('save-groq-btn'),
  testGroqBtn: document.getElementById('test-groq-btn'),
  clearGroqBtn: document.getElementById('clear-groq-btn'),
  testGroqBox: document.getElementById('test-groq-box'),
  testGroqLatency: document.getElementById('test-groq-latency'),
  testGroqText: document.getElementById('test-groq-text'),

  // Agent Errand Controls Settings (Slice 3.5)
  agentMaxStepsSelect: document.getElementById('setting-agent-max-steps'),
  agentDryRunInput: document.getElementById('setting-agent-dry-run')
};

// Application State
let appState = {
  activeTab: 'settings',
  apiKey: '',
  groqApiKey: '',
  defaultModel: DEFAULT_CONFIG.MODEL,
  language: DEFAULT_CONFIG.LANGUAGE,
  agentSettings: {
    maxSteps: DEFAULT_CONFIG.MAX_STEPS || 10,
    dryRun: DEFAULT_CONFIG.DRY_RUN || false
  },
  isKeyVisible: false,
  isGroqKeyVisible: false
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

  const agentContainer = document.getElementById('view-agent');
  if (agentContainer) {
    agentView = new AgentView({
      container: agentContainer,
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
  } else if (tabName === 'agent' && agentView) {
    agentView.onTabActivated();
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

  // Toggle Groq Key Visibility (Slice 2.4)
  if (elements.toggleGroqVisibilityBtn) {
    elements.toggleGroqVisibilityBtn.addEventListener('click', () => {
      appState.isGroqKeyVisible = !appState.isGroqKeyVisible;
      elements.groqApiKeyInput.type = appState.isGroqKeyVisible ? 'text' : 'password';
    });
  }

  // Save Groq Key Button (Slice 2.4)
  if (elements.saveGroqBtn) {
    elements.saveGroqBtn.addEventListener('click', async () => {
      await saveGroqKey();
    });
  }

  // Test Groq Connection Button (Slice 2.4)
  if (elements.testGroqBtn) {
    elements.testGroqBtn.addEventListener('click', async () => {
      await testGroqApiKeyConnection();
    });
  }

  // Clear Groq Key Button (Slice 2.4)
  if (elements.clearGroqBtn) {
    elements.clearGroqBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear your saved Groq fallback key?')) {
        await clearGroqKey();
      }
    });
  }

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
        STORAGE_KEYS.GROQ_API_KEY,
        STORAGE_KEYS.DEFAULT_MODEL,
        STORAGE_KEYS.LANGUAGE,
        STORAGE_KEYS.AGENT_SETTINGS
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
    appState.groqApiKey = data[STORAGE_KEYS.GROQ_API_KEY] || '';
    appState.defaultModel = data[STORAGE_KEYS.DEFAULT_MODEL] || DEFAULT_CONFIG.MODEL;
    appState.language = data[STORAGE_KEYS.LANGUAGE] || DEFAULT_CONFIG.LANGUAGE;
    appState.agentSettings = data[STORAGE_KEYS.AGENT_SETTINGS] || {
      maxSteps: DEFAULT_CONFIG.MAX_STEPS || 10,
      dryRun: DEFAULT_CONFIG.DRY_RUN || false
    };

    // Populate Settings UI
    elements.geminiApiKeyInput.value = appState.apiKey;
    if (elements.groqApiKeyInput) {
      elements.groqApiKeyInput.value = appState.groqApiKey;
    }
    elements.defaultModelSelect.value = appState.defaultModel;
    elements.languageSelect.value = appState.language;

    if (elements.agentMaxStepsSelect) {
      elements.agentMaxStepsSelect.value = String(appState.agentSettings.maxSteps || 10);
    }
    if (elements.agentDryRunInput) {
      elements.agentDryRunInput.checked = Boolean(appState.agentSettings.dryRun);
    }

    // Update Header indicators
    updateLanguageUI(appState.language);
    updateStatusPill();

    // Notify AgentView of loaded agent settings
    if (agentView && typeof agentView.onAgentSettingsChanged === 'function') {
      agentView.onAgentSettingsChanged(appState.agentSettings);
    }

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
  const maxSteps = elements.agentMaxStepsSelect ? parseInt(elements.agentMaxStepsSelect.value, 10) : 10;
  const dryRun = elements.agentDryRunInput ? elements.agentDryRunInput.checked : false;

  const agentSettings = { maxSteps, dryRun };

  try {
    elements.saveSettingsBtn.classList.add('loading');

    await chrome.storage.local.set({
      [STORAGE_KEYS.GEMINI_API_KEY]: apiKey,
      [STORAGE_KEYS.DEFAULT_MODEL]: defaultModel,
      [STORAGE_KEYS.LANGUAGE]: language,
      [STORAGE_KEYS.AGENT_SETTINGS]: agentSettings
    });

    appState.apiKey = apiKey;
    appState.defaultModel = defaultModel;
    appState.language = language;
    appState.agentSettings = agentSettings;

    updateLanguageUI(language);
    updateStatusPill(Boolean(apiKey));

    if (agentView && typeof agentView.onAgentSettingsChanged === 'function') {
      agentView.onAgentSettingsChanged(agentSettings);
    }

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

  // Notify AgentView of active language change
  if (agentView && typeof agentView.onLanguageChanged === 'function') {
    agentView.onLanguageChanged(lang);
  }
}

/**
 * Updates Top Header Connection Status Indicator Pill
 * Supports Gemini active, Groq fallback active, Groq standalone active, or setup required.
 * @param {string|boolean} [status]
 */
function updateStatusPill(status) {
  if (status === 'fallback') {
    elements.connectionStatusPill.className = 'status-pill status-warning status-pill-fallback';
    elements.connectionStatusText.textContent = 'Rate-limited: Groq Fallback';
    elements.connectionStatusPill.title = 'Active Provider: Groq Llama-3.3-70b (Gemini throttled)';
    return;
  }

  if (status === 'retrying') {
    elements.connectionStatusPill.className = 'status-pill status-warning';
    elements.connectionStatusText.textContent = 'Retrying Gemini...';
    elements.connectionStatusPill.title = 'Gemini rate-limited. Retrying with exponential backoff...';
    return;
  }

  const hasGemini = Boolean(appState.apiKey);
  const hasGroq = Boolean(appState.groqApiKey);

  if (hasGemini) {
    elements.connectionStatusPill.className = 'status-pill status-success';
    elements.connectionStatusText.textContent = 'Gemini Flash-Lite Active';
    elements.connectionStatusPill.title = 'Primary Engine: Google Gemini Flash-Lite';
  } else if (hasGroq) {
    elements.connectionStatusPill.className = 'status-pill status-success';
    elements.connectionStatusText.textContent = 'Groq Llama-3.3 Active';
    elements.connectionStatusPill.title = 'Primary Engine: Groq Llama-3.3-70b';
  } else {
    elements.connectionStatusPill.className = 'status-pill status-warning';
    elements.connectionStatusText.textContent = 'Setup Required';
    elements.connectionStatusPill.title = 'Configure API keys in Settings';
  }
}

// Expose status pill updater to child views (SummaryView, ChatView)
window.sahayakUpdateStatusPill = updateStatusPill;

/**
 * Saves Groq Fallback API key to chrome.storage.local (Slice 2.4)
 */
async function saveGroqKey() {
  const apiKey = (elements.groqApiKeyInput ? elements.groqApiKeyInput.value : '').trim();
  if (elements.saveGroqBtn) elements.saveGroqBtn.classList.add('loading');

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.GROQ_API_KEY]: apiKey });
    appState.groqApiKey = apiKey;
    updateStatusPill();
    showAlert('Groq fallback key saved successfully!', 'success');
  } catch (error) {
    showAlert(`Error saving Groq key: ${error.message}`, 'error');
  } finally {
    if (elements.saveGroqBtn) elements.saveGroqBtn.classList.remove('loading');
  }
}

/**
 * Tests connection to Groq API (Slice 2.4)
 */
async function testGroqApiKeyConnection() {
  const apiKey = (elements.groqApiKeyInput ? elements.groqApiKeyInput.value : '').trim();

  if (!apiKey) {
    showAlert('Please enter a Groq API key first.', 'error');
    if (elements.groqApiKeyInput) elements.groqApiKeyInput.focus();
    return;
  }

  showAlert('Testing Groq connection...', 'info');
  if (elements.testGroqBtn) elements.testGroqBtn.classList.add('loading');
  if (elements.testGroqBox) elements.testGroqBox.classList.remove('hidden');
  if (elements.testGroqLatency) elements.testGroqLatency.textContent = 'Connecting...';
  if (elements.testGroqText) elements.testGroqText.textContent = 'Sending ping request to Groq Llama-3.3...';

  try {
    const res = await chrome.runtime.sendMessage({
      type: IPC_MESSAGES.TEST_GROQ_KEY,
      apiKey
    });

    if (res && res.success) {
      if (elements.testGroqLatency) elements.testGroqLatency.textContent = res.latency || 'Verified';
      if (elements.testGroqText) elements.testGroqText.textContent = res.sampleOutput || 'Groq connection confirmed.';
      showAlert('Connected! Groq Llama-3.3-70b is online and responding.', 'success');
      updateStatusPill();
    } else {
      if (elements.testGroqLatency) elements.testGroqLatency.textContent = 'Failed';
      if (elements.testGroqText) elements.testGroqText.textContent = `Error: ${res?.error || 'Authentication failed'}`;
      showAlert(`Groq error: ${res?.error || 'Could not verify key'}`, 'error');
    }
  } catch (err) {
    if (elements.testGroqLatency) elements.testGroqLatency.textContent = 'Failed';
    if (elements.testGroqText) elements.testGroqText.textContent = `Network error: ${err.message}`;
    showAlert(`Communication error: ${err.message}`, 'error');
  } finally {
    if (elements.testGroqBtn) elements.testGroqBtn.classList.remove('loading');
  }
}

/**
 * Clears saved Groq API key
 */
async function clearGroqKey() {
  if (elements.groqApiKeyInput) elements.groqApiKeyInput.value = '';
  appState.groqApiKey = '';
  await chrome.storage.local.remove([STORAGE_KEYS.GROQ_API_KEY]);
  if (elements.testGroqBox) elements.testGroqBox.classList.add('hidden');
  updateStatusPill();
  showAlert('Groq fallback key cleared.', 'info');
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
 * Sets up runtime message listener for active side panel communication (Slice 2.2 & 2.4)
 */
function initRuntimeMessageListener() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === IPC_MESSAGES.EXECUTE_CONTEXT_ACTION) {
        handlePendingContextAction(message.payload);
      } else if (message && message.type === IPC_MESSAGES.FALLBACK_STATUS_CHANGED) {
        updateStatusPill(message.status);
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
