/**
 * Sahayak Extension - Numbered Action Map & Shadow DOM Overlay (Phase 3, Slice 3.2 & 3.3)
 * Renders non-invasive visual badges (#1, #2, #3...) in an isolated closed Shadow DOM.
 * Coordinates are dynamically calculated with multi-container scroll & resize tracking.
 * Includes Warning Red consequential styling, glowing Cyan selection, and Amber pulse locator.
 */

(() => {
  // Prevent duplicate injection
  if (window.__sahayakOverlayLoaded) return;
  window.__sahayakOverlayLoaded = true;

  let hostEl = null;
  let shadowRoot = null;
  let badgeContainer = null;
  let activeBadges = []; // Array of { id, element, badgeEl, isConsequential }
  let isVisible = false;
  let scrollRafId = null;
  let resizeObserver = null;

  /**
   * Initializes or repairs the closed Shadow DOM host
   */
  function initShadowHost() {
    if (hostEl && shadowRoot && badgeContainer) return;

    // Remove any orphaned host from prior injection without a live closed shadowRoot reference
    const existing = document.getElementById('sahayak-badge-host');
    if (existing && !shadowRoot) {
      existing.remove();
      hostEl = null;
    }

    if (!hostEl) {
      hostEl = document.createElement('div');
      hostEl.id = 'sahayak-badge-host';
      hostEl.setAttribute('data-sahayak-ignore', 'true');
      hostEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        overflow: visible;
        pointer-events: none;
        z-index: 2147483647;
      `;
      (document.documentElement || document.body).appendChild(hostEl);
    }

    if (!shadowRoot) {
      try {
        shadowRoot = hostEl.attachShadow({ mode: 'closed' });
      } catch (err) {
        console.warn('[Sahayak Overlay] Host collision on attachShadow, refreshing host:', err);
        hostEl.remove();
        hostEl = document.createElement('div');
        hostEl.id = 'sahayak-badge-host';
        hostEl.setAttribute('data-sahayak-ignore', 'true');
        hostEl.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 0;
          height: 0;
          overflow: visible;
          pointer-events: none;
          z-index: 2147483647;
        `;
        (document.documentElement || document.body).appendChild(hostEl);
        shadowRoot = hostEl.attachShadow({ mode: 'closed' });
      }
    }

    // Shadow DOM internal styles (isolated from host page CSS resets/Tailwind/Bootstrap)
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      :host {
        pointer-events: none;
      }
      .badge-overlay-wrap {
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        overflow: visible;
        pointer-events: none;
      }
      .sahayak-badge {
        position: absolute;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 19px;
        height: 19px;
        padding: 0 4px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SF Mono", Consolas, monospace;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        color: #ffffff;
        background: #2563eb;
        border: 1.5px solid rgba(255, 255, 255, 0.95);
        border-radius: 9999px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), 0 0 4px rgba(37, 99, 235, 0.6);
        pointer-events: auto;
        cursor: pointer;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s ease, box-shadow 0.15s ease;
        user-select: none;
        -webkit-user-select: none;
        white-space: nowrap;
      }
      .sahayak-badge:hover {
        transform: translate(-50%, -50%) scale(1.25);
        background: #1d4ed8;
        box-shadow: 0 0 10px rgba(37, 99, 235, 0.9);
      }
      .sahayak-badge.consequential {
        background: #dc2626;
        border-color: #fee2e2;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), 0 0 8px rgba(220, 38, 38, 0.85);
      }
      .sahayak-badge.consequential:hover {
        background: #b91c1c;
        box-shadow: 0 0 14px rgba(220, 38, 38, 1);
      }
      .sahayak-badge.highlighted {
        background: #00e5ff !important;
        color: #020617 !important;
        border-color: #ffffff !important;
        transform: translate(-50%, -50%) scale(1.3) !important;
        box-shadow: 0 0 16px rgba(0, 229, 255, 0.95) !important;
      }
      .sahayak-badge.pulse-amber {
        background: #f59e0b !important;
        color: #ffffff !important;
        border-color: #ffffff !important;
        transform: translate(-50%, -50%) scale(1.4) !important;
        box-shadow: 0 0 20px rgba(245, 158, 11, 1) !important;
        animation: sahayak-badge-beat 1s infinite alternate cubic-bezier(0.4, 0, 0.6, 1);
      }
      @keyframes sahayak-badge-beat {
        from { transform: translate(-50%, -50%) scale(1.25); }
        to { transform: translate(-50%, -50%) scale(1.5); }
      }
    `;
    shadowRoot.appendChild(styleEl);

    badgeContainer = document.createElement('div');
    badgeContainer.className = 'badge-overlay-wrap';
    shadowRoot.appendChild(badgeContainer);
  }

  /**
   * Repositions all active badges based on their target elements
   */
  function updateBadgePositions() {
    if (!isVisible || !badgeContainer) return;

    for (const item of activeBadges) {
      const el = item.element || document.querySelector(`[data-sahayak-id="${item.id}"]`);
      if (!el || !el.isConnected) {
        item.badgeEl.style.display = 'none';
        continue;
      }

      const rect = el.getBoundingClientRect();
      // If element is collapsed or has zero dimensions
      if (rect.width <= 0 || rect.height <= 0) {
        item.badgeEl.style.display = 'none';
        continue;
      }

      // Check computed visibility
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity || '1') <= 0.05
      ) {
        item.badgeEl.style.display = 'none';
        continue;
      }

      item.badgeEl.style.display = 'inline-flex';

      // Anchor to top-left with window scroll offset, clamped so badge isn't cut off at window edge
      const x = Math.max(10, Math.round(rect.left + window.scrollX));
      const y = Math.max(10, Math.round(rect.top + window.scrollY));

      item.badgeEl.style.left = `${x}px`;
      item.badgeEl.style.top = `${y}px`;
    }
  }

  /**
   * Throttled scroll and resize handler via requestAnimationFrame
   */
  function handleViewportChange() {
    if (scrollRafId) return;
    scrollRafId = requestAnimationFrame(() => {
      updateBadgePositions();
      scrollRafId = null;
    });
  }

  /**
   * Attaches window and container scroll/resize listeners
   */
  function attachPositionListeners() {
    detachPositionListeners();
    // capture: true ensures scrolling inside inner containers (divs, sidebars, tables) updates badges
    window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true });
    window.addEventListener('resize', handleViewportChange, { passive: true });

    if (typeof window !== 'undefined' && window.ResizeObserver && !resizeObserver) {
      resizeObserver = new window.ResizeObserver(() => handleViewportChange());
      if (document.documentElement) {
        resizeObserver.observe(document.documentElement);
      }
    }
  }

  /**
   * Detaches scroll/resize listeners
   */
  function detachPositionListeners() {
    window.removeEventListener('scroll', handleViewportChange, { capture: true });
    window.removeEventListener('scroll', handleViewportChange);
    window.removeEventListener('resize', handleViewportChange);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (scrollRafId) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = null;
    }
  }

  /**
   * Flashes a temporary cyan glow outline on a target DOM element
   * @param {HTMLElement} element
   */
  function flashElementOutline(element) {
    if (!element) return;

    if (!document.getElementById('sahayak-target-flash-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'sahayak-target-flash-style';
      styleEl.textContent = `
        .sahayak-target-flash {
          outline: 3px solid #00e5ff !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 16px rgba(0, 229, 255, 0.8) !important;
          transition: all 0.2s ease-in-out !important;
        }
      `;
      document.head.appendChild(styleEl);
    }

    element.classList.add('sahayak-target-flash');
    setTimeout(() => {
      element.classList.remove('sahayak-target-flash');
    }, 2500);
  }

  /**
   * Renders visual numbered badges on the page
   * @param {Array<object>} elements - Scanned elements array from scanner.js
   */
  function renderBadges(elements = []) {
    initShadowHost();
    badgeContainer.innerHTML = '';
    activeBadges = [];

    for (const item of elements) {
      const targetEl = document.querySelector(`[data-sahayak-id="${item.id}"]`);
      if (!targetEl) continue;

      const badgeEl = document.createElement('div');
      badgeEl.className = `sahayak-badge ${item.isConsequential ? 'consequential' : ''}`;
      badgeEl.textContent = item.id.toString();
      badgeEl.title = `Sahayak #${item.id}: ${item.label || 'Action'} (${item.tag})${item.isConsequential ? ' [⚠️ Consequential]' : ''}`;

      // Clicking a badge on the webpage scrolls to element, focuses it, flashes outline, and notifies sidepanel
      badgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.focus?.();
        flashElementOutline(targetEl);
        highlightBadge(item.id);

        try {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'SAHAYAK_BADGE_CLICKED',
              id: item.id
            }).catch(() => {});
          }
        } catch (_) {}
      });

      badgeContainer.appendChild(badgeEl);
      activeBadges.push({
        id: item.id,
        element: targetEl,
        badgeEl,
        isConsequential: item.isConsequential
      });
    }

    isVisible = true;
    updateBadgePositions();
    attachPositionListeners();
  }

  /**
   * Toggles visibility of badges
   * @param {boolean} show
   */
  function toggleBadges(show) {
    isVisible = Boolean(show);
    if (badgeContainer) {
      badgeContainer.style.display = isVisible ? 'block' : 'none';
      if (isVisible) {
        updateBadgePositions();
        attachPositionListeners();
      } else {
        detachPositionListeners();
      }
    }
  }

  /**
   * Completely clears badges and detaches listeners
   */
  function clearBadges() {
    isVisible = false;
    activeBadges = [];
    if (badgeContainer) {
      badgeContainer.innerHTML = '';
    }
    detachPositionListeners();
  }

  /**
   * Highlights a specific badge in Glowing Cyan (called from side panel selection)
   * @param {number} id
   */
  function highlightBadge(id) {
    for (const item of activeBadges) {
      if (item.id === id) {
        item.badgeEl.classList.add('highlighted');
      } else {
        item.badgeEl.classList.remove('highlighted');
      }
    }
  }

  /**
   * Clears highlights from all badges
   */
  function clearBadgeHighlights() {
    for (const item of activeBadges) {
      item.badgeEl.classList.remove('highlighted');
      item.badgeEl.classList.remove('pulse-amber');
    }
  }

  /**
   * "Find It For Me" amber pulse glow and smooth scroll effect (Slice 3.3)
   * @param {number} id
   */
  function pulseFindElement(id) {
    const el = document.querySelector(`[data-sahayak-id="${id}"]`);
    if (!el) return false;

    // Remove any existing find pulse
    document.querySelectorAll('.sahayak-find-pulse').forEach(node => {
      node.classList.remove('sahayak-find-pulse');
    });

    // Smooth scroll to center of viewport
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Inject styles for amber glow pulse if not present
    if (!document.getElementById('sahayak-find-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'sahayak-find-styles';
      styleEl.textContent = `
        .sahayak-find-pulse {
          outline: 3px solid #f59e0b !important;
          outline-offset: 4px !important;
          box-shadow: 0 0 24px rgba(245, 158, 11, 0.95), inset 0 0 12px rgba(245, 158, 11, 0.3) !important;
          animation: sahayak-amber-glow 2.5s ease-out !important;
        }
        @keyframes sahayak-amber-glow {
          0% { box-shadow: 0 0 32px rgba(245, 158, 11, 1), inset 0 0 16px rgba(245, 158, 11, 0.5); }
          50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.75), inset 0 0 8px rgba(245, 158, 11, 0.25); }
          100% { box-shadow: 0 0 10px rgba(245, 158, 11, 0.4); }
        }
      `;
      document.head.appendChild(styleEl);
    }

    el.classList.add('sahayak-find-pulse');

    // Also pulse corresponding badge in Shadow DOM if available
    const badgeItem = activeBadges.find(b => b.id === id);
    if (badgeItem && badgeItem.badgeEl) {
      badgeItem.badgeEl.classList.add('pulse-amber');
      setTimeout(() => {
        badgeItem.badgeEl.classList.remove('pulse-amber');
      }, 4000);
    }

    setTimeout(() => {
      el.classList.remove('sahayak-find-pulse');
    }, 4000);

    return true;
  }

  // Runtime Message Listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === 'SAHAYAK_RENDER_BADGES') {
      try {
        renderBadges(message.elements || []);
        sendResponse({ success: true, count: activeBadges.length });
      } catch (err) {
        console.error('[Sahayak Overlay] Render badges failed:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.type === 'SAHAYAK_TOGGLE_BADGES') {
      toggleBadges(message.show);
      sendResponse({ success: true, visible: isVisible });
      return true;
    }

    if (message.type === 'SAHAYAK_REMOVE_BADGES') {
      clearBadges();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'SAHAYAK_HIGHLIGHT_ELEMENT') {
      if (message.id) {
        highlightBadge(message.id);
      }
      // Note: do not block sendResponse; scanner.js also handles the DOM outline
    }

    if (message.type === 'SAHAYAK_CLEAR_HIGHLIGHTS') {
      clearBadgeHighlights();
    }

    if (message.type === 'SAHAYAK_PULSE_FIND_ELEMENT') {
      const found = pulseFindElement(message.id);
      sendResponse({ success: found });
      return true;
    }

    return false;
  });

  // Global exports for testing
  window.__sahayakRenderBadges = renderBadges;
  window.__sahayakToggleBadges = toggleBadges;
  window.__sahayakClearBadges = clearBadges;
  window.__sahayakHighlightBadge = highlightBadge;
  window.__sahayakPulseFindElement = pulseFindElement;
  console.log('[Sahayak Overlay] Numbered badge overlay subsystem initialized.');
})();
