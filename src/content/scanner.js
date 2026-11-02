/**
 * Sahayak Extension - Interactive Element Scanner (Phase 3, Slice 3.1)
 * Scans the active DOM for actionable interactive elements (buttons, inputs, links, selects),
 * filters hidden/disabled/password elements, extracts accessible labels, detects consequential
 * actions, and assigns stable sequential integer IDs (1, 2, 3...).
 */

(() => {
  // Prevent duplicate injection
  if (window.__sahayakScannerLoaded) return;
  window.__sahayakScannerLoaded = true;

  // In-memory lookup map: ID (number) -> DOM Element
  const elementRegistry = new Map();

  // Consequential action keywords regex (Slice 4.3 Safety Guardrails foundation)
  const CONSEQUENTIAL_REGEX = /(submit|pay|order|purchase|delete|confirm|transfer|checkout|buy|remove|cancel|book|register|apply)/i;

  /**
   * Tests whether an element is physically visible on screen
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isElementVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    // Check DOM dimensions
    if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return false;

    // Check computed styles
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity || '1') <= 0.05
    ) {
      return false;
    }

    // Check bounding client rect
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    // Ensure element is not detached
    if (!el.isConnected) return false;

    // Exclude extension-injected hosts or badges
    if (el.closest('#sahayak-badge-host') || el.closest('[data-sahayak-ignore]')) {
      return false;
    }

    return true;
  }

  /**
   * Resolves a concise, human-readable label for an interactive element
   * @param {HTMLElement} el
   * @returns {string}
   */
  function resolveElementLabel(el) {
    // 1. Explicit ARIA label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // 2. ARIA labelledby reference
    const ariaLabelledby = el.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      const labelEl = document.getElementById(ariaLabelledby);
      if (labelEl && labelEl.innerText && labelEl.innerText.trim()) {
        return labelEl.innerText.trim();
      }
    }

    // 3. Associated <label for="...">
    if (el.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicitLabel && explicitLabel.innerText && explicitLabel.innerText.trim()) {
        return explicitLabel.innerText.trim();
      }
    }

    // 4. Closest ancestor <label>
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.innerText && parentLabel.innerText.trim()) {
      return parentLabel.innerText.trim();
    }

    // 5. Placeholder attribute
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim();

    // 6. Visible innerText / textContent (for buttons and links)
    const textContent = el.innerText || el.textContent || '';
    if (textContent.trim()) {
      const cleaned = textContent.replace(/\s+/g, ' ').trim();
      if (cleaned.length > 50) return cleaned.substring(0, 47) + '...';
      return cleaned;
    }

    // 7. Value attribute (for input[type=submit], input[type=button])
    if (el.value && typeof el.value === 'string' && el.value.trim()) {
      return el.value.trim();
    }

    // 8. Title attribute
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    // 9. Name or ID fallback
    if (el.name && el.name.trim()) return el.name.trim();
    if (el.id && el.id.trim()) return el.id.trim();

    return 'Unnamed Action';
  }

  /**
   * Determines if clicking/submitting this element triggers a consequential mutation
   * @param {HTMLElement} el
   * @param {string} label
   * @returns {boolean}
   */
  function checkIsConsequential(el, label = '') {
    const tagName = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (type === 'submit' || el.getAttribute('role') === 'submit') {
      return true;
    }

    const testTarget = `${label} ${el.getAttribute('value') || ''} ${el.id || ''} ${el.name || ''}`.trim();
    return CONSEQUENTIAL_REGEX.test(testTarget);
  }

  /**
   * Scans the active document and generates a numbered action map array
   * Target elements: buttons, links, inputs (except password/hidden), selects, choice controls
   * @returns {Array<object>} actionMap
   */
  function scanInteractiveElements() {
    elementRegistry.clear();

    // Composite selector covering all interactive targets (Slice 3.1)
    const selectors = [
      'button:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      'a[href]',
      '[role="link"]',
      'input:not([type="password"]):not([type="hidden"]):not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[role="checkbox"]',
      '[role="radio"]'
    ].join(', ');

    const rawElements = Array.from(document.querySelectorAll(selectors));
    const actionMap = [];
    let sequentialId = 1;

    for (const el of rawElements) {
      if (!isElementVisible(el)) continue;

      const tagName = el.tagName.toUpperCase();
      const type = (el.getAttribute('type') || (tagName === 'TEXTAREA' ? 'textarea' : (tagName === 'SELECT' ? 'select' : 'text'))).toLowerCase();

      // Protected field quarantine (Slice 4.3 Guardrail 2):
      // Exclude elements with type="password", autocomplete="current-password", autocomplete="one-time-code",
      // and inputs whose name or ID matches sensitive patterns (OTP, CVV, PIN, SSN, card number, etc.)
      const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
      const elName = (el.getAttribute('name') || '').toLowerCase();
      const elHtmlId = (el.id || '').toLowerCase();
      const isProtectedAutocomplete = ['current-password', 'new-password', 'one-time-code'].includes(autocomplete);
      const isProtectedField = /(otp|cvv|cardnumber|card_number|card-number|pin|ssn|passcode|securitycode|authcode|passwd|password)/i.test(`${elName} ${elHtmlId}`);

      if (type === 'password' || type === 'hidden' || isProtectedAutocomplete || isProtectedField) {
        continue;
      }

      const id = sequentialId++;
      const label = resolveElementLabel(el);
      const placeholder = el.getAttribute('placeholder') || '';
      const isConsequential = checkIsConsequential(el, label);
      const rect = el.getBoundingClientRect();

      // Tag element in DOM with unique sequential integer
      el.setAttribute('data-sahayak-id', id.toString());
      elementRegistry.set(id, el);

      actionMap.push({
        id,
        tag: tagName,
        type,
        name: el.getAttribute('name') || '',
        htmlId: el.id || '',
        autocomplete,
        label,
        placeholder,
        isConsequential,
        bounds: {
          x: Math.round(rect.left + window.scrollX),
          y: Math.round(rect.top + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    }

    console.log(`[Sahayak Scanner] Scanned ${actionMap.length} interactive elements on ${window.location.href}`);
    console.table(actionMap.map(item => ({
      ID: item.id,
      Tag: item.tag,
      Type: item.type,
      Label: item.label,
      Consequential: item.isConsequential ? '⚠️ YES' : 'No'
    })));

    return actionMap;
  }

  /**
   * Highlights a target element on screen with a temporary glowing cyan ring
   * @param {number} id
   */
  function highlightElement(id) {
    const el = elementRegistry.get(id) || document.querySelector(`[data-sahayak-id="${id}"]`);
    if (!el) return false;

    // Remove any previous highlight
    document.querySelectorAll('.sahayak-target-highlight').forEach(node => {
      node.classList.remove('sahayak-target-highlight');
    });

    // Scroll into view smoothly
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Inject temporary pulse styles if needed
    if (!document.getElementById('sahayak-scanner-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'sahayak-scanner-styles';
      styleEl.textContent = `
        .sahayak-target-highlight {
          outline: 3px solid #00e5ff !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 16px rgba(0, 229, 255, 0.7) !important;
          transition: all 0.2s ease-in-out !important;
        }
      `;
      document.head.appendChild(styleEl);
    }

    el.classList.add('sahayak-target-highlight');
    setTimeout(() => {
      el.classList.remove('sahayak-target-highlight');
    }, 3000);

    return true;
  }

  // Runtime Message Listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === 'SAHAYAK_SCAN_ELEMENTS') {
      try {
        const elements = scanInteractiveElements();
        sendResponse({
          success: true,
          count: elements.length,
          elements,
          url: window.location.href,
          title: document.title
        });
      } catch (err) {
        console.error('[Sahayak Scanner] Scan failed:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.type === 'SAHAYAK_HIGHLIGHT_ELEMENT') {
      const success = highlightElement(message.id);
      sendResponse({ success });
      return true;
    }

    if (message.type === 'SAHAYAK_CLEAR_HIGHLIGHTS') {
      document.querySelectorAll('.sahayak-target-highlight').forEach(node => {
        node.classList.remove('sahayak-target-highlight');
      });
      sendResponse({ success: true });
      return true;
    }

    return false;
  });

  // Global export for script context testing
  window.__sahayakScanInteractiveElements = scanInteractiveElements;
  window.__sahayakHighlightElement = highlightElement;
  console.log('[Sahayak Scanner] Interactive element scanner initialized.');
})();
