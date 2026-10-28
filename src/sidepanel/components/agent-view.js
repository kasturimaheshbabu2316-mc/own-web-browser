/**
 * Sahayak Extension - Agent View Component (Phase 3, Slice 3.1)
 * Interactive Element Scanner UI:
 * - Scans active DOM for interactive elements (buttons, inputs, links, selects)
 * - Excludes password and hidden fields (quarantine guardrail)
 * - Categorizes and flags consequential actions (submit, delete, pay)
 * - Renders sequential numbered action map cards (#1, #2, #3...)
 * - Enables click-to-highlight with smooth page scrolling
 */

import { IPC_MESSAGES, DEFAULT_CONFIG } from '../../shared/constants.js';

export class AgentView {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container - The #view-agent container element
   * @param {function} options.onNavigateToSettings - Callback to switch to settings
   */
  constructor({ container, onNavigateToSettings }) {
    this.container = container;
    this.onNavigateToSettings = onNavigateToSettings;

    // Component State
    this.state = {
      activeTab: null,
      isScanning: false,
      elements: [], // Array of { id, tag, type, label, placeholder, isConsequential, bounds }
      activeFilter: 'all', // 'all' | 'input' | 'button' | 'link' | 'consequential'
      searchQuery: '',
      highlightedId: null
    };

    this.initDOM();
    this.bindEvents();
    this.refreshActiveTabInfo();
  }

  /**
   * Caches DOM references
   */
  initDOM() {
    this.dom = {
      tabBanner: this.container.querySelector('#agent-tab-banner'),
      tabFavicon: this.container.querySelector('#agent-tab-favicon'),
      tabTitle: this.container.querySelector('#agent-tab-title'),
      tabUrl: this.container.querySelector('#agent-tab-url'),
      btnScan: this.container.querySelector('#btn-scan-elements'),
      btnScanText: this.container.querySelector('#btn-scan-text'),
      btnOpenPractice: this.container.querySelector('#btn-open-practice'),
      btnEmptyScan: this.container.querySelector('#btn-empty-scan'),
      btnClearHighlights: this.container.querySelector('#btn-clear-highlights'),
      alertBanner: this.container.querySelector('#agent-alert'),
      emptyState: this.container.querySelector('#agent-empty-state'),
      scannedContent: this.container.querySelector('#agent-scanned-content'),
      metricTotal: this.container.querySelector('#metric-total'),
      metricInputs: this.container.querySelector('#metric-inputs'),
      metricButtons: this.container.querySelector('#metric-buttons'),
      metricLinks: this.container.querySelector('#metric-links'),
      metricConsequential: this.container.querySelector('#metric-consequential'),
      filterPills: this.container.querySelectorAll('.filter-pill'),
      countFilterAll: this.container.querySelector('#count-filter-all'),
      countFilterInputs: this.container.querySelector('#count-filter-inputs'),
      countFilterButtons: this.container.querySelector('#count-filter-buttons'),
      countFilterLinks: this.container.querySelector('#count-filter-links'),
      countFilterConsequential: this.container.querySelector('#count-filter-consequential'),
      searchInput: this.container.querySelector('#scanner-search-input'),
      elementsList: this.container.querySelector('#scanned-elements-list')
    };
  }

