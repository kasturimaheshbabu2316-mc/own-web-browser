/**
 * Sahayak Extension - Synthetic DOM Execution Engine (Phase 3, Slice 3.4 & 3.5)
 * Dispatches robust synthetic events compatible with modern web frameworks (React, Angular, Vue, Svelte).
 * Handles:
 * - click: focus, pointerdown, mousedown, mouseup, click (native activation for checkboxes, buttons, submits, links)
 * - type: React 16+ _valueTracker reset, native descriptor setter, input & change bubbling events
 * - select: dropdown option matcher, descriptor setter, input & change bubbling events
 * - scroll: smooth scroll into center of viewport
 * - dry-run mode: highlights target without mutating values or submitting forms
 */

(() => {
  if (window.__sahayakExecutorLoaded) return;
  window.__sahayakExecutorLoaded = true;

  /**
   * Injects dynamic visual feedback CSS styles for execution and dry-run modes
   */
  function ensureExecutorStyles() {
    if (document.getElementById('sahayak-executor-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'sahayak-executor-styles';
    styleEl.textContent = `
      .sahayak-executing-highlight {
        outline: 3px solid #22c55e !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 20px rgba(34, 197, 94, 0.85) !important;
        transition: outline 0.15s ease, box-shadow 0.15s ease !important;
      }
      .sahayak-dryrun-highlight {
        outline: 3px dashed #38bdf8 !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 20px rgba(56, 189, 248, 0.9) !important;
        animation: sahayak-dryrun-pulse 1.2s ease-in-out infinite alternate !important;
      }
      @keyframes sahayak-dryrun-pulse {
        from { box-shadow: 0 0 10px rgba(56, 189, 248, 0.5); }
        to { box-shadow: 0 0 24px rgba(56, 189, 248, 1); }
      }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  /**
   * Applies temporary visual highlight to target element
   * @param {HTMLElement} element
   * @param {boolean} isDryRun
   */
  function highlightTarget(element, isDryRun = false) {
    if (!element || !(element instanceof HTMLElement)) return;
    ensureExecutorStyles();

    const className = isDryRun ? 'sahayak-dryrun-highlight' : 'sahayak-executing-highlight';
    const duration = isDryRun ? 1500 : 800;

    element.classList.add(className);
    setTimeout(() => {
      element.classList.remove(className);
    }, duration);
  }

  /**
   * Safely types text into an input, textarea, or contenteditable element across frameworks
   * @param {HTMLElement} element
   * @param {string} text
   */
  function dispatchSafeType(element, text = '') {
    if (!element) throw new Error('Target element is null or undefined.');

    element.focus?.();

    // Checkbox / Radio handling if model sends 'type'
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      const truthy = text === true || text === 'true' || text === 'yes' || text === '1' || text === 'on' || text === 'checked';
      if (element.checked !== truthy) {
        dispatchSafeClick(element);
      }
      return;
    }

    // ContentEditable handling
    if (element.isContentEditable) {
      element.innerText = text;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return;
    }

    // Modern Framework Setter Trick (React, Vue, Angular synthetic tracker bypass)
    // 1. Reset React 15/16+ input tracker so React detects changes even on identical values
    if (element._valueTracker) {
      element._valueTracker.setValue('');
    }

    // 2. Obtain prototype setter descriptor
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, text);
    } else if (element instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(element, text);
      else element.value = text;
    } else if (element instanceof HTMLInputElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(element, text);
      else element.value = text;
    } else {
      element.value = text;
    }

    // 3. Dispatch standard bubbling input and change events
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  /**
   * Safely clicks an element with full pointer/mouse event sequence & native activation
   * @param {HTMLElement} element
   */
  function dispatchSafeClick(element) {
    if (!element) throw new Error('Target element is null or undefined.');

    element.focus?.();

    // Dispatch full pointer and mouse event cascade
    const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true });
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true });
    const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true });

    element.dispatchEvent(pointerDown);
    element.dispatchEvent(mouseDown);
    element.dispatchEvent(mouseUp);

    // Invoke native click() for default activation behavior (checkbox toggling, form submitting, link following)
    if (typeof element.click === 'function') {
      element.click();
    } else {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
      element.dispatchEvent(click);
    }
  }

  /**
   * Safely selects an option on a <select> element or choice control
   * @param {HTMLElement} element
   * @param {string} valueOrText
   */
  function dispatchSafeSelect(element, valueOrText = '') {
    if (!element) throw new Error('Target element is null or undefined.');

    element.focus?.();

    if (element instanceof HTMLSelectElement) {
      const targetVal = (valueOrText || '').trim().toLowerCase();
      let matchedOption = null;

      // 1. Try exact value match
      for (const opt of element.options) {
        if (opt.value.trim().toLowerCase() === targetVal) {
          matchedOption = opt;
          break;
        }
      }

      // 2. Try text content match or substring match
      if (!matchedOption) {
        for (const opt of element.options) {
          const optText = opt.text.trim().toLowerCase();
          if (optText === targetVal || optText.includes(targetVal)) {
            matchedOption = opt;
            break;
          }
        }
      }

      const finalVal = matchedOption ? matchedOption.value : valueOrText;

      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

      if (descriptor && descriptor.set) {
        descriptor.set.call(element, finalVal);
      } else {
        element.value = finalVal;
      }

      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    } else if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      dispatchSafeClick(element);
    } else {
      dispatchSafeType(element, valueOrText);
    }
  }

  /**
   * Safely scrolls an element into the center of the viewport
   * @param {HTMLElement} element
   */
  function dispatchSafeScroll(element) {
    if (!element) throw new Error('Target element is null or undefined.');
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  /**
   * Executes a single atomic DOM action on the target element
   * Supports both live execution and dry-run preview mode (Slice 3.5)
   * @param {object} actionPayload
   * @param {string} actionPayload.action - 'click' | 'type' | 'select' | 'scroll'
   * @param {number} actionPayload.targetElementId
   * @param {string} [actionPayload.value]
   * @param {boolean} [actionPayload.dryRun=false]
   * @returns {object} { success: boolean, action, targetElementId, dryRun, error? }
   */
  function executeDomAction({ action, targetElementId, value = '', dryRun = false }) {
    if (!targetElementId) {
      return { success: false, error: 'No targetElementId provided.' };
    }

    // Lookup element using sahayak data-id
    const element = document.querySelector(`[data-sahayak-id="${targetElementId}"]`);
    if (!element) {
      return {
        success: false,
        error: `Target element #${targetElementId} was not found on active page.`
      };
    }

    // Security Guardrail: Never target password inputs
    if (element.getAttribute('type') === 'password') {
      return {
        success: false,
        error: 'Security Violation: Password elements cannot be targeted for execution.'
      };
    }

    try {
      // Smooth scroll target element into viewport center
      dispatchSafeScroll(element);

      // Apply visual feedback ring (dry-run cyan dashed vs live green glow)
      highlightTarget(element, Boolean(dryRun));

      // DRY-RUN MODE: highlight without mutating DOM or dispatching events
      if (dryRun) {
        console.log(`[Sahayak Executor] Dry-Run Mode: highlighted element #${targetElementId} without mutating DOM.`, element);
        return {
          success: true,
          action,
          targetElementId,
          dryRun: true,
          tagName: element.tagName,
          timestamp: Date.now()
        };
      }

      // LIVE EXECUTION MODE: dispatch synthetic events
      switch (action) {
        case 'type':
          dispatchSafeType(element, value);
          break;

        case 'click':
          dispatchSafeClick(element);
          break;

        case 'select':
          dispatchSafeSelect(element, value);
          break;

        case 'scroll':
          // Scroll was already performed above
          break;

        default:
          return { success: false, error: `Unsupported execution action: "${action}".` };
      }

      console.log(`[Sahayak Executor] Successfully executed "${action}" on element #${targetElementId}:`, element);

      return {
        success: true,
        action,
        targetElementId,
        dryRun: false,
        tagName: element.tagName,
        timestamp: Date.now()
      };
    } catch (err) {
      console.error(`[Sahayak Executor] Failed executing "${action}" on element #${targetElementId}:`, err);
      return {
        success: false,
        action,
        targetElementId,
        dryRun: Boolean(dryRun),
        error: err.message || 'Execution error.'
      };
    }
  }

  // Runtime Message Listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === 'SAHAYAK_EXECUTE_ACTION') {
      const result = executeDomAction(message.payload || {});
      sendResponse(result);
      return true;
    }

    return false;
  });

  // Global exports for testbeds
  window.__sahayakExecuteAction = executeDomAction;
  window.__sahayakDispatchSafeType = dispatchSafeType;
  window.__sahayakDispatchSafeClick = dispatchSafeClick;
  window.__sahayakDispatchSafeSelect = dispatchSafeSelect;
  window.__sahayakDispatchSafeScroll = dispatchSafeScroll;
  console.log('[Sahayak Executor] DOM Action Executor initialized.');
})();
