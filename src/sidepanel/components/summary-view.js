/**
 * Sahayak Extension - Summary View Component
 * Handles tab content extraction, Gemini prompt formulation, streaming response rendering,
 * and structured 3-part card presentation (TL;DR, 5 Key Insights, Next Steps).
 */

import { STORAGE_KEYS, DEFAULT_CONFIG, IPC_MESSAGES } from '../../shared/constants.js';

export class SummaryView {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container - The #view-summary container element
   * @param {function} options.onNavigateToSettings - Callback to switch to settings tab
   */
  constructor({ container, onNavigateToSettings }) {
    this.container = container;
    this.onNavigateToSettings = onNavigateToSettings;

    // Component State
    this.state = {
      activeTab: null,
      extractedArticle: null,
      isExtracting: false,
      isSummarizing: false,
      rawMarkdown: '',
      generationTimeMs: 0,
      activePort: null
    };

    this.initDOM();
    this.bindEvents();
    this.refreshActiveTabInfo();
  }

  /**
   * Mounts the Summary View HTML structure
   */
  initDOM() {
    if (!this.container.querySelector('#summary-tab-banner')) {
      this.container.innerHTML = `
      <div class="summary-container">
        <!-- Active Tab Context Header -->
        <div class="tab-context-banner" id="summary-tab-banner">
          <div class="tab-context-info">
            <span class="tab-context-favicon" id="tab-favicon">🌐</span>
            <div class="tab-context-details">
              <span class="tab-context-title" id="tab-title">Detecting active tab...</span>
              <span class="tab-context-url" id="tab-url">Checking address...</span>
            </div>
          </div>
          <button type="button" class="btn btn-primary" id="btn-summarize-page">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span id="btn-summarize-text">Summarize Page</span>
          </button>
        </div>

        <!-- Notification / Warning Alerts -->
        <div class="alert-banner hidden" id="summary-alert">
          <span class="alert-icon"></span>
          <span class="alert-text"></span>
        </div>

        <!-- Extraction Progress Indicator -->
        <div class="extraction-status-card hidden" id="extraction-status">
          <div class="spinner-sm"></div>
          <span id="extraction-status-text">Cloning DOM and running Mozilla Readability...</span>
        </div>

        <!-- Article Metadata Bar (Shown after successful extraction) -->
        <div class="article-meta-bar hidden" id="article-meta-bar">
          <div class="meta-badge-group">
            <span class="meta-badge" id="badge-word-count">0 words</span>
            <span class="meta-badge" id="badge-reading-time">~1 min read</span>
            <span class="meta-badge" id="badge-latency">0ms</span>
            <span class="meta-badge meta-badge-accent" id="badge-model">Flash-Lite</span>
          </div>
          <div class="meta-action-group">
            <button type="button" class="icon-text-btn" id="btn-copy-summary" title="Copy formatted summary to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span id="copy-summary-label">Copy</span>
            </button>
          </div>
        </div>

        <!-- Empty State / Welcome Card -->
        <div class="summary-empty-state" id="summary-empty-state">
          <div class="empty-icon-wrap">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h3>Structured Article Summarizer</h3>
          <p>Extracts noise-free article text with Mozilla Readability, stripping ads, popups, and navs. Delivers:</p>
          <div class="features-pill-list">
            <div class="feature-item">
              <span class="feature-bullet">📌</span>
              <strong>TL;DR:</strong> 1–2 crisp, core summary sentences
            </div>
            <div class="feature-item">
              <span class="feature-bullet">💡</span>
              <strong>Key Insights:</strong> Exactly 5 distilled takeaways
            </div>
            <div class="feature-item">
              <span class="feature-bullet">🚀</span>
              <strong>Next Steps:</strong> 2–3 actionable recommendations
            </div>
          </div>
          <div class="empty-cta-hint">Click <strong>"Summarize Page"</strong> above to analyze the current browser tab.</div>
        </div>

        <!-- Structured Summary Cards Container -->
        <div class="structured-summary-wrap hidden" id="structured-summary-wrap">

          <!-- Section 1: TL;DR Card -->
          <div class="summary-section-card tldr-card">
            <div class="card-section-header">
              <span class="section-emoji">📌</span>
              <h3 class="section-heading">TL;DR</h3>
            </div>
            <div class="section-body" id="section-tldr-content">
              <div class="streaming-skeleton-line"></div>
              <div class="streaming-skeleton-line short"></div>
            </div>
          </div>

          <!-- Section 2: Key Insights Card -->
          <div class="summary-section-card insights-card">
            <div class="card-section-header">
              <span class="section-emoji">💡</span>
              <h3 class="section-heading">Key Insights</h3>
              <span class="badge-count" id="insights-count-badge">5 Points</span>
            </div>
            <div class="section-body" id="section-insights-content">
              <ul class="insights-list" id="insights-list-el">
                <li class="streaming-skeleton-line"></li>
                <li class="streaming-skeleton-line"></li>
                <li class="streaming-skeleton-line short"></li>
              </ul>
            </div>
          </div>

          <!-- Section 3: Next Steps Card -->
          <div class="summary-section-card next-steps-card">
            <div class="card-section-header">
              <span class="section-emoji">🚀</span>
              <h3 class="section-heading">Next Steps &amp; Actionable Takeaways</h3>
            </div>
            <div class="section-body" id="section-next-steps-content">
              <ul class="next-steps-list" id="next-steps-list-el">
                <li class="streaming-skeleton-line"></li>
                <li class="streaming-skeleton-line short"></li>
              </ul>
            </div>
          </div>

          <!-- Streaming Live Raw Preview (Collapsed by default, expands if parsing is partial) -->
          <div class="raw-preview-wrapper hidden" id="raw-preview-wrapper">
            <div class="raw-preview-header">
              <span>Streaming Live Output</span>
              <span class="live-pulse"></span>
            </div>
            <div class="raw-preview-text" id="raw-preview-text"></div>
          </div>

        </div>
      </div>
    `;
    }

    // Query inner elements
    this.dom = {
      tabBanner: this.container.querySelector('#summary-tab-banner'),
      tabFavicon: this.container.querySelector('#tab-favicon'),
      tabTitle: this.container.querySelector('#tab-title'),
      tabUrl: this.container.querySelector('#tab-url'),
      btnSummarize: this.container.querySelector('#btn-summarize-page'),
      btnSummarizeText: this.container.querySelector('#btn-summarize-text'),
      alertBanner: this.container.querySelector('#summary-alert'),
      extractionStatus: this.container.querySelector('#extraction-status'),
      extractionStatusText: this.container.querySelector('#extraction-status-text'),
      articleMetaBar: this.container.querySelector('#article-meta-bar'),
      badgeWordCount: this.container.querySelector('#badge-word-count'),
      badgeReadingTime: this.container.querySelector('#badge-reading-time'),
      badgeLatency: this.container.querySelector('#badge-latency'),
      badgeModel: this.container.querySelector('#badge-model'),
      btnCopySummary: this.container.querySelector('#btn-copy-summary'),
      copySummaryLabel: this.container.querySelector('#copy-summary-label'),
      emptyState: this.container.querySelector('#summary-empty-state'),
      summaryWrap: this.container.querySelector('#structured-summary-wrap'),
      tldrContent: this.container.querySelector('#section-tldr-content'),
      insightsList: this.container.querySelector('#insights-list-el'),
      nextStepsList: this.container.querySelector('#next-steps-list-el'),
      rawPreviewWrap: this.container.querySelector('#raw-preview-wrapper'),
      rawPreviewText: this.container.querySelector('#raw-preview-text')
    };
  }

