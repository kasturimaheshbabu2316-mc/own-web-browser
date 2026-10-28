/**
 * Sahayak Extension - Synthetic DOM Execution Engine (Phase 3, Slice 3.4 & 3.5)
 * Dispatches robust synthetic events compatible with modern web frameworks (React, Angular, Vue, Svelte).
 * Handles:
 * - click: focus, pointerdown, mousedown, mouseup, click
 * - type: native descriptor value setter (React 16+ input/textarea tracker), input & change bubbling events
 * - select: value setter, input & change bubbling events
 * - scroll: smooth scroll into center of viewport
 */

(() => {
  if (window.__sahayakExecutorLoaded) return;
  window.__sahayakExecutorLoaded = true;

  /**
   * Safely types text into an input or textarea element across frameworks
   * @param {HTMLElement} element 
   * @param {string} text 
   */
  function dispatchSafeType(element, text = '') {
    if (!element) throw new Error('Target element is null or undefined.');

    element.focus();

    // Modern Framework Setter Trick (React, Vue, Angular synthetic tracker bypass)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (element instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.call(element, text);
    } else if (element instanceof HTMLInputElement && nativeInputValueSetter) {
      nativeInputValueSetter.call(element, text);
    } else {
      element.value = text;
    }

    // Dispatch standard bubbling input and change events
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  /**
   * Safely clicks an element with full pointer/mouse event sequence
   * @param {HTMLElement} element 
   */
  function dispatchSafeClick(element) {
    if (!element) throw new Error('Target element is null or undefined.');

    element.focus?.();

    // If it's a checkbox or radio, clicking toggles state
    const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true });
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true });
    const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });

    element.dispatchEvent(pointerDown);
    element.dispatchEvent(mouseDown);
    element.dispatchEvent(mouseUp);
    element.dispatchEvent(click);
  }

  /**
   * Safely selects an option on a <select> element
   * @param {HTMLSelectElement} element 
   * @param {string} valueOrText 
   */
  function dispatchSafeSelect(element, valueOrText = '') {
    if (!element) throw new Error('Target element is null or undefined.');

    element.focus?.();

    const targetVal = (valueOrText || '').trim().toLowerCase();
    let matchedOption = null;

    // First try exact value match
    for (const opt of element.options) {
      if (opt.value.trim().toLowerCase() === targetVal) {
        matchedOption = opt;
        break;
      }
    }

    // Next try text content match
    if (!matchedOption) {
      for (const opt of element.options) {
        if (opt.text.trim().toLowerCase() === targetVal || opt.text.trim().toLowerCase().includes(targetVal)) {
          matchedOption = opt;
          break;
        }
      }
    }

    if (matchedOption) {
      element.value = matchedOption.value;
    } else if (valueOrText) {
      element.value = valueOrText;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
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
   * @param {object} actionPayload
   * @param {string} actionPayload.action - 'click' | 'type' | 'select' | 'scroll'
   * @param {number} actionPayload.targetElementId
   * @param {string} [actionPayload.value]
   * @returns {object} { success: boolean, action, targetElementId, error? }
   */
  function executeDomAction({ action, targetElementId, value = '' }) {
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

    // Security Guardrail: Never mutate password inputs
    if (element.getAttribute('type') === 'password') {
      return {
        success: false,
        error: `Security Violation: Password elements cannot be targeted for execution.`
      };
    }

    try {
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
          dispatchSafeScroll(element);
          break;

        default:
          return { success: false, error: `Unsupported execution action: "${action}".` };
      }

      console.log(`[Sahayak Executor] Successfully executed "${action}" on element #${targetElementId}:`, element);

      return {
        success: true,
        action,
        targetElementId,
        tagName: element.tagName,
        timestamp: Date.now()
      };
    } catch (err) {
      console.error(`[Sahayak Executor] Failed executing "${action}" on element #${targetElementId}:`, err);
      return {
        success: false,
        action,
        targetElementId,
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
  console.log('[Sahayak Executor] DOM Action Executor initialized.');
})();
