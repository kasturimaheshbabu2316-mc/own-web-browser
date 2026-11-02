/**
 * Sahayak Extension - Human-in-the-Loop Agent State Machine (Phase 3, Slice 3.4)
 * Manages the task execution lifecycle with code-enforced human approval:
 * - States: IDLE, SCANNING, AWAITING_APPROVAL, EXECUTING, COMPLETED, STOPPED
 * - Guarantees zero DOM mutations prior to explicit user approval
 * - State persistence via chrome.storage.session with local fallback
 * - Single-step loop with strict JSON action schema
 */

import { AGENT_STATES, IPC_MESSAGES, STORAGE_KEYS, DEFAULT_CONFIG } from '../shared/constants.js';
import { proposeAgentAction } from './ai-orchestrator.js';

export class StateManager {
  constructor() {
    this.state = this.createInitialState();
    this.storageInitPromise = this.initStorage();
    this.setupTabListeners();
  }

  /**
   * Sets up tab lifecycle listeners to guard against tab close or URL navigation mid-errand (Edge Case 5.4)
   */
  setupTabListeners() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      if (chrome.tabs.onRemoved) {
        chrome.tabs.onRemoved.addListener((closedTabId) => {
          if (this.state.tabId === closedTabId && this.isTaskActive()) {
            console.warn(`[StateManager] Target tab ${closedTabId} was closed. Halting task.`);
            this.state.status = AGENT_STATES.STOPPED;
            this.state.error = 'Target browser tab was closed. Errand halted.';
            this.broadcastState();
          }
        });
      }
      if (chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo) => {
          if (this.state.tabId === updatedTabId && changeInfo.status === 'loading' && this.isTaskActive()) {
            console.warn(`[StateManager] Target tab ${updatedTabId} navigated away. Halting task.`);
            this.state.status = AGENT_STATES.STOPPED;
            this.state.error = 'Webpage navigated away during task. Errand halted.';
            this.broadcastState();
          }
        });
      }
    }
  }

  /**
   * Checks if an agent errand is currently actively running
   * @returns {boolean}
   */
  isTaskActive() {
    return (
      this.state.status === AGENT_STATES.SCANNING ||
      this.state.status === AGENT_STATES.AWAITING_APPROVAL ||
      this.state.status === AGENT_STATES.EXECUTING
    );
  }

  /**
   * Generates a blank, clean task state object
   * @returns {object}
   */
  createInitialState() {
    return {
      taskId: null,
      goal: '',
      status: AGENT_STATES.IDLE,
      tabId: null,
      currentStep: 1,
      maxSteps: DEFAULT_CONFIG.MAX_STEPS || 10,
      dryRun: false,
      language: DEFAULT_CONFIG.LANGUAGE || 'en',
      proposedAction: null, // { thought, action, targetElementId, value, reason, isConsequential }
      history: [],          // Array of executed/skipped steps
      error: null,
      lastUpdated: Date.now()
    };
  }

  /**
   * Initializes and restores state from storage
   */
  async initStorage() {
    try {
      let saved = null;
      if (typeof chrome !== 'undefined' && chrome.storage) {
        if (chrome.storage.session) {
          const sessionData = await chrome.storage.session.get([STORAGE_KEYS.AGENT_TASK_STATE]);
          saved = sessionData[STORAGE_KEYS.AGENT_TASK_STATE];
        } else if (chrome.storage.local) {
          const localData = await chrome.storage.local.get([STORAGE_KEYS.AGENT_TASK_STATE]);
          saved = localData[STORAGE_KEYS.AGENT_TASK_STATE];
        }
      }

      if (saved && saved.taskId && saved.status) {
        // If it was interrupted while executing/scanning, set back to awaiting or stopped
        if (saved.status === AGENT_STATES.SCANNING || saved.status === AGENT_STATES.EXECUTING) {
          saved.status = saved.proposedAction ? AGENT_STATES.AWAITING_APPROVAL : AGENT_STATES.STOPPED;
        }
        this.state = saved;
        console.log('[StateManager] Restored active task from storage:', this.state.taskId, this.state.status);
      }
    } catch (err) {
      console.warn('[StateManager] Failed to restore task from storage:', err);
    }
  }

  /**
   * Persists current state to session/local storage
   */
  async persistState() {
    this.state.lastUpdated = Date.now();
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const payload = { [STORAGE_KEYS.AGENT_TASK_STATE]: this.state };
        if (chrome.storage.session) {
          await chrome.storage.session.set(payload);
        } else if (chrome.storage.local) {
          await chrome.storage.local.set(payload);
        }
      }
    } catch (err) {
      console.warn('[StateManager] Failed to persist state:', err);
    }
  }

  /**
   * Broadcasts state update to side panel and any active extension listeners
   */
  broadcastState() {
    this.persistState();
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: IPC_MESSAGES.AGENT_STATE_CHANGED,
          payload: this.getState()
        }).catch(() => {
          // Suppress error if side panel is not currently open
        });
      }
    } catch (_) {}
  }

  /**
   * Returns a copy of current state
   * @returns {object}
   */
  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Starts a new browser errand task
   * Transitions: IDLE -> SCANNING -> AWAITING_APPROVAL (Halts here!)
   * @param {object} params
   * @param {string} params.goal
   * @param {number} params.tabId
   * @param {number} [params.maxSteps=10]
   * @param {boolean} [params.dryRun=false]
   * @param {string} [params.language='en']
   * @returns {Promise<object>} Current state
   */
  async startTask({ goal, tabId, maxSteps = 10, dryRun = false, language = 'en' }) {
    if (this.storageInitPromise) {
      await this.storageInitPromise;
    }

    if (!goal || !goal.trim()) {
      return { success: false, error: 'Task goal is required.' };
    }

    if (!tabId) {
      return { success: false, error: 'Active browser tab ID is required.' };
    }

    // Initialize fresh task record
    this.state = {
      taskId: 'task_' + Date.now(),
      goal: goal.trim(),
      status: AGENT_STATES.SCANNING,
      tabId,
      currentStep: 1,
      maxSteps: maxSteps || DEFAULT_CONFIG.MAX_STEPS || 10,
      dryRun: Boolean(dryRun),
      language: language || DEFAULT_CONFIG.LANGUAGE || 'en',
      proposedAction: null,
      history: [],
      error: null,
      lastUpdated: Date.now()
    };

    console.log(`[StateManager] Starting task "${this.state.goal}" on tab ${tabId}...`);
    this.broadcastState();

    return this.runPerceptionAndProposal();
  }

  /**
   * Single-Step Loop:
   * 1. Scans DOM of the active tab.
   * 2. Calls AI to propose the single next action.
   * 3. Pulses/highlights the proposed element on the page.
   * 4. Transitions to AWAITING_APPROVAL and HALTS.
   */
  async runPerceptionAndProposal() {
    this.state.status = AGENT_STATES.SCANNING;
    this.state.error = null;
    this.broadcastState();

    try {
      // Step 1: Scan DOM elements via content script
      const scanResponse = await this.sendMessageToTab(this.state.tabId, {
        type: IPC_MESSAGES.SCAN_ELEMENTS
      });

      if (!scanResponse || !scanResponse.success || !scanResponse.elements) {
        throw new Error(scanResponse?.error || 'Failed to scan interactive elements on the page.');
      }

      const actionMap = scanResponse.elements;
      if (actionMap.length === 0) {
        throw new Error('No interactive elements detected on the page.');
      }

      // Automatically render visual badges on page if not already visible
      this.sendMessageToTab(this.state.tabId, {
        type: IPC_MESSAGES.RENDER_BADGES,
        elements: actionMap
      }).catch(() => {});

      // Retrieve user profile if available for autofill context
      let userProfile = null;
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const profileData = await chrome.storage.local.get([STORAGE_KEYS.USER_PROFILE]);
          userProfile = profileData[STORAGE_KEYS.USER_PROFILE] || null;
        }
      } catch (_) {}

      // Step 2: Propose single next action via AI model
      const proposalResult = await proposeAgentAction({
        goal: this.state.goal,
        actionMap,
        history: this.state.history,
        language: this.state.language,
        userProfile
      });

      if (!proposalResult.success || !proposalResult.proposal) {
        throw new Error(proposalResult.error || 'Failed to determine next action.');
      }

      const proposal = proposalResult.proposal;

      // Handle terminal "done" action
      if (proposal.action === 'done') {
        this.state.status = AGENT_STATES.COMPLETED;
        this.state.proposedAction = proposal;
        this.state.history.push({
          step: this.state.currentStep,
          ...proposal,
          decision: 'approved',
          timestamp: Date.now()
        });
        this.clearHighlightsOnTab();
        this.broadcastState();
        return { success: true, state: this.getState() };
      }

      // Handle terminal "fail" action
      if (proposal.action === 'fail') {
        this.state.status = AGENT_STATES.STOPPED;
        this.state.error = proposal.reason || 'Agent could not fulfill the task on this page.';
        this.clearHighlightsOnTab();
        this.broadcastState();
        return { success: false, state: this.getState() };
      }

      // Step 3: Transition to AWAITING_APPROVAL and highlight proposed target
      this.state.proposedAction = proposal;
      this.state.status = AGENT_STATES.AWAITING_APPROVAL;

      if (proposal.targetElementId) {
        // Visually pulse target element so the user sees what is proposed
        this.sendMessageToTab(this.state.tabId, {
          type: IPC_MESSAGES.PULSE_FIND_ELEMENT,
          id: proposal.targetElementId
        }).catch(() => {});
      }

      console.log(`[StateManager] Step ${this.state.currentStep} proposed. Halting for approval:`, proposal);

      // Persist and broadcast state. EXECUTION HALTS COMPLETELY HERE!
      this.broadcastState();
      return { success: true, state: this.getState() };

    } catch (err) {
      console.error('[StateManager] runPerceptionAndProposal failed:', err);
      this.state.status = AGENT_STATES.STOPPED;
      this.state.error = err.message || 'Error occurred while planning step.';
      this.clearHighlightsOnTab();
      this.broadcastState();
      return { success: false, error: err.message, state: this.getState() };
    }
  }

  /**
   * User clicked [ Approve ]
   * Transitions: AWAITING_APPROVAL -> EXECUTING -> (executes action) -> SCANNING / COMPLETED
   * @returns {Promise<object>} Current state
   */
  async approveStep() {
    if (this.storageInitPromise) {
      await this.storageInitPromise;
    }

    if (this.state.status !== AGENT_STATES.AWAITING_APPROVAL || !this.state.proposedAction) {
      return {
        success: false,
        error: `Cannot approve step while in state "${this.state.status}".`
      };
    }

    const currentProposal = this.state.proposedAction;
    this.state.status = AGENT_STATES.EXECUTING;
    this.broadcastState();

    console.log(`[StateManager] User approved step ${this.state.currentStep} (DryRun: ${this.state.dryRun}):`, currentProposal);

    let executionResult = { success: true };

    // Execute DOM action (dispatched for both live and dry-run so executor can provide visual highlight feedback)
    if (currentProposal.action !== 'done' && currentProposal.action !== 'fail') {
      try {
        executionResult = await this.sendMessageToTab(this.state.tabId, {
          type: IPC_MESSAGES.EXECUTE_ACTION,
          payload: {
            action: currentProposal.action,
            targetElementId: currentProposal.targetElementId,
            value: currentProposal.value,
            dryRun: Boolean(this.state.dryRun)
          }
        });

        if (!executionResult || !executionResult.success) {
          throw new Error(executionResult?.error || 'Failed to execute synthetic DOM action.');
        }
      } catch (err) {
        console.error('[StateManager] Execution failed:', err);
        this.state.status = AGENT_STATES.STOPPED;
        this.state.error = `Execution failed on step ${this.state.currentStep}: ${err.message}`;
        this.broadcastState();
        return { success: false, error: this.state.error, state: this.getState() };
      }
    }

    // Record step in history
    this.state.history.push({
      step: this.state.currentStep,
      ...currentProposal,
      decision: 'approved',
      dryRun: Boolean(this.state.dryRun),
      timestamp: Date.now(),
      executionResult
    });

    // Check if goal was 'done' or if step limit reached
    if (currentProposal.action === 'done' || this.state.currentStep >= this.state.maxSteps) {
      this.state.status = AGENT_STATES.COMPLETED;
      this.clearHighlightsOnTab();
      this.broadcastState();
      return { success: true, state: this.getState() };
    }

    // Advance to next step
    this.state.currentStep += 1;
    this.state.proposedAction = null;

    // Small delay for DOM to settle after framework input/click events
    await new Promise(r => setTimeout(r, 400));

    // Loop: trigger next perception and proposal
    return this.runPerceptionAndProposal();
  }

  /**
   * User clicked [ Skip ]
   * Skips execution of the current proposed step and requests an alternate next step
   * @param {string} [reason='User skipped step']
   * @returns {Promise<object>} Current state
   */
  async skipStep(reason = 'User skipped step') {
    if (this.storageInitPromise) {
      await this.storageInitPromise;
    }

    if (this.state.status !== AGENT_STATES.AWAITING_APPROVAL || !this.state.proposedAction) {
      return {
        success: false,
        error: `Cannot skip step while in state "${this.state.status}".`
      };
    }

    const skippedProposal = this.state.proposedAction;
    console.log(`[StateManager] User skipped step ${this.state.currentStep}:`, skippedProposal);

    // Record skip in history
    this.state.history.push({
      step: this.state.currentStep,
      ...skippedProposal,
      decision: 'skipped',
      dryRun: Boolean(this.state.dryRun),
      skipReason: reason,
      timestamp: Date.now()
    });

    if (this.state.currentStep >= this.state.maxSteps) {
      this.state.status = AGENT_STATES.COMPLETED;
      this.clearHighlightsOnTab();
      this.broadcastState();
      return { success: true, state: this.getState() };
    }

    this.state.currentStep += 1;
    this.state.proposedAction = null;

    return this.runPerceptionAndProposal();
  }

  /**
   * User clicked [ Stop ]
   * Halts the agent task immediately and clears highlights & badges (Slice 3.5 Verification)
   * @returns {object} Current state
   */
  async stopTask() {
    if (this.storageInitPromise) {
      await this.storageInitPromise;
    }

    console.log('[StateManager] User stopped agent task.');
    this.state.status = AGENT_STATES.STOPPED;

    if (this.state.proposedAction) {
      this.state.history.push({
        step: this.state.currentStep,
        ...this.state.proposedAction,
        decision: 'stopped',
        dryRun: Boolean(this.state.dryRun),
        timestamp: Date.now()
      });
    }

    this.clearHighlightsOnTab();
    this.removeBadgesOnTab();
    this.broadcastState();
    return { success: true, state: this.getState() };
  }

  /**
   * Resets agent to IDLE state
   * @returns {object} Initial state
   */
  async resetTask() {
    if (this.storageInitPromise) {
      await this.storageInitPromise;
    }

    this.clearHighlightsOnTab();
    this.removeBadgesOnTab();
    this.state = this.createInitialState();
    this.broadcastState();
    return { success: true, state: this.getState() };
  }

  /**
   * Helper to send IPC message to a specific tab with automatic content script injection fallback
   * @param {number} tabId
   * @param {object} message
   * @returns {Promise<any>}
   */
  async sendMessageToTab(tabId, message) {
    if (!tabId || typeof chrome === 'undefined' || !chrome.tabs) {
      throw new Error('Invalid tab or chrome.tabs not available.');
    }

    try {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          resolve(response);
        });
      });
    } catch (err) {
      console.log('[StateManager] Tab message not received, attempting dynamic content scripts injection...');
      try {
        if (typeof chrome !== 'undefined' && chrome.scripting && chrome.scripting.executeScript) {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: [
              'src/content/readability.js',
              'src/content/extractor.js',
              'src/content/scanner.js',
              'src/content/overlay.js',
              'src/content/executor.js'
            ]
          });
          await new Promise(r => setTimeout(r, 150));
          return await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              resolve(response);
            });
          });
        }
      } catch (injectErr) {
        console.error('[StateManager] Auto-injection failed:', injectErr);
      }
      throw err;
    }
  }

  /**
   * Clears highlights on active tab
   */
  clearHighlightsOnTab() {
    if (this.state.tabId) {
      this.sendMessageToTab(this.state.tabId, {
        type: IPC_MESSAGES.CLEAR_HIGHLIGHTS
      }).catch(() => {});
    }
  }

  /**
   * Clears and removes numbered badges on active tab (Slice 3.5 verification)
   */
  removeBadgesOnTab() {
    if (this.state.tabId) {
      this.sendMessageToTab(this.state.tabId, {
        type: IPC_MESSAGES.REMOVE_BADGES
      }).catch(() => {});
    }
  }
}

// Singleton instance for service worker lifecycle
export const stateManager = new StateManager();