  /**
   * Binds component click and message events
   */
  bindEvents() {
    this.dom.btnSummarize.addEventListener('click', () => {
      this.handleSummarizeClick();
    });

    this.dom.btnCopySummary.addEventListener('click', () => {
      this.copySummaryToClipboard();
    });

    // Listen to tab activation changes to refresh active tab banner
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        this.refreshActiveTabInfo();
      });
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'complete' && this.state.activeTab && this.state.activeTab.id === tabId) {
          this.refreshActiveTabInfo();
        }
      });
    }
  }

  /**
   * Updates the top banner with the active tab's metadata
   */
  async refreshActiveTabInfo() {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      this.state.activeTab = tab;
      this.dom.tabTitle.textContent = tab.title || 'Untitled Page';
      this.dom.tabTitle.setAttribute('title', tab.title || '');

      try {
        const urlObj = new URL(tab.url || '');
        this.dom.tabUrl.textContent = urlObj.hostname + (urlObj.pathname.length > 30 ? urlObj.pathname.slice(0, 30) + '...' : urlObj.pathname);
      } catch {
        this.dom.tabUrl.textContent = tab.url || '';
      }

      // Check if restricted page
      const isRestricted = this.isRestrictedUrl(tab.url);
      if (isRestricted) {
        this.dom.btnSummarize.disabled = true;
        this.dom.btnSummarize.classList.add('disabled');
        this.dom.btnSummarize.setAttribute('title', 'Browser system pages cannot be accessed by extensions.');
      } else {
        this.dom.btnSummarize.disabled = false;
        this.dom.btnSummarize.classList.remove('disabled');
        this.dom.btnSummarize.removeAttribute('title');
      }
    } catch (err) {
      console.warn('[SummaryView] Could not refresh tab info:', err);
    }
  }

  /**
   * Verifies if URL is restricted (Chrome internal, webstore, etc.)
   * @param {string} url 
   * @returns {boolean}
   */
  isRestrictedUrl(url = '') {
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

  /**
   * Triggered when user clicks "Summarize Page"
   */
  async handleSummarizeClick() {
    if (this.state.isExtracting || this.state.isSummarizing) {
      return;
    }

    this.hideAlert();
    await this.refreshActiveTabInfo();

    if (!this.state.activeTab || this.isRestrictedUrl(this.state.activeTab.url)) {
      this.showAlert('Cannot summarize internal browser pages or empty tabs. Please open any article or webpage.', 'warning');
      return;
    }

    // Verify Gemini API key is configured
    let settings = {};
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      settings = await chrome.storage.local.get([
        STORAGE_KEYS.GEMINI_API_KEY,
        STORAGE_KEYS.DEFAULT_MODEL,
        STORAGE_KEYS.LANGUAGE
      ]);
    }

    const apiKey = (settings[STORAGE_KEYS.GEMINI_API_KEY] || '').trim();
    if (!apiKey) {
      this.showAlert('Google Gemini API Key is required. Please set it in Settings.', 'error');
      if (this.onNavigateToSettings) {
        setTimeout(() => this.onNavigateToSettings(), 1200);
      }
      return;
    }

    const model = settings[STORAGE_KEYS.DEFAULT_MODEL] || DEFAULT_CONFIG.MODEL;
    const language = settings[STORAGE_KEYS.LANGUAGE] || DEFAULT_CONFIG.LANGUAGE;

    // Step 1: Extract article content from active tab
    const article = await this.extractArticleContent(this.state.activeTab.id);
    if (!article || !article.success) {
      this.showAlert(article?.error || 'Could not extract readable content from this page.', 'error');
      return;
    }

    this.state.extractedArticle = article;

    // Surface paywall warning if detected
    if (article.isPaywalled) {
      this.showAlert('Paywall or subscription gate detected on page. Summarizing from available preview text.', 'warning');
    }

    // Update Metadata Bar
    this.dom.badgeWordCount.textContent = `${article.wordCount.toLocaleString()} words`;
    this.dom.badgeReadingTime.textContent = `~${article.readingTimeMinutes} min read`;
    this.dom.badgeModel.textContent = model.replace('-latest', '').replace('gemini-', '');
    this.dom.articleMetaBar.classList.remove('hidden');

    // Step 2: Stream AI Summary
    await this.generateStructuredSummary({ article, apiKey, model, language });
  }

  /**
   * Dispatches IPC extraction message to content script with automatic dynamic injection fallback
   * @param {number} tabId 
   * @returns {Promise<object>}
   */
  async extractArticleContent(tabId) {
    this.state.isExtracting = true;
    this.setBtnLoading(true, 'Extracting DOM...');
    this.dom.extractionStatus.classList.remove('hidden');
    this.dom.extractionStatusText.textContent = 'Cloning DOM and running Mozilla Readability...';

    try {
      let response = await this.sendMessageToTab(tabId, { type: IPC_MESSAGES.EXTRACT_CONTENT });

      // If content script was not active, dynamically inject and retry
      if (!response) {
        console.log('[SummaryView] Content script missing. Injecting dynamically via chrome.scripting...');
        this.dom.extractionStatusText.textContent = 'Injecting extraction engine into active tab...';

        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/readability.js', 'src/content/extractor.js']
        });

        // Short breathing room for script initialization
        await new Promise(r => setTimeout(r, 200));

        response = await this.sendMessageToTab(tabId, { type: IPC_MESSAGES.EXTRACT_CONTENT });
      }

      return response;
    } catch (err) {
      console.error('[SummaryView] Extraction failed:', err);
      return { success: false, error: `Content extraction error: ${err.message}` };
    } finally {
      this.state.isExtracting = false;
      this.dom.extractionStatus.classList.add('hidden');
      this.setBtnLoading(false, 'Summarize Page');
    }
  }

  /**
   * Helper to send message to tab with timeout
   */
  sendMessageToTab(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Generates structured 3-part summary using real-time streaming over port
   */
  async generateStructuredSummary({ article, apiKey, model, language }) {
    this.state.isSummarizing = true;
    this.setBtnLoading(true, 'Summarizing...');
    this.dom.emptyState.classList.add('hidden');
    this.dom.summaryWrap.classList.remove('hidden');

    // Reset card contents to loading skeleton state
    this.renderSkeletons();
    this.dom.rawPreviewWrap.classList.remove('hidden');
    this.dom.rawPreviewText.textContent = 'Connecting to Gemini Flash-Lite...';

    const startTime = Date.now();
    this.dom.badgeLatency.textContent = 'Generating...';

    const systemInstruction = this.buildSystemPrompt(language);
    const userPrompt = this.buildUserPrompt(article, language);

    try {
      // Connect to background streaming port
      const port = chrome.runtime.connect({ name: 'sahayak-stream-port' });
      this.state.activePort = port;
      let accumulatedText = '';

      port.onMessage.addListener((msg) => {
        if (msg.type === IPC_MESSAGES.STREAM_CHUNK) {
          accumulatedText = msg.accumulatedText;
          this.state.rawMarkdown = accumulatedText;
          this.dom.rawPreviewText.textContent = accumulatedText;
          this.dom.badgeLatency.textContent = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

          // Incrementally update structured cards
          this.renderIncrementalSummary(accumulatedText);

        } else if (msg.type === IPC_MESSAGES.STREAM_DONE) {
          const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
          this.dom.badgeLatency.textContent = `${totalDuration}s`;
          this.state.rawMarkdown = msg.text || accumulatedText;

          // Final polished render
          this.renderFinalSummary(this.state.rawMarkdown);
          this.dom.rawPreviewWrap.classList.add('hidden'); // Hide raw box on completion

          this.setBtnLoading(false, 'Re-summarize');
          this.state.isSummarizing = false;
          port.disconnect();

        } else if (msg.type === IPC_MESSAGES.STREAM_ERROR) {
          this.dom.badgeLatency.textContent = 'Error';
          this.showAlert(`Summarization error: ${msg.error}`, 'error');
          this.setBtnLoading(false, 'Summarize Page');
          this.state.isSummarizing = false;
          port.disconnect();
        }
      });

      // Send generation request to streaming port
      port.postMessage({
        type: IPC_MESSAGES.GENERATE_CONTENT,
        payload: {
          prompt: userPrompt,
          systemInstruction,
          model,
          apiKey,
          temperature: 0.25,
          maxOutputTokens: 2048
        }
      });

    } catch (err) {
      console.error('[SummaryView] Streaming connection error:', err);
      this.showAlert(`Connection failed: ${err.message}`, 'error');
      this.setBtnLoading(false, 'Summarize Page');
      this.state.isSummarizing = false;
    }
  }

  /**
   * Constructs the strict system prompt enforcing the 3 sections and language dialect
   * @param {'en' | 'hinglish'} language 
   * @returns {string}
   */
  buildSystemPrompt(language) {
    if (language === 'hinglish') {
      return `You are Sahayak, an intelligent AI browser reading assistant.
Your task is to summarize the provided webpage text into natural, fluent Hinglish (conversational Hindi grammar written using the English/Latin alphabet, keeping all technical, digital, and domain terms in standard English).
Example: "Yeh article explain karta hai ki Kubernetes clusters ko scale kaise karte hain..."

Strict Output Structure:
### 📌 TL;DR
[1–2 crisp, impactful sentences in Hinglish summarizing the core message]

### 💡 Key Insights
- [Insight 1 in Hinglish]
- [Insight 2 in Hinglish]
- [Insight 3 in Hinglish]
- [Insight 4 in Hinglish]
- [Insight 5 in Hinglish]

### 🚀 Next Steps & Actionable Takeaways
- [Actionable takeaway 1 in Hinglish]
- [Actionable takeaway 2 in Hinglish]
- [Actionable takeaway 3 in Hinglish]

Rules:
- Strictly adhere to exactly 5 bullet points under Key Insights.
- Strictly adhere to 2–3 items under Next Steps.
- Ground all facts strictly in the extracted text. Never hallucinate.
- Never output pleasantries, apologies, or preamble outside the headers.`;
    }

    return `You are Sahayak, an elite AI browser reading assistant.
Your task is to deliver a high-value, structured 3-part summary of the provided webpage text.

Strict Output Structure:
### 📌 TL;DR
[1–2 crisp, impactful sentences summarizing the core thesis and significance]

### 💡 Key Insights
- [Key Insight 1]
- [Key Insight 2]
- [Key Insight 3]
- [Key Insight 4]
- [Key Insight 5]

### 🚀 Next Steps & Actionable Takeaways
- [Actionable Next Step 1]
- [Actionable Next Step 2]
- [Actionable Next Step 3]

Rules:
- Strictly produce exactly 5 bullet points under Key Insights.
- Strictly produce 2–3 concrete next steps or takeaways.
- Ground every insight strictly in the provided text.
- Do not include any filler intro (e.g., "Here is the summary") or conclusion.`;
  }

  /**
   * Constructs the user prompt wrapped in untrusted content delimiters (Edge Case 2.1)
   * @param {object} article 
   * @param {string} language 
   * @returns {string}
   */
  buildUserPrompt(article, language) {
    const langDirective = language === 'hinglish'
      ? 'Summarize this article in fluent conversational Hinglish following the 3 sections.'
      : 'Summarize this article following the strict 3 sections.';

    return `${langDirective}

<<<UNTRUSTED_WEB_PAGE_CONTENT>>>
Article Title: ${article.title}
Site / Host: ${article.siteName}
URL: ${article.url}
Byline: ${article.byline || 'Unknown'}

${article.textContent}
<<<END_UNTRUSTED_CONTENT>>>`;
  }

  /**
   * Parses markdown sections dynamically
   * @param {string} markdown 
   * @returns {{ tldr: string, keyInsights: string[], nextSteps: string[] }}
   */
  parseSections(markdown) {
    const sections = {
      tldr: '',
      keyInsights: [],
      nextSteps: []
    };

    if (!markdown) return sections;

    // Extract TL;DR
    const tldrMatch = markdown.match(/###\s*.*TL;?DR[\s\S]*?(?=###|$)/i);
    if (tldrMatch) {
      sections.tldr = tldrMatch[0]
        .replace(/###\s*.*TL;?DR[^\n]*\n?/i, '')
        .trim();
    }

    // Extract Key Insights
    const insightsMatch = markdown.match(/###\s*.*Key\s*Insights[\s\S]*?(?=###|$)/i);
    if (insightsMatch) {
      const rawText = insightsMatch[0]
        .replace(/###\s*.*Key\s*Insights[^\n]*\n?/i, '')
        .trim();

      sections.keyInsights = rawText
        .split('\n')
        .map(line => line.replace(/^[-*•\d.]+\s*/, '').trim())
        .filter(line => line.length > 5);
    }

    // Extract Next Steps
    const nextStepsMatch = markdown.match(/###\s*.*Next\s*Steps[\s\S]*?(?=###|$)/i);
    if (nextStepsMatch) {
      const rawText = nextStepsMatch[0]
        .replace(/###\s*.*Next\s*Steps[^\n]*\n?/i, '')
        .trim();

      sections.nextSteps = rawText
        .split('\n')
        .map(line => line.replace(/^[-*•\d.]+\s*/, '').trim())
        .filter(line => line.length > 5);
    }

    return sections;
  }

  /**
   * Incrementally updates DOM elements during streaming
   * @param {string} rawText 
   */
  renderIncrementalSummary(rawText) {
    const { tldr, keyInsights, nextSteps } = this.parseSections(rawText);

    if (tldr) {
      this.dom.tldrContent.innerHTML = `<p class="tldr-text">${this.escapeHTML(tldr)}</p>`;
    }

    if (keyInsights && keyInsights.length > 0) {
      this.dom.insightsList.innerHTML = keyInsights
        .map(item => `<li><span class="insight-bullet">▸</span><span>${this.escapeHTML(item)}</span></li>`)
        .join('');
    }

    if (nextSteps && nextSteps.length > 0) {
      this.dom.nextStepsList.innerHTML = nextSteps
        .map((step, idx) => `<li><span class="step-num">${idx + 1}</span><span>${this.escapeHTML(step)}</span></li>`)
        .join('');
    }
  }

  /**
   * Renders the finalized summary cards
   * @param {string} fullMarkdown 
   */
  renderFinalSummary(fullMarkdown) {
    const { tldr, keyInsights, nextSteps } = this.parseSections(fullMarkdown);

    // If parsing captured sections properly
    if (tldr || keyInsights.length > 0) {
      this.dom.tldrContent.innerHTML = `<p class="tldr-text">${this.escapeHTML(tldr || 'Summary generated.')}</p>`;

      if (keyInsights.length > 0) {
        this.dom.insightsList.innerHTML = keyInsights
          .map(item => `<li><span class="insight-bullet">▸</span><span>${this.escapeHTML(item)}</span></li>`)
          .join('');
      }

      if (nextSteps.length > 0) {
        this.dom.nextStepsList.innerHTML = nextSteps
          .map((step, idx) => `<li><span class="step-num">${idx + 1}</span><span>${this.escapeHTML(step)}</span></li>`)
          .join('');
      }
    } else {
      // Fallback: If model did not strictly format headers, display full markdown cleanly
      this.dom.tldrContent.innerHTML = `<div class="formatted-raw-body">${this.formatSimpleMarkdown(fullMarkdown)}</div>`;
    }
  }

  /**
   * Renders skeleton placeholder lines inside cards during generation
   */
  renderSkeletons() {
    this.dom.tldrContent.innerHTML = `
      <div class="streaming-skeleton-line"></div>
      <div class="streaming-skeleton-line short"></div>
    `;

    this.dom.insightsList.innerHTML = `
      <li class="streaming-skeleton-line"></li>
      <li class="streaming-skeleton-line"></li>
      <li class="streaming-skeleton-line short"></li>
    `;

    this.dom.nextStepsList.innerHTML = `
      <li class="streaming-skeleton-line"></li>
      <li class="streaming-skeleton-line short"></li>
    `;
  }

  /**
   * Copies formatted markdown summary to clipboard with user feedback
   */
  async copySummaryToClipboard() {
    if (!this.state.rawMarkdown && !this.state.extractedArticle) return;

    let textToCopy = this.state.rawMarkdown;
    if (!textToCopy && this.state.extractedArticle) {
      textToCopy = `# ${this.state.extractedArticle.title}\nSource: ${this.state.extractedArticle.url}\n\n${this.state.extractedArticle.textContent}`;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      this.dom.copySummaryLabel.textContent = 'Copied!';
      this.dom.btnCopySummary.classList.add('btn-copied');

      setTimeout(() => {
        this.dom.copySummaryLabel.textContent = 'Copy';
        this.dom.btnCopySummary.classList.remove('btn-copied');
      }, 2000);
    } catch (err) {
      console.error('[SummaryView] Copy failed:', err);
      this.showAlert('Could not copy to clipboard: ' + err.message, 'error');
    }
  }

  /**
   * Updates loading state of primary action button
   * @param {boolean} isLoading 
   * @param {string} label 
   */
  setBtnLoading(isLoading, label) {
    if (isLoading) {
      this.dom.btnSummarize.classList.add('loading');
      this.dom.btnSummarize.disabled = true;
    } else {
      this.dom.btnSummarize.classList.remove('loading');
      this.dom.btnSummarize.disabled = false;
    }
    this.dom.btnSummarizeText.textContent = label;
  }

  /**
   * Displays alert banner
   * @param {string} msg 
   * @param {'error' | 'warning' | 'info'} type 
   */
  showAlert(msg, type = 'info') {
    this.dom.alertBanner.className = `alert-banner alert-${type}`;
    this.dom.alertBanner.querySelector('.alert-text').textContent = msg;
    this.dom.alertBanner.classList.remove('hidden');

    if (type !== 'error') {
      setTimeout(() => this.hideAlert(), 6000);
    }
  }

  /**
   * Hides alert banner
   */
  hideAlert() {
    this.dom.alertBanner.classList.add('hidden');
  }

  /**
   * HTML escape helper
   * @param {string} str 
   * @returns {string}
   */
  escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Basic markdown line formatter for fallback raw display
   * @param {string} md 
   * @returns {string}
   */
  formatSimpleMarkdown(md) {
    return this.escapeHTML(md)
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }
}
