/**
 * Sahayak Extension - Context Menu AI Actions (Phase 2, Slice 2.2)
 * Handles right-click context menu creation and event dispatch for:
 * 1. "Sahayak: Explain this"
 * 2. "Sahayak: Translate to Hindi / Hinglish"
 * 3. "Sahayak: Draft a reply"
 */

import { STORAGE_KEYS, IPC_MESSAGES, CONTEXT_MENU_IDS } from '../shared/constants.js';

/**
 * Initializes Chrome context menus on extension installation or service worker wake-up
 */
export function setupContextMenus() {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) {
    console.warn('[Sahayak ContextMenu] chrome.contextMenus API not available.');
    return;
  }

  // Remove existing menus first to prevent duplicate ID runtime errors
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.EXPLAIN,
      title: 'Sahayak: Explain this',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.TRANSLATE,
      title: 'Sahayak: Translate to Hindi / Hinglish',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.DRAFT,
      title: 'Sahayak: Draft a reply',
      contexts: ['selection']
    });

    console.log('[Sahayak ContextMenu] Selection context menus registered successfully.');
  });
}

/**
 * Handles context menu clicks on selected text
 * Captures selected text, opens side panel, and dispatches context action payload
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 */
export async function handleContextMenuClick(info, tab) {
  if (!info || !info.menuItemId) return;

  const validMenuIds = Object.values(CONTEXT_MENU_IDS);
  if (!validMenuIds.includes(info.menuItemId)) {
    return;
  }

  const selectionText = (info.selectionText || '').trim();
  if (!selectionText) {
    console.warn('[Sahayak ContextMenu] No selection text captured.');
    return;
  }

  console.log('[Sahayak ContextMenu] Menu clicked:', info.menuItemId, 'chars:', selectionText.length);

  const payload = {
    menuItemId: info.menuItemId,
    selectionText,
    pageUrl: info.pageUrl || tab?.url || '',
    pageTitle: tab?.title || '',
    timestamp: Date.now()
  };

  // 1. Store action in chrome.storage.local to survive cold start if sidepanel is closed
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_CONTEXT_ACTION]: payload
    });
  } catch (err) {
    console.error('[Sahayak ContextMenu] Failed to store pending action:', err);
  }

  // 2. Automatically open the Chrome Side Panel (guaranteed user gesture in context menu click)
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      if (tab && tab.id) {
        await chrome.sidePanel.open({ tabId: tab.id }).catch(async () => {
          if (tab && tab.windowId) {
            await chrome.sidePanel.open({ windowId: tab.windowId });
          }
        });
      } else if (tab && tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    }
  } catch (err) {
    console.warn('[Sahayak ContextMenu] Could not auto-open side panel:', err);
  }

  // 3. Broadcast runtime message in case sidepanel is already mounted and listening
  try {
    chrome.runtime.sendMessage({
      type: IPC_MESSAGES.EXECUTE_CONTEXT_ACTION,
      payload
    }).catch(() => {
      // Side panel was likely closed or mounting; it will read from storage on mount
    });
  } catch {
    // Ignore runtime message failure when receiver does not yet exist
  }
}
