/**
 * Sahayak Extension - Numbered Action Map & Shadow DOM Overlay (Phase 3, Slice 3.2 & 3.3)
 * Renders non-invasive visual badges (#1, #2, #3...) in an isolated closed Shadow DOM.
 * Coordinates are dynamically calculated with scroll tracking.
 * Includes amber glowing pulse effect for "Find It For Me" locator.
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

  /**
   * Initializes the closed Shadow DOM host
   */
  function initShadowHost() {
    if (hostEl && shadowRoot) return;

    hostEl = document.getElementById('sahayak-badge-host');
    if (!hostEl) {
      hostEl = document.createElement('div');
      hostEl.id = 'sahayak-badge-host';
      hostEl.setAttribute('data-sahayak-ignore', 'true');
      hostEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483646;
      `;
      document.body.appendChild(hostEl);
    }

    try {
      shadowRoot = hostEl.attachShadow({ mode: 'closed' });
    } catch (_) {
      // If already attached
      return;
    }

    // Shadow DOM internal styles
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      :host {
        pointer-events: none;
      }
      .badge-overlay-wrap {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        pointer-events: none;
      }
      .sahayak-badge {
        position: absolute;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SF Mono", Consolas, monospace;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        color: #ffffff;
        background: #2563eb;
        border: 1.5px solid rgba(255, 255, 255, 0.9);
        border-radius: 9999px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 4px rgba(37, 99, 235, 0.6);
        pointer-events: auto;
        cursor: pointer;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        user-select: none;
        -webkit-user-select: none;
      }
      .sahayak-badge:hover {
        transform: translate(-50%, -50%) scale(1.25);
        background: #1d4ed8;
        box-shadow: 0 0 10px rgba(37, 99, 235, 0.9);
      }
      .sahayak-badge.consequential {
        background: #d97706;
        border-color: #fef3c7;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 6px rgba(245, 158, 11, 0.8);
      }
      .sahayak-badge.consequential:hover {
        background: #b45309;
        box-shadow: 0 0 12px rgba(245, 158, 11, 1);
      }
      .sahayak-badge.highlighted {
        background: #00e5ff !important;
        color: #020617 !important;
        border-color: #ffffff !important;
        transform: translate(-50%, -50%) scale(1.3) !important;
        box-shadow: 0 0 14px rgba(0, 229, 255, 0.9) !important;
      }
      .sahayak-badge.pulse-amber {
        background: #f59e0b !important;
        color: #ffffff !important;
        border-color: #ffffff !important;
        transform: translate(-50%, -50%) scale(1.4) !important;
        box-shadow: 0 0 18px rgba(245, 158, 11, 1) !important;
        animation: sahayak-badge-beat 1s infinite alternate;
      }
      @keyframes sahayak-badge-beat {
        from { transform: translate(-50%, -50%) scale(1.2); }
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
      // If element is hidden or out of viewport bounds
      if (rect.width <= 0 || rect.height <= 0) {
        item.badgeEl.style.display = 'none';
        continue;
      }

      item.badgeEl.style.display = 'inline-flex';
      const x = Math.round(rect.left + window.scrollX);
      const y = Math.round(rect.top + window.scrollY);

      item.badgeEl.style.left = `${x}px`;
      item.badgeEl.style.top = `${y}px`;
    }
  }

  /**
   * Throttled scroll and resize handler
   */
  function handleViewportChange() {
    if (scrollRafId) return;
    scrollRafId = requestAnimationFrame(() => {
      updateBadgePositions();
      scrollRafId = null;
    });
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
      badgeEl.title = `Sahayak #${item.id}: ${item.label} (${item.tag})${item.isConsequential ? ' [⚠️ Consequential]' : ''}`;

      badgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.focus?.();
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

    window.removeEventListener('scroll', handleViewportChange, { passive: true });
    window.removeEventListener('resize', handleViewportChange, { passive: true });
    window.addEventListener('scroll', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange, { passive: true });
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
      }
    }
  }

  /**
   * Completely clears badges
   */
  function clearBadges() {
    isVisible = false;
    activeBadges = [];
    if (badgeContainer) {
      badgeContainer.innerHTML = '';
    }
    window.removeEventListener('scroll', handleViewportChange);
    window.removeEventListener('resize', handleViewportChange);
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
  window.__sahayakPulseFindElement = pulseFindElement;
  console.log('[Sahayak Overlay] Numbered badge overlay subsystem initialized.');
})();
