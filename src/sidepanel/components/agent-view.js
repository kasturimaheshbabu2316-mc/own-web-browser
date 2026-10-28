/**
 * Sahayak Extension - Agent View Component (Phase 3, Slices 3.1, 3.2, 3.3)
 * Interactive Element Scanner & "Find It For Me" Natural Language Locator:
 * - Scans active DOM for interactive elements (buttons, inputs, links, selects)
 * - Excludes password and hidden fields (security quarantine guardrail)
 * - Categorizes and flags consequential actions (submit, delete, pay)
 * - Renders sequential numbered action map cards (#1, #2, #3...)
 * - Visual Numbered Badges in closed Shadow DOM overlay (Slice 3.2)
 * - "Find It For Me" AI natural language element locator with amber glowing pulse (Slice 3.3)
 */

import { IPC_MESSAGES, DEFAULT_CONFIG, STORAGE_KEYS, AGENT_STATES } from '../../shared/constants.js';

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
      isFinding: false,
      badgesVisible: false,
      foundElementId: null,
      language: DEFAULT_CONFIG.LANGUAGE,
      elements: [], // Array of { id, tag, type, label, placeholder, isConsequential, bounds }
      activeFilter: 'all', // 'all' | 'input' | 'button' | 'link' | 'consequential'
      searchQuery: '',
      highlightedId: null,
      // Phase 3 Slice 3.4 HITL Task State
      taskState: {
        status: AGENT_STATES.IDLE,
        goal: '',
        currentStep: 1,
        maxSteps: 10,
        dryRun: false,
        proposedAction: null,
        history: [],
        error: null
      }
    };

    this.initDOM();
    this.bindEvents();
    this.loadLanguagePreference();
    this.refreshActiveTabInfo();
    this.initTaskStateSync();
  }

  /**
   * Loads initial saved language
   */
  async loadLanguagePreference() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get([STORAGE_KEYS.LANGUAGE]);
        if (data[STORAGE_KEYS.LANGUAGE]) {
          this.state.language = data[STORAGE_KEYS.LANGUAGE];
        }
      }
    } catch (_) {}
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
      btnToggleBadges: this.container.querySelector('#btn-toggle-badges'),
      btnToggleBadgesText: this.container.querySelector('#btn-toggle-badges-text'),
      btnEmptyScan: this.container.querySelector('#btn-empty-scan'),
      btnClearHighlights: this.container.querySelector('#btn-clear-highlights'),
      alertBanner: this.container.querySelector('#agent-alert'),
      emptyState: this.container.querySelector('#agent-empty-state'),
      scannedContent: this.container.querySelector('#agent-scanned-content'),

      // "Find It For Me" DOM references (Slice 3.3)
      findCard: this.container.querySelector('#find-locator-card'),
      findQueryInput: this.container.querySelector('#find-query-input'),
      btnFindSubmit: this.container.querySelector('#btn-find-submit'),
      findChipsRow: this.container.querySelector('#find-chips-row'),
      findResultBox: this.container.querySelector('#find-result-box'),
      findTargetBadge: this.container.querySelector('#find-target-badge'),
      findResultTitle: this.container.querySelector('#find-result-title'),
      findResultDesc: this.container.querySelector('#find-result-desc'),
      btnRefocusFound: this.container.querySelector('#btn-refocus-found'),

      // Metrics & Filters
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
      elementsList: this.container.querySelector('#scanned-elements-list'),

      // Human-in-the-Loop Errand Runner references (Slice 3.4)
      errandSection: this.container.querySelector('#errand-section'),
      errandRunnerCard: this.container.querySelector('#errand-runner-card'),
      errandGoalInput: this.container.querySelector('#errand-goal-input'),
      btnStartErrand: this.container.querySelector('#btn-start-errand'),
      errandChipsRow: this.container.querySelector('#errand-chips-row'),
      chkDryRun: this.container.querySelector('#chk-errand-dry-run'),
      selectMaxSteps: this.container.querySelector('#select-errand-max-steps'),

      // Action Proposal Card references (Slice 3.4)
      actionProposalCard: this.container.querySelector('#action-proposal-card'),
      proposalStatusPill: this.container.querySelector('#proposal-status-pill'),
      proposalStatusText: this.container.querySelector('#proposal-status-text'),
      proposalStepCounter: this.container.querySelector('#proposal-step-counter'),
      btnStopErrandTop: this.container.querySelector('#btn-stop-errand-top'),
      proposalGoalText: this.container.querySelector('#proposal-goal-text'),
      proposalBody: this.container.querySelector('#proposal-body'),
      proposalActionType: this.container.querySelector('#proposal-action-type'),
      proposalTargetId: this.container.querySelector('#proposal-target-id'),
      proposalTargetLabel: this.container.querySelector('#proposal-target-label'),
      btnRefocusProposal: this.container.querySelector('#btn-refocus-proposal'),
      proposalValueRow: this.container.querySelector('#proposal-value-row'),
      proposalValueCode: this.container.querySelector('#proposal-value-code'),
      proposalReasonText: this.container.querySelector('#proposal-reason-text'),
      proposalConsequentialBanner: this.container.querySelector('#proposal-consequential-banner'),
      btnApproveProposal: this.container.querySelector('#btn-approve-proposal'),
      btnSkipProposal: this.container.querySelector('#btn-skip-proposal'),
      btnStopProposal: this.container.querySelector('#btn-stop-proposal'),
      proposalPlanningLoader: this.container.querySelector('#proposal-planning-loader'),
      proposalPlanningText: this.container.querySelector('#proposal-planning-text'),
      proposalExecutingLoader: this.container.querySelector('#proposal-executing-loader'),
      proposalExecutingText: this.container.querySelector('#proposal-executing-text'),
      proposalCompletedCard: this.container.querySelector('#proposal-completed-card'),
      proposalCompletedSummary: this.container.querySelector('#proposal-completed-summary'),
      btnResetCompleted: this.container.querySelector('#btn-reset-completed'),
      proposalStoppedCard: this.container.querySelector('#proposal-stopped-card'),
      proposalStoppedSummary: this.container.querySelector('#proposal-stopped-summary'),
      btnResetStopped: this.container.querySelector('#btn-reset-stopped'),
      proposalHistoryDrawer: this.container.querySelector('#proposal-history-drawer'),
      btnToggleHistory: this.container.querySelector('#btn-toggle-history'),
      historyStepCount: this.container.querySelector('#history-step-count'),
      historyStepsList: this.container.querySelector('#history-steps-list'),
      historyChevron: this.container.querySelector('#history-chevron')
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

    // Toggle Badges button (Slice 3.2)
    if (this.dom.btnToggleBadges) {
      this.dom.btnToggleBadges.addEventListener('click', () => this.toggleBadges());
    }

    // "Find It For Me" Locator triggers (Slice 3.3)
    if (this.dom.btnFindSubmit) {
      this.dom.btnFindSubmit.addEventListener('click', () => this.handleFindSubmit());
    }

    if (this.dom.findQueryInput) {
      this.dom.findQueryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleFindSubmit();
        }
      });
    }

    if (this.dom.findChipsRow) {
      this.dom.findChipsRow.addEventListener('click', (e) => {
        const chip = e.target.closest('.find-chip');
        if (chip) {
          const query = chip.getAttribute('data-query');
          if (query) {
            this.dom.findQueryInput.value = query;
            this.handleFindSubmit(query);
          }
        }
      });
    }

    if (this.dom.btnRefocusFound) {
      this.dom.btnRefocusFound.addEventListener('click', () => {
        if (this.state.foundElementId) {
          this.pulseFindTarget(this.state.foundElementId);
        }
      });
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
        if (this.state.activeTab && this.state.activeTab.id === tabId) {
          if (changeInfo.status === 'loading') {
            this.state.badgesVisible = false;
            this.state.elements = [];
            if (this.dom.btnToggleBadges) {
              this.dom.btnToggleBadges.classList.remove('active');
            }
            if (this.dom.btnToggleBadgesText) {
              this.dom.btnToggleBadgesText.textContent = 'Show Badges';
            }
          } else if (changeInfo.status === 'complete' && this.container && this.container.classList.contains('active')) {
            this.refreshActiveTabInfo();
          }
        }
      });
    }

    // Bidirectional sync: when a numbered badge is clicked on the webpage, focus & highlight corresponding card
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message && message.type === IPC_MESSAGES.BADGE_CLICKED && message.id) {
          this.state.highlightedId = message.id;
          if (this.dom.elementsList) {
            this.dom.elementsList.querySelectorAll('.scanned-element-card').forEach(card => {
              const cardId = parseInt(card.getAttribute('data-id'), 10);
              const isTarget = cardId === message.id;
              card.classList.toggle('card-highlighted', isTarget);
              if (isTarget) {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            });
          }
        }
      });
    }

    // Errand Runner triggers (Phase 3 Slice 3.4)
    if (this.dom.btnStartErrand) {
      this.dom.btnStartErrand.addEventListener('click', () => this.startErrand());
    }

    if (this.dom.errandGoalInput) {
      this.dom.errandGoalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.startErrand();
        }
      });
    }

    if (this.dom.errandChipsRow) {
      this.dom.errandChipsRow.addEventListener('click', (e) => {
        const chip = e.target.closest('.errand-chip');
        if (chip) {
          const goal = chip.getAttribute('data-goal');
          if (goal) {
            if (this.dom.errandGoalInput) this.dom.errandGoalInput.value = goal;
            this.startErrand(goal);
          }
        }
      });
    }

    // Proposal Action Buttons (Slice 3.4 HITL approval loop)
    if (this.dom.btnApproveProposal) {
      this.dom.btnApproveProposal.addEventListener('click', () => this.approveProposal());
    }

    if (this.dom.btnSkipProposal) {
      this.dom.btnSkipProposal.addEventListener('click', () => this.skipProposal());
    }

    if (this.dom.btnStopProposal) {
      this.dom.btnStopProposal.addEventListener('click', () => this.stopErrand());
    }

    if (this.dom.btnStopErrandTop) {
      this.dom.btnStopErrandTop.addEventListener('click', () => this.stopErrand());
    }

    if (this.dom.btnResetCompleted) {
      this.dom.btnResetCompleted.addEventListener('click', () => this.resetErrand());
    }

    if (this.dom.btnResetStopped) {
      this.dom.btnResetStopped.addEventListener('click', () => this.resetErrand());
    }

    if (this.dom.btnRefocusProposal) {
      this.dom.btnRefocusProposal.addEventListener('click', () => {
        const id = this.state.taskState?.proposedAction?.targetElementId;
        if (id) {
          this.pulseFindTarget(id);
        }
      });
    }

    if (this.dom.btnToggleHistory) {
      this.dom.btnToggleHistory.addEventListener('click', () => {
        if (this.dom.historyStepsList) {
          const isHidden = this.dom.historyStepsList.classList.toggle('hidden');
          if (this.dom.historyChevron) {
            this.dom.historyChevron.textContent = isHidden ? '▼' : '▲';
          }
        }
      });
    }

    // Keyboard shortcut for single-step approval when in AWAITING_APPROVAL
    window.addEventListener('keydown', (e) => {
      if (
        this.state.taskState?.status === AGENT_STATES.AWAITING_APPROVAL &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      ) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.approveProposal();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.skipProposal();
        }
      }
    });

    // Listen to background agent state changes
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message && message.type === IPC_MESSAGES.AGENT_STATE_CHANGED && message.payload) {
          this.updateTaskUI(message.payload);
        }
      });
    }
  }

  /**
   * Initializes synchronization of active task state from background
   */
  async initTaskStateSync() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const response = await chrome.runtime.sendMessage({
          type: IPC_MESSAGES.GET_AGENT_STATE
        });
        if (response && response.success && response.state) {
          this.updateTaskUI(response.state);
        }
      }
    } catch (_) {}
  }

  /**
   * Starts a new browser errand task
   * @param {string|null} overrideGoal
   */
  async startErrand(overrideGoal = null) {
    const goal = (overrideGoal || this.dom.errandGoalInput?.value || '').trim();
    if (!goal) {
      this.showAlert('Please enter an errand goal (e.g. "Fill my name into the form").', 'warning');
      this.dom.errandGoalInput?.focus();
      return;
    }

    try {
      this.hideAlert();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        this.showAlert('No active browser tab found to run errand.', 'error');
        return;
      }

      this.state.activeTab = tab;

      if (this.isRestrictedUrl(tab.url)) {
        this.showAlert('Internal browser pages (chrome://) cannot be automated for security reasons.', 'warning');
        return;
      }

      const dryRun = Boolean(this.dom.chkDryRun?.checked);
      const maxSteps = parseInt(this.dom.selectMaxSteps?.value || '10', 10);

      // Unhide scanned container if hidden
      this.dom.emptyState?.classList.add('hidden');
      this.dom.scannedContent?.classList.remove('hidden');

      // Update immediate UI to SCANNING
      this.updateTaskUI({
        status: AGENT_STATES.SCANNING,
        goal,
        currentStep: 1,
        maxSteps,
        dryRun,
        proposedAction: null,
        history: []
      });

      const response = await chrome.runtime.sendMessage({
        type: IPC_MESSAGES.START_AGENT_TASK,
        payload: {
          goal,
          tabId: tab.id,
          maxSteps,
          dryRun,
          language: this.state.language
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to start errand.');
      }

      if (response.state) {
        this.updateTaskUI(response.state);
      }
    } catch (err) {
      console.error('[AgentView] startErrand failed:', err);
      this.showAlert(`Errand failed: ${err.message}`, 'error');
      this.updateTaskUI({
        status: AGENT_STATES.STOPPED,
        goal,
        error: err.message
      });
    }
  }

  /**
   * User approved the proposed action
   * Halting ends; action executes on DOM
   */
  async approveProposal() {
    try {
      if (this.dom.btnApproveProposal) this.dom.btnApproveProposal.disabled = true;
      if (this.dom.btnSkipProposal) this.dom.btnSkipProposal.disabled = true;
      if (this.dom.btnStopProposal) this.dom.btnStopProposal.disabled = true;

      this.updateTaskUI({
        ...this.state.taskState,
        status: AGENT_STATES.EXECUTING
      });

      const response = await chrome.runtime.sendMessage({
        type: IPC_MESSAGES.APPROVE_ACTION
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to execute approved action.');
      }

      if (response.state) {
        this.updateTaskUI(response.state);
      }
    } catch (err) {
      console.error('[AgentView] approveProposal failed:', err);
      this.showAlert(`Execution failed: ${err.message}`, 'error');
    } finally {
      if (this.dom.btnApproveProposal) this.dom.btnApproveProposal.disabled = false;
      if (this.dom.btnSkipProposal) this.dom.btnSkipProposal.disabled = false;
      if (this.dom.btnStopProposal) this.dom.btnStopProposal.disabled = false;
    }
  }

  /**
   * User skipped the proposed action
   */
  async skipProposal() {
    try {
      if (this.dom.btnApproveProposal) this.dom.btnApproveProposal.disabled = true;
      if (this.dom.btnSkipProposal) this.dom.btnSkipProposal.disabled = true;

      this.updateTaskUI({
        ...this.state.taskState,
        status: AGENT_STATES.SCANNING
      });

      const response = await chrome.runtime.sendMessage({
        type: IPC_MESSAGES.SKIP_ACTION,
        reason: 'User skipped proposed action'
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to skip action.');
      }

      if (response.state) {
        this.updateTaskUI(response.state);
      }
    } catch (err) {
      console.error('[AgentView] skipProposal failed:', err);
      this.showAlert(`Skip failed: ${err.message}`, 'error');
    } finally {
      if (this.dom.btnApproveProposal) this.dom.btnApproveProposal.disabled = false;
      if (this.dom.btnSkipProposal) this.dom.btnSkipProposal.disabled = false;
    }
  }

  /**
   * User stopped the errand
   */
  async stopErrand() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: IPC_MESSAGES.STOP_AGENT_TASK
      });
      if (response && response.state) {
        this.updateTaskUI(response.state);
      }
      this.showAlert('Errand stopped.', 'info');
    } catch (err) {
      console.error('[AgentView] stopErrand failed:', err);
    }
  }

  /**
   * Resets errand back to IDLE
   */
  async resetErrand() {
    try {
      await chrome.runtime.sendMessage({
        type: IPC_MESSAGES.RESET_AGENT_TASK
      });
      this.updateTaskUI({
        status: AGENT_STATES.IDLE,
        goal: '',
        currentStep: 1,
        maxSteps: 10,
        proposedAction: null,
        history: []
      });
    } catch (err) {
      console.error('[AgentView] resetErrand failed:', err);
    }
  }

  /**
   * Updates task UI elements based on state machine
   * @param {object} taskState
   */
  updateTaskUI(taskState) {
    if (!taskState) return;
    this.state.taskState = { ...this.state.taskState, ...taskState };
    const { status, goal, currentStep, maxSteps, proposedAction, history = [], error } = this.state.taskState;

    if (!this.dom.actionProposalCard) return;

    if (status === AGENT_STATES.IDLE) {
      this.dom.actionProposalCard.classList.add('hidden');
      if (this.dom.errandRunnerCard) this.dom.errandRunnerCard.classList.remove('hidden');
      return;
    }

    // Active task running
    this.dom.actionProposalCard.classList.remove('hidden');
    if (this.dom.proposalGoalText) this.dom.proposalGoalText.textContent = goal || 'Browser Errand';
    if (this.dom.proposalStepCounter) this.dom.proposalStepCounter.textContent = `Step ${currentStep} of ${maxSteps}`;

    // Update Status Pill
    if (this.dom.proposalStatusPill && this.dom.proposalStatusText) {
      this.dom.proposalStatusPill.className = 'status-pill';
      switch (status) {
        case AGENT_STATES.SCANNING:
          this.dom.proposalStatusPill.classList.add('status-warning');
          this.dom.proposalStatusText.textContent = 'Scanning & Planning...';
          break;
        case AGENT_STATES.AWAITING_APPROVAL:
          this.dom.proposalStatusPill.classList.add('status-amber');
          this.dom.proposalStatusText.textContent = 'Awaiting Approval';
          break;
        case AGENT_STATES.EXECUTING:
          this.dom.proposalStatusPill.classList.add('status-executing');
          this.dom.proposalStatusText.textContent = 'Executing...';
          break;
        case AGENT_STATES.COMPLETED:
          this.dom.proposalStatusPill.classList.add('status-success');
          this.dom.proposalStatusText.textContent = 'Completed';
          break;
        case AGENT_STATES.STOPPED:
          this.dom.proposalStatusPill.classList.add('status-error');
          this.dom.proposalStatusText.textContent = 'Stopped';
          break;
        default:
          this.dom.proposalStatusText.textContent = status;
      }
    }

    // Section visibility
    this.dom.proposalBody?.classList.toggle('hidden', status !== AGENT_STATES.AWAITING_APPROVAL);
    this.dom.proposalPlanningLoader?.classList.toggle('hidden', status !== AGENT_STATES.SCANNING);
    this.dom.proposalExecutingLoader?.classList.toggle('hidden', status !== AGENT_STATES.EXECUTING);
    this.dom.proposalCompletedCard?.classList.toggle('hidden', status !== AGENT_STATES.COMPLETED);
    this.dom.proposalStoppedCard?.classList.toggle('hidden', status !== AGENT_STATES.STOPPED);

    // Proposal Details in AWAITING_APPROVAL
    if (status === AGENT_STATES.AWAITING_APPROVAL && proposedAction) {
      if (this.dom.proposalActionType) {
        this.dom.proposalActionType.textContent = (proposedAction.action || 'ACTION').toUpperCase();
        this.dom.proposalActionType.className = `proposal-action-pill ${proposedAction.action || 'type'}`;
      }

      if (this.dom.proposalTargetId) {
        this.dom.proposalTargetId.textContent = proposedAction.targetElementId ? `#${proposedAction.targetElementId}` : 'Page';
      }

      // Target Label
      const targetEl = this.state.elements.find(e => e.id === proposedAction.targetElementId);
      if (this.dom.proposalTargetLabel) {
        this.dom.proposalTargetLabel.textContent = targetEl ? `${targetEl.label} (${targetEl.tag})` : (proposedAction.action === 'done' ? 'Goal Finished' : 'Target Element');
      }

      // Value code
      if (this.dom.proposalValueRow && this.dom.proposalValueCode) {
        if (proposedAction.value) {
          this.dom.proposalValueRow.classList.remove('hidden');
          this.dom.proposalValueCode.textContent = `"${proposedAction.value}"`;
        } else {
          this.dom.proposalValueRow.classList.add('hidden');
        }
      }

      // Reason
      if (this.dom.proposalReasonText) {
        this.dom.proposalReasonText.textContent = proposedAction.reason || proposedAction.thought || 'Next step towards completing the errand.';
      }

      // Consequential Banner
      if (this.dom.proposalConsequentialBanner) {
        this.dom.proposalConsequentialBanner.classList.toggle('hidden', !proposedAction.isConsequential);
      }
    }

    // Completed summary
    if (status === AGENT_STATES.COMPLETED && this.dom.proposalCompletedSummary) {
      const approvedCount = history.filter(h => h.decision === 'approved').length;
      this.dom.proposalCompletedSummary.textContent = `Goal achieved in ${approvedCount} approved steps!`;
    }

    // Stopped summary
    if (status === AGENT_STATES.STOPPED) {
      if (this.dom.proposalStoppedTitle) {
        this.dom.proposalStoppedTitle.textContent = error ? 'Errand Failed' : 'Errand Stopped';
      }
      if (this.dom.proposalStoppedSummary) {
        this.dom.proposalStoppedSummary.textContent = error || 'Task was halted by user.';
      }
    }

    // Render history
    this.renderTaskHistory(history);
  }

  /**
   * Renders history steps in the accordion
   * @param {Array<object>} history
   */
  renderTaskHistory(history = []) {
    if (!this.dom.historyStepCount || !this.dom.historyStepsList) return;
    this.dom.historyStepCount.textContent = history.length;

    if (history.length === 0) {
      this.dom.historyStepsList.innerHTML = '<div class="history-empty" style="color:var(--text-muted);font-size:0.7rem;padding:4px 0;">No steps executed yet.</div>';
      return;
    }

    this.dom.historyStepsList.innerHTML = history.map((item, i) => {
      return `
        <div class="history-step-item">
          <div class="history-step-info">
            <span class="history-step-number" style="font-weight:700;color:var(--text-muted);">#${i + 1}</span>
            <span class="history-step-action" style="font-weight:600;color:var(--text-primary);text-transform:uppercase;">${this.escapeHTML(item.action)}</span>
            ${item.targetElementId ? `<span class="history-step-target" style="color:#60a5fa;">#${item.targetElementId}</span>` : ''}
            ${item.value ? `<span class="history-step-val" style="color:#38bdf8;">"${this.escapeHTML(item.value)}"</span>` : ''}
          </div>
          <span class="history-decision-pill ${item.decision}">${this.escapeHTML(item.decision)}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * Called when Agent tab is switched to in the sidepanel
   */
  async onTabActivated() {
    await this.refreshActiveTabInfo();
    await this.initTaskStateSync();
  }

  /**
   * Observer callback when user switches language in header
   * @param {'en' | 'hinglish'} lang
   */
  onLanguageChanged(lang) {
    this.state.language = lang;
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
      console.log('[AgentView] Tab message not received, attempting dynamic scanner/overlay injection...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/scanner.js', 'src/content/overlay.js']
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

      // If badges were previously active, refresh their overlay positions
      if (this.state.badgesVisible) {
        await this.sendMessageToTab(tab.id, {
          type: IPC_MESSAGES.RENDER_BADGES,
          elements: this.state.elements
        });
      }

      const count = this.state.elements.length;
      this.showAlert(`Discovered ${count} interactive elements. Click any element or toggle badges to inspect.`, 'success');
    } catch (err) {
      console.error('[AgentView] Scan failed:', err);
      this.showAlert(`Scan failed: ${err.message || 'Please refresh the active webpage and try again.'}`, 'error');
    } finally {
      this.setScanning(false);
    }
  }

  /**
   * Toggles numbered visual badges on the active page (Slice 3.2)
   * @param {boolean|null} forceState
   */
  async toggleBadges(forceState = null) {
    try {
      if (this.state.elements.length === 0) {
        await this.scanActiveTab();
        if (this.state.elements.length === 0) return;
      }

      const targetTab = this.state.activeTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (!targetTab) return;

      const newState = forceState !== null ? Boolean(forceState) : !this.state.badgesVisible;
      this.state.badgesVisible = newState;

      if (newState) {
        await this.sendMessageToTab(targetTab.id, {
          type: IPC_MESSAGES.RENDER_BADGES,
          elements: this.state.elements
        });
        if (this.dom.btnToggleBadges) this.dom.btnToggleBadges.classList.add('active');
        if (this.dom.btnToggleBadgesText) this.dom.btnToggleBadgesText.textContent = 'Hide Badges';
        this.showAlert(`Visual numbered badges enabled (#1–#${this.state.elements.length}).`, 'info');
      } else {
        await this.sendMessageToTab(targetTab.id, {
          type: IPC_MESSAGES.TOGGLE_BADGES,
          show: false
        });
        if (this.dom.btnToggleBadges) this.dom.btnToggleBadges.classList.remove('active');
        if (this.dom.btnToggleBadgesText) this.dom.btnToggleBadgesText.textContent = 'Show Badges';
        this.showAlert('Visual badges hidden.', 'info');
      }
    } catch (err) {
      console.error('[AgentView] Toggle badges failed:', err);
      this.showAlert(`Could not toggle badges: ${err.message}`, 'error');
    }
  }

  /**
   * Executes "Find It For Me" Natural Language Query (Slice 3.3)
   * @param {string|null} overrideQuery
   */
  async handleFindSubmit(overrideQuery = null) {
    const query = (overrideQuery || this.dom.findQueryInput?.value || '').trim();
    if (!query) {
      this.showAlert('Please enter a query describing what element you want to find.', 'warning');
      this.dom.findQueryInput?.focus();
      return;
    }

    if (this.state.isFinding) return;

    try {
      this.setFinding(true);
      this.hideAlert();

      // Ensure elements are scanned
      if (this.state.elements.length === 0) {
        await this.scanActiveTab();
        if (this.state.elements.length === 0) {
          throw new Error('No interactive elements were found on this page.');
        }
      }

      // Query AI orchestrator
      const response = await chrome.runtime.sendMessage({
        type: IPC_MESSAGES.FIND_ELEMENT,
        payload: {
          query,
          actionMap: this.state.elements,
          language: this.state.language
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'AI locator analysis failed.');
      }

      if (response.found && response.targetElementId) {
        this.state.foundElementId = response.targetElementId;

        // Pulse and scroll to target element on active tab
        await this.pulseFindTarget(response.targetElementId);

        // Update Find Result Box
        if (this.dom.findResultBox) {
          this.dom.findResultBox.classList.remove('hidden');
          this.dom.findResultBox.className = 'find-result-box find-result-success';
        }
        if (this.dom.findTargetBadge) {
          this.dom.findTargetBadge.textContent = `#${response.targetElementId}`;
          this.dom.findTargetBadge.className = 'find-target-badge badge-found';
        }
        if (this.dom.findResultTitle) {
          this.dom.findResultTitle.textContent = 'Target Element Located';
        }
        if (this.dom.findResultDesc) {
          this.dom.findResultDesc.textContent = response.explanation;
        }

        // Highlight matching card in the list
        this.dom.elementsList.querySelectorAll('.scanned-element-card').forEach(card => {
          const cardId = parseInt(card.getAttribute('data-id'), 10);
          card.classList.toggle('card-highlighted', cardId === response.targetElementId);
        });

        this.showAlert(`Located element #${response.targetElementId}. Scrolled and pulsing on page!`, 'success');
      } else {
        // Element not found
        this.state.foundElementId = null;
        if (this.dom.findResultBox) {
          this.dom.findResultBox.classList.remove('hidden');
          this.dom.findResultBox.className = 'find-result-box find-result-notfound';
        }
        if (this.dom.findTargetBadge) {
          this.dom.findTargetBadge.textContent = '✕';
          this.dom.findTargetBadge.className = 'find-target-badge badge-notfound';
        }
        if (this.dom.findResultTitle) {
          this.dom.findResultTitle.textContent = 'Element Not Found';
        }
        if (this.dom.findResultDesc) {
          this.dom.findResultDesc.textContent = response.explanation || `No element matching "${query}" was found.`;
        }
      }
    } catch (err) {
      console.error('[AgentView] Find element failed:', err);
      this.showAlert(`Find failed: ${err.message}`, 'error');
    } finally {
      this.setFinding(false);
    }
  }

  /**
   * Pulses target element on active page with amber glow and smooth scroll
   * @param {number} id
   */
  async pulseFindTarget(id) {
    try {
      const targetTab = this.state.activeTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (!targetTab || !targetTab.id) return;

      await this.sendMessageToTab(targetTab.id, {
        type: IPC_MESSAGES.PULSE_FIND_ELEMENT,
        id
      });
    } catch (err) {
      console.warn('[AgentView] Pulse find element failed:', err);
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
   * Highlights target element in the active tab (cyan ring)
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
   * Clears highlights and badges on page
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
   * Sets finding button state
   * @param {boolean} isFinding
   */
  setFinding(isFinding) {
    this.state.isFinding = isFinding;
    if (this.dom.btnFindSubmit) {
      this.dom.btnFindSubmit.disabled = isFinding;
      if (isFinding) {
        this.dom.btnFindSubmit.classList.add('loading');
        this.dom.btnFindSubmit.innerHTML = `
          <div class="spinner-sm"></div>
          <span>Locating...</span>
        `;
      } else {
        this.dom.btnFindSubmit.classList.remove('loading');
        this.dom.btnFindSubmit.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>Locate</span>
        `;
      }
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