  /**
   * Binds UI events
   */
  bindEvents() {
    // Scan triggers
    if (this.dom.btnScan) {
      this.dom.btnScan.addEventListener('click', () => this.scanActiveTab());
    }
    if (this.dom.btnEmptyScan) {
      this.dom.btnEmptyScan.addEventListener('click', () => this.scanActiveTab());
    }

    // Open Practice Form button
    if (this.dom.btnOpenPractice) {
      this.dom.btnOpenPractice.addEventListener('click', () => {
        const practiceUrl = chrome.runtime.getURL('assets/practice/internship-form.html');
        chrome.tabs.create({ url: practiceUrl });
      });
    }

    // Clear highlights button
    if (this.dom.btnClearHighlights) {
      this.dom.btnClearHighlights.addEventListener('click', () => this.clearHighlights());
    }

    // Filter pills
    if (this.dom.filterPills) {
      this.dom.filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
          this.dom.filterPills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.state.activeFilter = pill.getAttribute('data-filter') || 'all';
          this.renderFilteredElements();
        });
      });
    }

    // Search input
    if (this.dom.searchInput) {
      this.dom.searchInput.addEventListener('input', (e) => {
        this.state.searchQuery = (e.target.value || '').trim().toLowerCase();
        this.renderFilteredElements();
      });
    }

    // Delegated click on element card action
    if (this.dom.elementsList) {
      this.dom.elementsList.addEventListener('click', (e) => {
        const card = e.target.closest('.scanned-element-card');
        if (!card) return;

        const id = parseInt(card.getAttribute('data-id'), 10);
        if (id) {
          this.highlightElement(id);
        }
      });
    }

    // Refresh active tab info on browser tab switches
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        if (this.container && this.container.classList.contains('active')) {
          this.refreshActiveTabInfo();
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'complete' && this.container && this.container.classList.contains('active')) {
          if (this.state.activeTab && this.state.activeTab.id === tabId) {
            this.refreshActiveTabInfo();
          }
        }
      });
    }
  }

  /**
   * Called when Agent tab is switched to in the sidepanel
   */
  async onTabActivated() {
    await this.refreshActiveTabInfo();
  }

  /**
   * Refreshes active tab title, url, and favicon
   */
  async refreshActiveTabInfo() {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      this.state.activeTab = tab;

      if (this.dom.tabTitle) {
        this.dom.tabTitle.textContent = tab.title || 'Active Webpage';
      }

      if (this.dom.tabUrl) {
        try {
          const parsed = new URL(tab.url);
          this.dom.tabUrl.textContent = parsed.hostname + parsed.pathname;
        } catch (_) {
          this.dom.tabUrl.textContent = tab.url || '';
        }
      }

      if (this.dom.tabFavicon) {
        if (tab.favIconUrl) {
          this.dom.tabFavicon.innerHTML = `<img src="${this.escapeHTML(tab.favIconUrl)}" style="width:16px;height:16px;border-radius:3px;" onerror="this.innerText='🌐'" alt="" />`;
        } else {
          this.dom.tabFavicon.textContent = '🌐';
        }
      }
    } catch (err) {
      console.warn('[AgentView] Could not fetch active tab info:', err);
    }
  }

  /**
   * Checks if URL cannot be scripted (chrome://, edge://, file without perms, etc.)
   * @param {string} url
   * @returns {boolean}
   */
  isRestrictedUrl(url = '') {
    return (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('view-source:')
    );
  }

  /**
   * Dispatches message to active tab with auto-injection fallback
   * @param {number} tabId
   * @param {object} message
   * @returns {Promise<any>}
   */
  async sendMessageToTab(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      console.log('[AgentView] Tab message not received, attempting dynamic scanner injection...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/scanner.js']
        });
        await new Promise(r => setTimeout(r, 150));
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (injectionErr) {
        console.error('[AgentView] Dynamic injection failed:', injectionErr);
        throw injectionErr;
      }
    }
  }

  /**
   * Scans active tab for interactive elements
   */
  async scanActiveTab() {
    if (this.state.isScanning) return;

    try {
      this.setScanning(true);
      this.hideAlert();

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        this.showAlert('No active browser tab found to scan.', 'error');
        return;
      }

      this.state.activeTab = tab;

      if (this.isRestrictedUrl(tab.url)) {
        this.showAlert('Internal browser pages (chrome://) cannot be scanned for security reasons.', 'warning');
        return;
      }

      const response = await this.sendMessageToTab(tab.id, {
        type: IPC_MESSAGES.SCAN_ELEMENTS
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to scan DOM elements.');
      }

      this.state.elements = response.elements || [];
      console.log(`[Sahayak AgentView] Received ${this.state.elements.length} scanned elements:`, this.state.elements);
      console.table(this.state.elements.map(e => ({
        ID: e.id,
        Tag: e.tag,
        Type: e.type,
        Label: e.label,
        Consequential: e.isConsequential ? '⚠️ YES' : 'No'
      })));

      this.updateMetrics();
      this.dom.emptyState.classList.add('hidden');
      this.dom.scannedContent.classList.remove('hidden');
      this.renderFilteredElements();

      const count = this.state.elements.length;
      this.showAlert(`Discovered ${count} interactive elements. Click any element to highlight on page.`, 'success');
    } catch (err) {
      console.error('[AgentView] Scan failed:', err);
      this.showAlert(`Scan failed: ${err.message || 'Please refresh the active webpage and try again.'}`, 'error');
    } finally {
      this.setScanning(false);
    }
  }

  /**
   * Updates metrics counter cards & filter tab counts
   */
  updateMetrics() {
    const elements = this.state.elements;

    let inputCount = 0;
    let buttonCount = 0;
    let linkCount = 0;
    let consequentialCount = 0;

    for (const el of elements) {
      const tag = el.tag;
      const type = el.type;

      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (type === 'submit' || type === 'button' || type === 'reset') {
          buttonCount++;
        } else {
          inputCount++;
        }
      } else if (tag === 'BUTTON' || el.type === 'button') {
        buttonCount++;
      } else if (tag === 'A' || el.type === 'link') {
        linkCount++;
      }

      if (el.isConsequential) {
        consequentialCount++;
      }
    }

    // Set numbers in UI
    if (this.dom.metricTotal) this.dom.metricTotal.textContent = elements.length;
    if (this.dom.metricInputs) this.dom.metricInputs.textContent = inputCount;
    if (this.dom.metricButtons) this.dom.metricButtons.textContent = buttonCount;
    if (this.dom.metricLinks) this.dom.metricLinks.textContent = linkCount;
    if (this.dom.metricConsequential) this.dom.metricConsequential.textContent = consequentialCount;

    // Filter pill counts
    if (this.dom.countFilterAll) this.dom.countFilterAll.textContent = elements.length;
    if (this.dom.countFilterInputs) this.dom.countFilterInputs.textContent = inputCount;
    if (this.dom.countFilterButtons) this.dom.countFilterButtons.textContent = buttonCount;
    if (this.dom.countFilterLinks) this.dom.countFilterLinks.textContent = linkCount;
    if (this.dom.countFilterConsequential) this.dom.countFilterConsequential.textContent = consequentialCount;
  }

  /**
   * Highlights target element in the active tab
   * @param {number} id
   */
  async highlightElement(id) {
    try {
      this.state.highlightedId = id;

      // Update card visual active ring
      this.dom.elementsList.querySelectorAll('.scanned-element-card').forEach(card => {
        const cardId = parseInt(card.getAttribute('data-id'), 10);
        card.classList.toggle('card-highlighted', cardId === id);
      });

      if (!this.state.activeTab) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        this.state.activeTab = tab;
      }

      if (this.state.activeTab && this.state.activeTab.id) {
        await this.sendMessageToTab(this.state.activeTab.id, {
          type: IPC_MESSAGES.HIGHLIGHT_ELEMENT,
          id
        });
      }
    } catch (err) {
      console.warn('[AgentView] Highlight request failed:', err);
    }
  }

  /**
   * Clears highlights on page
   */
  async clearHighlights() {
    try {
      this.state.highlightedId = null;
      this.dom.elementsList.querySelectorAll('.scanned-element-card').forEach(card => {
        card.classList.remove('card-highlighted');
      });

      if (this.state.activeTab && this.state.activeTab.id) {
        await this.sendMessageToTab(this.state.activeTab.id, {
          type: IPC_MESSAGES.CLEAR_HIGHLIGHTS
        });
      }
      this.showAlert('Highlights cleared.', 'info');
    } catch (err) {
      console.warn('[AgentView] Clear highlights failed:', err);
    }
  }

  /**
   * Renders action map element cards according to active filter and search query
   */
  renderFilteredElements() {
    const listEl = this.dom.elementsList;
    if (!listEl) return;

    const filter = this.state.activeFilter;
    const query = this.state.searchQuery;

    const filtered = this.state.elements.filter(el => {
      // 1. Category Filter
      if (filter === 'input') {
        const isInput = (el.tag === 'INPUT' && el.type !== 'submit' && el.type !== 'button') ||
                        el.tag === 'TEXTAREA' || el.tag === 'SELECT';
        if (!isInput) return false;
      } else if (filter === 'button') {
        const isBtn = el.tag === 'BUTTON' || el.type === 'submit' || el.type === 'button' || el.type === 'reset';
        if (!isBtn) return false;
      } else if (filter === 'link') {
        if (el.tag !== 'A' && el.type !== 'link') return false;
      } else if (filter === 'consequential') {
        if (!el.isConsequential) return false;
      }

      // 2. Search query filter
      if (query) {
        const idMatch = el.id.toString() === query || `#${el.id}` === query;
        const labelMatch = (el.label || '').toLowerCase().includes(query);
        const tagMatch = (el.tag || '').toLowerCase().includes(query);
        const typeMatch = (el.type || '').toLowerCase().includes(query);
        const placeholderMatch = (el.placeholder || '').toLowerCase().includes(query);
        if (!idMatch && !labelMatch && !tagMatch && !typeMatch && !placeholderMatch) {
          return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="scanner-no-results">
          <span class="no-results-icon">🔍</span>
          <p>No interactive elements match the active filter or search term.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(el => {
      const isConsequential = el.isConsequential;
      const isHighlighted = this.state.highlightedId === el.id;
      const boundsStr = el.bounds ? `📍 (${el.bounds.x}, ${el.bounds.y}) • ${el.bounds.width}×${el.bounds.height}px` : '';

      return `
        <div class="scanned-element-card ${isHighlighted ? 'card-highlighted' : ''} ${isConsequential ? 'card-consequential' : ''}" data-id="${el.id}">
          <div class="element-card-header">
            <div class="element-card-meta">
              <span class="element-id-badge">#${el.id}</span>
              <span class="element-tag-pill">&lt;${this.escapeHTML(el.tag)}&gt;</span>
              <span class="element-type-pill">${this.escapeHTML(el.type)}</span>
            </div>
            ${isConsequential ? `
              <span class="consequential-warning-pill" title="This element may perform a consequential action (submit, delete, pay)">
                ⚠️ Consequential
              </span>
            ` : ''}
          </div>

          <div class="element-card-body">
            <div class="element-label-row">
              <strong class="element-label">${this.escapeHTML(el.label || 'Unnamed Action')}</strong>
            </div>

            ${el.placeholder ? `
              <div class="element-placeholder-row">
                <span class="placeholder-label">Placeholder:</span>
                <span class="placeholder-text">"${this.escapeHTML(el.placeholder)}"</span>
              </div>
            ` : ''}

            <div class="element-footer-row">
              <span class="element-bounds">${boundsStr}</span>
              <button type="button" class="btn-highlight-element" title="Scroll into view and pulse glowing cyan outline on page">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="22" y1="12" x2="18" y2="12"/>
                  <line x1="6" y1="12" x2="2" y2="12"/>
                  <line x1="12" y1="6" x2="12" y2="2"/>
                  <line x1="12" y1="22" x2="12" y2="18"/>
                </svg>
                <span>Highlight</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Sets scanning button state
   * @param {boolean} isScanning
   */
  setScanning(isScanning) {
    this.state.isScanning = isScanning;
    if (this.dom.btnScan) {
      this.dom.btnScan.disabled = isScanning;
      if (isScanning) {
        this.dom.btnScan.classList.add('loading');
        if (this.dom.btnScanText) this.dom.btnScanText.textContent = 'Scanning DOM...';
      } else {
        this.dom.btnScan.classList.remove('loading');
        if (this.dom.btnScanText) this.dom.btnScanText.textContent = 'Scan Page';
      }
    }
    if (this.dom.btnEmptyScan) {
      this.dom.btnEmptyScan.disabled = isScanning;
    }
  }

  /**
   * Displays alert banner
   * @param {string} msg
   * @param {'info' | 'success' | 'warning' | 'error'} type
   */
  showAlert(msg, type = 'info') {
    if (!this.dom.alertBanner) return;
    this.dom.alertBanner.className = `alert-banner alert-${type}`;
    const textEl = this.dom.alertBanner.querySelector('.alert-text');
    if (textEl) textEl.textContent = msg;
    this.dom.alertBanner.classList.remove('hidden');

    if (type !== 'error') {
      setTimeout(() => this.hideAlert(), 4500);
    }
  }

  /**
   * Hides alert banner
   */
  hideAlert() {
    if (this.dom.alertBanner) {
      this.dom.alertBanner.classList.add('hidden');
    }
  }

  /**
   * HTML escape helper
   */
  escapeHTML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
