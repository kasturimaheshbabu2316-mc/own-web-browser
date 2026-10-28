/**
 * Sahayak Extension - Summary View Component
 * Handles tab content extraction (Mozilla Readability for articles & YouTube video chapters/transcripts),
 * Gemini prompt formulation with bilingual English/Hinglish dialect support, real-time streaming,
 * and structured card presentation with interactive seek timestamps.
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
      isVideo: false,
      language: DEFAULT_CONFIG.LANGUAGE,
      extractedArticle: null,
      videoData: null,
      isExtracting: false,
      isSummarizing: false,
      rawMarkdown: '',
      generationTimeMs: 0,
      activePort: null
    };

    this._toastTimeout = null;

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

        <!-- Metadata Bar (Shown after successful extraction) -->
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
          <div class="empty-icon-wrap" id="empty-state-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h3 id="empty-state-title">Structured Web & Video Summarizer</h3>
          <p id="empty-state-desc">Extracts clean article text with Readability or YouTube video transcripts. Delivers:</p>
          <div class="features-pill-list" id="empty-features-list">
            <div class="feature-item">
              <span class="feature-bullet">📌</span>
              <strong>TL;DR:</strong> 1–2 crisp, core summary sentences
            </div>
            <div class="feature-item">
              <span class="feature-bullet">⏱️</span>
              <strong>Video Chapters:</strong> Clickable timestamps that seek YouTube playback
            </div>
            <div class="feature-item">
              <span class="feature-bullet">💡</span>
              <strong>Key Insights:</strong> Exactly 5 distilled takeaways
            </div>
            <div class="feature-item">
              <span class="feature-bullet">🌐</span>
              <strong>Bilingual:</strong> Seamless English or colloquial Hinglish output
            </div>
          </div>
          <div class="empty-cta-hint" id="empty-state-cta">Click <strong>"Summarize Page"</strong> above to analyze the current browser tab.</div>
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

          <!-- Section 2: Video Chapters & Timestamps Card (Slice 1.4) -->
          <div class="summary-section-card chapters-card hidden" id="section-chapters-wrap">
            <div class="card-section-header">
              <span class="section-emoji">⏱️</span>
              <h3 class="section-heading">Video Chapters &amp; Timestamps</h3>
              <span class="badge-count" id="chapters-count-badge">Chapters</span>
            </div>
            <div class="section-body" id="section-chapters-content">
              <ul class="chapters-list" id="chapters-list-el">
                <li class="streaming-skeleton-line"></li>
                <li class="streaming-skeleton-line short"></li>
              </ul>
            </div>
          </div>

          <!-- Section 3: Key Insights Card -->
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

          <!-- Section 4: Next Steps Card -->
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

          <!-- Streaming Live Raw Preview -->
          <div class="raw-preview-wrapper hidden" id="raw-preview-wrapper">
            <div class="raw-preview-header">
              <span>Streaming Live Output</span>
              <span class="live-pulse"></span>
            </div>
            <div class="raw-preview-text" id="raw-preview-text"></div>
          </div>

        </div>

        <!-- Floating Seek Toast HUD -->
        <div id="seek-toast" class="seek-toast hidden" role="status" aria-live="polite">
          <span class="seek-toast-icon">⏱️</span>
          <span id="seek-toast-text">Sought video</span>
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
      emptyStateTitle: this.container.querySelector('#empty-state-title'),
      emptyStateDesc: this.container.querySelector('#empty-state-desc'),
      emptyStateCta: this.container.querySelector('#empty-state-cta'),
      summaryWrap: this.container.querySelector('#structured-summary-wrap'),
      tldrContent: this.container.querySelector('#section-tldr-content'),
      chaptersWrap: this.container.querySelector('#section-chapters-wrap'),
      chaptersList: this.container.querySelector('#chapters-list-el'),
      chaptersCountBadge: this.container.querySelector('#chapters-count-badge'),
      insightsList: this.container.querySelector('#insights-list-el'),
      nextStepsList: this.container.querySelector('#next-steps-list-el'),
      rawPreviewWrap: this.container.querySelector('#raw-preview-wrapper'),
      rawPreviewText: this.container.querySelector('#raw-preview-text'),
      seekToast: this.container.querySelector('#seek-toast'),
      seekToastText: this.container.querySelector('#seek-toast-text')
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

    // Delegated click listener for interactive timestamp pills (Slice 1.4)
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.timestamp-pill');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const seconds = parseFloat(btn.getAttribute('data-seconds'));
        if (!isNaN(seconds)) {
          this.seekVideo(seconds, btn.textContent.trim(), btn);
        }
      }
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
   * Tests if URL is a YouTube watch or shorts URL (Slice 1.4)
   * @param {string} url 
   * @returns {boolean}
   */
  isYouTubeUrl(url = '') {
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

  /**
   * Updates the top banner with the active tab's metadata and adapts UI for YouTube vs standard pages
   */
  async refreshActiveTabInfo() {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      this.state.activeTab = tab;
      const isYouTube = this.isYouTubeUrl(tab.url);
      this.state.isVideo = isYouTube;

      this.dom.tabTitle.textContent = tab.title ? tab.title.replace(' - YouTube', '') : 'Untitled Page';
      this.dom.tabTitle.setAttribute('title', tab.title || '');

      try {
        const urlObj = new URL(tab.url || '');
        if (isYouTube) {
          const videoId = urlObj.searchParams.get('v') || urlObj.pathname.replace('/shorts/', '');
          this.dom.tabUrl.textContent = `youtube.com/watch?v=${videoId || '...'}`;
        } else {
          this.dom.tabUrl.textContent = urlObj.hostname + (urlObj.pathname.length > 30 ? urlObj.pathname.slice(0, 30) + '...' : urlObj.pathname);
        }
      } catch {
        this.dom.tabUrl.textContent = tab.url || '';
      }

      // Check if restricted page (internal chrome, store, etc.)
      const isRestricted = this.isRestrictedUrl(tab.url);
      if (isRestricted) {
        this.dom.btnSummarize.disabled = true;
        this.dom.btnSummarize.classList.add('disabled');
        this.dom.btnSummarize.setAttribute('title', 'Browser system pages cannot be accessed by extensions.');
        this.dom.tabFavicon.textContent = '🔒';
        this.dom.btnSummarizeText.textContent = 'Summarize Page';
        this.dom.btnSummarize.classList.remove('btn-youtube');
      } else if (isYouTube) {
        // YouTube video mode styling
        this.dom.btnSummarize.disabled = false;
        this.dom.btnSummarize.classList.remove('disabled');
        this.dom.btnSummarize.removeAttribute('title');
        this.dom.tabFavicon.textContent = '▶️';
        this.dom.btnSummarize.classList.add('btn-youtube');
        this.dom.btnSummarizeText.textContent = 'Summarize Video';
        if (this.dom.emptyStateTitle) {
          this.dom.emptyStateTitle.textContent = 'YouTube Video Summarizer';
          this.dom.emptyStateDesc.textContent = 'Extracts video chapters and transcripts. Delivers clickable timestamps that seek the YouTube player directly:';
          this.dom.emptyStateCta.innerHTML = 'Click <strong>"Summarize Video"</strong> above to analyze this video.';
        }
      } else {
        // Standard Article mode styling
        this.dom.btnSummarize.disabled = false;
        this.dom.btnSummarize.classList.remove('disabled');
        this.dom.btnSummarize.removeAttribute('title');
        this.dom.tabFavicon.textContent = '🌐';
        this.dom.btnSummarize.classList.remove('btn-youtube');
        this.dom.btnSummarizeText.textContent = 'Summarize Page';
        if (this.dom.emptyStateTitle) {
          this.dom.emptyStateTitle.textContent = 'Structured Article Summarizer';
          this.dom.emptyStateDesc.textContent = 'Extracts noise-free article text with Mozilla Readability, stripping ads, popups, and navs. Delivers:';
          this.dom.emptyStateCta.innerHTML = 'Click <strong>"Summarize Page"</strong> above to analyze the current browser tab.';
        }
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
   * Called when active language is switched from the header segment toggle (Slice 1.5)
   * @param {'en' | 'hinglish'} newLang 
   */
  onLanguageChanged(newLang) {
    this.state.language = newLang;
    if (this.state.rawMarkdown) {
      const targetLabel = this.state.isVideo ? 'Re-summarize Video' : 'Re-summarize';
      const langSuffix = newLang === 'hinglish' ? 'in Hinglish' : 'in English';
      this.dom.btnSummarizeText.textContent = `${targetLabel} (${langSuffix})`;
      this.showAlert(`Language set to ${newLang.toUpperCase()}. Click to re-summarize in ${newLang === 'hinglish' ? 'Hinglish' : 'English'}.`, 'info');
    }
  }

  /**
   * Triggered when user clicks "Summarize Page" or "Summarize Video"
   */
  async handleSummarizeClick() {
    if (this.state.isExtracting || this.state.isSummarizing) {
      return;
    }

    this.hideAlert();
    await this.refreshActiveTabInfo();

    if (!this.state.activeTab || this.isRestrictedUrl(this.state.activeTab.url)) {
      this.showAlert('Cannot summarize internal browser pages or empty tabs. Please open any article or YouTube video.', 'warning');
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
    const language = settings[STORAGE_KEYS.LANGUAGE] || this.state.language || DEFAULT_CONFIG.LANGUAGE;
    this.state.language = language;

    const isYouTube = this.state.isVideo || this.isYouTubeUrl(this.state.activeTab.url);

    if (isYouTube) {
      // Branch A: YouTube Video Summarization Pipeline (Slice 1.4)
      await this.handleYouTubeSummarization({
        tabId: this.state.activeTab.id,
        apiKey,
        model,
        language
      });
    } else {
      // Branch B: Article Readability Summarization Pipeline (Slice 1.3 & 1.5)
      await this.handleArticleSummarization({
        tabId: this.state.activeTab.id,
        apiKey,
        model,
        language
      });
    }
  }

  /**
   * Coordinates YouTube video extraction and generation
   */
  async handleYouTubeSummarization({ tabId, apiKey, model, language }) {
    const videoData = await this.extractYouTubeContent(tabId);
    if (!videoData || !videoData.success) {
      if (videoData && videoData.isLiveStream) {
        this.showAlert(videoData.error || 'Live streams cannot be summarized until the broadcast completes.', 'warning');
      } else {
        this.showAlert(videoData?.error || 'Could not extract video data from this YouTube tab.', 'error');
      }
      return;
    }

    this.state.videoData = videoData;

    // Edge Case 1.4: Surface warning if an advertisement was playing
    if (videoData.isAdPlaying) {
      this.showAlert('Advertisement detected. Video notes and timestamps are targeted to the main video.', 'info');
    }

    // Update Metadata Bar
    this.dom.badgeWordCount.textContent = videoData.durationFormatted ? `⏱️ ${videoData.durationFormatted}` : `${videoData.wordCount} words`;
    this.dom.badgeReadingTime.textContent = videoData.channelName ? `${videoData.channelName}` : 'YouTube';
    this.dom.badgeModel.textContent = model.replace('-latest', '').replace('gemini-', '');
    this.dom.badgeModel.className = 'meta-badge meta-badge-yt';
    this.dom.articleMetaBar.classList.remove('hidden');

    // Stream structured summary with chapters and timestamps
    await this.generateStructuredSummary({
      contentData: videoData,
      apiKey,
      model,
      language,
      isVideo: true
    });
  }

  /**
   * Coordinates Article Readability extraction and generation
   */
  async handleArticleSummarization({ tabId, apiKey, model, language }) {
    const article = await this.extractArticleContent(tabId);
    if (!article || !article.success) {
      this.showAlert(article?.error || 'Could not extract readable content from this page.', 'error');
      return;
    }

    this.state.extractedArticle = article;

    if (article.isPaywalled) {
      this.showAlert('Paywall or subscription gate detected on page. Summarizing from available preview text.', 'warning');
    }

    // Update Metadata Bar
    this.dom.badgeWordCount.textContent = `${article.wordCount.toLocaleString()} words`;
    this.dom.badgeReadingTime.textContent = `~${article.readingTimeMinutes} min read`;
    this.dom.badgeModel.textContent = model.replace('-latest', '').replace('gemini-', '');
    this.dom.badgeModel.className = 'meta-badge meta-badge-accent';
    this.dom.articleMetaBar.classList.remove('hidden');

    // Hide chapters card for standard articles
    this.dom.chaptersWrap.classList.add('hidden');

    // Stream structured 3-part article summary
    await this.generateStructuredSummary({
      contentData: article,
      apiKey,
      model,
      language,
      isVideo: false
    });
  }

  /**
   * Extracts YouTube metadata, chapters, and transcript from the active tab
   * @param {number} tabId 
   * @returns {Promise<object>}
   */
  async extractYouTubeContent(tabId) {
    this.state.isExtracting = true;
    this.setBtnLoading(true, 'Extracting Video...');
    this.dom.extractionStatus.classList.remove('hidden');
    this.dom.extractionStatusText.textContent = 'Connecting to YouTube player and extracting transcript...';

    try {
      let response = await this.sendMessageToTab(tabId, { type: IPC_MESSAGES.EXTRACT_YOUTUBE_DATA });

      // If YouTube content script was not ready, dynamically inject and retry
      if (!response) {
        console.log('[SummaryView] YouTube content script missing. Injecting dynamically...');
        this.dom.extractionStatusText.textContent = 'Injecting YouTube perception script...';

        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/youtube.js']
        });

        await new Promise(r => setTimeout(r, 200));
        response = await this.sendMessageToTab(tabId, { type: IPC_MESSAGES.EXTRACT_YOUTUBE_DATA });
      }

      return response;
    } catch (err) {
      console.error('[SummaryView] YouTube extraction failure:', err);
      return { success: false, error: `YouTube extraction error: ${err.message}` };
    } finally {
      this.state.isExtracting = false;
      this.dom.extractionStatus.classList.add('hidden');
      this.setBtnLoading(false, 'Summarize Video');
    }
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

      if (!response) {
        console.log('[SummaryView] Content script missing. Injecting dynamically via chrome.scripting...');
        this.dom.extractionStatusText.textContent = 'Injecting extraction engine into active tab...';

        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/readability.js', 'src/content/extractor.js']
        });

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
   * Generates structured summary using real-time streaming over background port
   */
  async generateStructuredSummary({ contentData, apiKey, model, language, isVideo }) {
    this.state.isSummarizing = true;
    this.setBtnLoading(true, isVideo ? 'Summarizing Video...' : 'Summarizing...');
    this.dom.emptyState.classList.add('hidden');
    this.dom.summaryWrap.classList.remove('hidden');

    // Reset card contents to loading skeleton state
    this.renderSkeletons(isVideo);
    this.dom.rawPreviewWrap.classList.remove('hidden');
    this.dom.rawPreviewText.textContent = 'Connecting to Gemini Flash-Lite...';

    const startTime = Date.now();
    this.dom.badgeLatency.textContent = 'Generating...';

    const systemInstruction = this.buildSystemPrompt(language, isVideo);
    const userPrompt = this.buildUserPrompt(contentData, language, isVideo);

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
          this.renderIncrementalSummary(accumulatedText, isVideo);

        } else if (msg.type === IPC_MESSAGES.STREAM_DONE) {
          const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
          this.dom.badgeLatency.textContent = `${totalDuration}s`;
          this.state.rawMarkdown = msg.text || accumulatedText;

          // Final polished render with interactive timestamp buttons
          this.renderFinalSummary(this.state.rawMarkdown, isVideo);
          this.dom.rawPreviewWrap.classList.add('hidden');

          this.setBtnLoading(false, isVideo ? 'Re-summarize Video' : 'Re-summarize');
          this.state.isSummarizing = false;
          port.disconnect();

        } else if (msg.type === IPC_MESSAGES.STREAM_ERROR) {
          this.dom.badgeLatency.textContent = 'Error';
          this.showAlert(`Summarization error: ${msg.error}`, 'error');
          this.setBtnLoading(false, isVideo ? 'Summarize Video' : 'Summarize Page');
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
      this.setBtnLoading(false, isVideo ? 'Summarize Video' : 'Summarize Page');
      this.state.isSummarizing = false;
    }
  }

  /**
   * Constructs strict system prompt for Article or YouTube video in English or Hinglish (Slice 1.4 & 1.5)
   * @param {'en' | 'hinglish'} language 
   * @param {boolean} isVideo 
   * @returns {string}
   */
  buildSystemPrompt(language, isVideo = false) {
    if (isVideo) {
      // YouTube Video Prompts (Slice 1.4)
      if (language === 'hinglish') {
        return `You are Sahayak, an intelligent AI browser video copilot.
Your task is to summarize the provided YouTube video in natural, fluent Hinglish (conversational Hindi grammar written using the English/Latin alphabet, keeping all technical, digital, and domain terms in standard English).
Example: "Yeh video explain karta hai ki microservices architecture kaise scale hoti hai..."

Strict Output Structure:
### 📌 TL;DR
[1–2 crisp, impactful sentences in Hinglish summarizing the core message and purpose of the video]

### ⏱️ Video Chapters & Timestamps
- [MM:SS] [Chapter Name in English] - [1 sentence key detail in Hinglish]
- [MM:SS] [Chapter Name in English] - [1 sentence key detail in Hinglish]
- [MM:SS] [Chapter Name in English] - [1 sentence key detail in Hinglish]
(Provide between 3 and 7 chronological chapters with exact [MM:SS] or [HH:MM:SS] timestamps)

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
- Every single bullet under "Video Chapters & Timestamps" MUST start with a bracketed timestamp like [MM:SS] or [HH:MM:SS] (e.g. [02:15]).
- Strictly produce exactly 5 bullet points under Key Insights.
- Strictly produce 2–3 items under Next Steps.
- Ground all facts strictly in the video transcript and chapters. Never hallucinate.
- Never output pleasantries, apologies, or preamble outside the headers.`;
      }

      return `You are Sahayak, an elite AI browser video copilot.
Your task is to deliver a high-value, structured summary of the provided YouTube video with chapterized notes and clickable timestamps.

Strict Output Structure:
### 📌 TL;DR
[1–2 crisp, impactful sentences summarizing the core thesis and significance of the video]

### ⏱️ Video Chapters & Timestamps
- [MM:SS] [Chapter Title] - [Key point discussed at this moment]
- [MM:SS] [Chapter Title] - [Key point discussed at this moment]
- [MM:SS] [Chapter Title] - [Key point discussed at this moment]
(Provide between 3 and 7 chronological chapters with exact [MM:SS] or [HH:MM:SS] timestamps)

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
- Every single bullet under "Video Chapters & Timestamps" MUST start with a bracketed timestamp like [MM:SS] or [HH:MM:SS] (e.g. [02:15]).
- Strictly produce exactly 5 bullet points under Key Insights.
- Strictly produce 2–3 concrete next steps or takeaways.
- Ground every insight strictly in the provided video transcript and chapters.
- Do not include any filler intro or conclusion.`;
    }

    // Standard Article Prompts (Slice 1.3 & 1.5)
    if (language === 'hinglish') {
      return `You are Sahayak, an intelligent AI browser reading assistant.
Your task is to summarize the provided webpage text into natural, fluent Hinglish (conversational Hindi grammar written using the English/Latin alphabet, keeping all technical, digital, and domain terms in standard English).
Example: "Yeh article explain karta hai ki microservices architecture kaise scale hoti hai..."

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
- Do not include any filler intro or conclusion.`;
  }

  /**
   * Constructs user prompt with untrusted delimiters
   * @param {object} data 
   * @param {string} language 
   * @param {boolean} isVideo 
   * @returns {string}
   */
  buildUserPrompt(data, language, isVideo = false) {
    if (isVideo) {
      const langDirective = language === 'hinglish'
        ? 'Summarize this YouTube video in fluent conversational Hinglish following the strict 4 sections with timestamps.'
        : 'Summarize this YouTube video following the strict 4 sections with timestamps.';

      return `${langDirective}

<<<UNTRUSTED_YOUTUBE_VIDEO_CONTENT>>>
Video Title: ${data.title}
Channel / Creator: ${data.channelName || 'Unknown'}
Duration: ${data.durationFormatted || 'Unknown'}
Video URL: ${data.url}

${data.textContent}
<<<END_UNTRUSTED_CONTENT>>>`;
    }

    const langDirective = language === 'hinglish'
      ? 'Summarize this article in fluent conversational Hinglish following the 3 sections.'
      : 'Summarize this article following the strict 3 sections.';

    return `${langDirective}

<<<UNTRUSTED_WEB_PAGE_CONTENT>>>
Article Title: ${data.title}
Site / Host: ${data.siteName}
URL: ${data.url}
Byline: ${data.byline || 'Unknown'}

${data.textContent}
<<<END_UNTRUSTED_CONTENT>>>`;
  }

  /**
   * Parses markdown sections dynamically (TL;DR, Chapters, Key Insights, Next Steps)
   * @param {string} markdown 
   * @returns {{ tldr: string, chapters: string[], keyInsights: string[], nextSteps: string[] }}
   */
  parseSections(markdown) {
    const sections = {
      tldr: '',
      chapters: [],
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

    // Extract Chapters & Timestamps (Slice 1.4)
    const chaptersMatch = markdown.match(/###\s*.*(?:Chapters|Timestamps)[\s\S]*?(?=###|$)/i);
    if (chaptersMatch) {
      const rawText = chaptersMatch[0]
        .replace(/###\s*.*(?:Chapters|Timestamps)[^\n]*\n?/i, '')
        .trim();

      sections.chapters = rawText
        .split('\n')
        .map(line => line.replace(/^[-*•\d.]+\s*/, '').trim())
        .filter(line => line.length > 3);
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
   * Converts timestamp string like MM:SS or HH:MM:SS to total seconds
   * @param {string} timeStr 
   * @returns {number}
   */
  parseTimestampToSeconds(timeStr = '') {
    if (!timeStr) return 0;
    const cleanStr = timeStr.trim().replace(/^\[|\]$/g, '');
    const parts = cleanStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  /**
   * Replaces timestamp occurrences like [02:15] with interactive clickable timestamp pills
   * @param {string} text 
   * @returns {string} HTML with clickable buttons
   */
  formatTextWithClickableTimestamps(text = '') {
    if (!text) return '';
    const escaped = this.escapeHTML(text);

    // Matches bracketed timestamps like [02:15] or [1:23:45]
    return escaped.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, timeStr) => {
      const sec = this.parseTimestampToSeconds(timeStr);
      return `<button type="button" class="timestamp-pill" data-seconds="${sec}" title="Seek video to ${timeStr}">▶ [${timeStr}]</button>`;
    });
  }

  /**
   * Incrementally updates DOM elements during streaming
   * @param {string} rawText 
   * @param {boolean} isVideo 
   */
  renderIncrementalSummary(rawText, isVideo = false) {
    const { tldr, chapters, keyInsights, nextSteps } = this.parseSections(rawText);

    if (tldr) {
      this.dom.tldrContent.innerHTML = `<p class="tldr-text">${this.formatTextWithClickableTimestamps(tldr)}</p>`;
    }

    if (isVideo && chapters && chapters.length > 0) {
      this.dom.chaptersWrap.classList.remove('hidden');
      this.dom.chaptersCountBadge.textContent = `${chapters.length} Chapters`;
      this.dom.chaptersList.innerHTML = chapters
        .map(item => `<li class="chapter-item">${this.formatChapterLine(item)}</li>`)
        .join('');
    }

    if (keyInsights && keyInsights.length > 0) {
      this.dom.insightsList.innerHTML = keyInsights
        .map(item => `<li><span class="insight-bullet">▸</span><span>${this.formatTextWithClickableTimestamps(item)}</span></li>`)
        .join('');
    }

    if (nextSteps && nextSteps.length > 0) {
      this.dom.nextStepsList.innerHTML = nextSteps
        .map((step, idx) => `<li><span class="step-num">${idx + 1}</span><span>${this.formatTextWithClickableTimestamps(step)}</span></li>`)
        .join('');
    }
  }

  /**
   * Renders the finalized summary cards
   * @param {string} fullMarkdown 
   * @param {boolean} isVideo 
   */
  renderFinalSummary(fullMarkdown, isVideo = false) {
    const { tldr, chapters, keyInsights, nextSteps } = this.parseSections(fullMarkdown);

    if (tldr || keyInsights.length > 0 || (isVideo && chapters.length > 0)) {
      this.dom.tldrContent.innerHTML = `<p class="tldr-text">${this.formatTextWithClickableTimestamps(tldr || 'Summary generated.')}</p>`;

      if (isVideo && chapters && chapters.length > 0) {
        this.dom.chaptersWrap.classList.remove('hidden');
        this.dom.chaptersCountBadge.textContent = `${chapters.length} Chapters`;
        this.dom.chaptersList.innerHTML = chapters
          .map(item => `<li class="chapter-item">${this.formatChapterLine(item)}</li>`)
          .join('');
      } else {
        this.dom.chaptersWrap.classList.add('hidden');
      }

      if (keyInsights.length > 0) {
        this.dom.insightsList.innerHTML = keyInsights
          .map(item => `<li><span class="insight-bullet">▸</span><span>${this.formatTextWithClickableTimestamps(item)}</span></li>`)
          .join('');
      }

      if (nextSteps.length > 0) {
        this.dom.nextStepsList.innerHTML = nextSteps
          .map((step, idx) => `<li><span class="step-num">${idx + 1}</span><span>${this.formatTextWithClickableTimestamps(step)}</span></li>`)
          .join('');
      }
    } else {
      // Fallback: If model did not strictly format headers, display formatted raw markdown
      this.dom.tldrContent.innerHTML = `<div class="formatted-raw-body">${this.formatSimpleMarkdown(fullMarkdown)}</div>`;
    }
  }

  /**
   * Formats a single chapter line ensuring timestamp is interactive
   * @param {string} rawLine 
   * @returns {string}
   */
  formatChapterLine(rawLine = '') {
    // Check if line starts with [MM:SS] or MM:SS
    const match = rawLine.match(/^(?:\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\])?\s*[-–—:]?\s*(.*)$/);
    if (match) {
      const timeStr = match[1];
      const desc = match[2];
      const sec = this.parseTimestampToSeconds(timeStr);
      return `
        <button type="button" class="timestamp-pill" data-seconds="${sec}" title="Seek video to ${timeStr}">▶ [${timeStr}]</button>
        <span class="chapter-title">${this.escapeHTML(desc)}</span>
      `;
    }

    return `<span>${this.formatTextWithClickableTimestamps(rawLine)}</span>`;
  }

  /**
   * Seeks the active tab video player to the target seconds (Slice 1.4)
   * @param {number} seconds 
   * @param {string} timeLabel 
   * @param {HTMLElement} btnElement 
   */
  async seekVideo(seconds, timeLabel = '', btnElement = null) {
    if (!this.state.activeTab || !this.state.activeTab.id) {
      console.warn('[SummaryView] Cannot seek video: no active tab.');
      return;
    }

    if (btnElement) {
      btnElement.classList.add('seeking');
      setTimeout(() => btnElement.classList.remove('seeking'), 800);
    }

    this.showSeekToast(timeLabel || `${Math.floor(seconds)}s`);

    try {
      chrome.tabs.sendMessage(
        this.state.activeTab.id,
        {
          type: IPC_MESSAGES.SEEK_YOUTUBE_VIDEO,
          seconds
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('[SummaryView] Forwarding seek message via Service Worker...');
            chrome.runtime.sendMessage({
              type: IPC_MESSAGES.SEEK_YOUTUBE_VIDEO,
              tabId: this.state.activeTab.id,
              seconds
            });
          } else {
            console.log('[SummaryView] Seek acknowledged by tab:', response);
          }
        }
      );
    } catch (err) {
      console.error('[SummaryView] Seek error:', err);
    }
  }

  /**
   * Displays subtle floating toast confirming video seeking action
   * @param {string} timeLabel 
   */
  showSeekToast(timeLabel) {
    if (!this.dom.seekToast) return;
    this.dom.seekToastText.textContent = `Jumped video player to ${timeLabel}`;
    this.dom.seekToast.classList.remove('hidden');

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      if (this.dom.seekToast) {
        this.dom.seekToast.classList.add('hidden');
      }
    }, 2000);
  }

  /**
   * Renders skeleton placeholder lines inside cards during generation
   * @param {boolean} isVideo 
   */
  renderSkeletons(isVideo = false) {
    this.dom.tldrContent.innerHTML = `
      <div class="streaming-skeleton-line"></div>
      <div class="streaming-skeleton-line short"></div>
    `;

    if (isVideo) {
      this.dom.chaptersWrap.classList.remove('hidden');
      this.dom.chaptersList.innerHTML = `
        <li class="streaming-skeleton-line"></li>
        <li class="streaming-skeleton-line short"></li>
      `;
    } else {
      this.dom.chaptersWrap.classList.add('hidden');
    }

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
    if (!this.state.rawMarkdown && !this.state.extractedArticle && !this.state.videoData) return;

    let textToCopy = this.state.rawMarkdown;
    if (!textToCopy) {
      if (this.state.videoData) {
        textToCopy = `# ${this.state.videoData.title}\nSource: ${this.state.videoData.url}\n\n${this.state.videoData.textContent}`;
      } else if (this.state.extractedArticle) {
        textToCopy = `# ${this.state.extractedArticle.title}\nSource: ${this.state.extractedArticle.url}\n\n${this.state.extractedArticle.textContent}`;
      }
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
