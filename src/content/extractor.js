/**
 * Sahayak Extension - Content Extraction Script
 * Executes in active tab context to extract clean readable article content without mutating live DOM.
 */

/* global Readability, isProbablyReaderable */

(function () {
  'use strict';

  // Guard against duplicate injections
  if (window.__SAHAYAK_EXTRACTOR_LOADED__) {
    return;
  }
  window.__SAHAYAK_EXTRACTOR_LOADED__ = true;

  console.log('[Sahayak Extractor] Content script initialized on:', window.location.href);

  // Common paywall & subscription gate heuristic triggers
  const PAYWALL_PATTERNS = [
    /subscribe\s+to\s+continue\s+reading/i,
    /sign\s+in\s+to\s+read\s+full\s+story/i,
    /become\s+a\s+member\s+to\s+read/i,
    /already\s+a\s+subscriber/i,
    /create\s+a\s+free\s+account\s+to\s+continue/i,
    /read\s+the\s+rest\s+of\s+this\s+story/i,
    /members-only\s+story/i,
    /this\s+premium\s+article\s+is\s+for/i,
    /you'?ve\s+reached\s+your\s+article\s+limit/i
  ];

  // Selectors for elements that should be cleaned from the cloned DOM
  const NOISE_SELECTORS = [
    '[id*="consent"]',
    '[class*="consent"]',
    '[id*="cookie"]',
    '[class*="cookie"]',
    '[id*="paywall"]',
    '[class*="paywall"]',
    '[id*="newsletter-popup"]',
    '[class*="newsletter-modal"]',
    '[class*="newsletter-signup"]',
    '[class*="social-share"]',
    '[class*="share-buttons"]',
    '[class*="advertisement"]',
    '[class*="ad-container"]',
    'aside',
    'nav',
    'footer',
    'header:not(article header)',
    'noscript',
    'iframe:not([src*="youtube"])'
  ];

  /**
   * Cleans cloned DOM to remove overlays, cookies, and ads before parsing
   * @param {Document} docClone 
   */
  function cleanClonedDOM(docClone) {
    try {
      NOISE_SELECTORS.forEach(selector => {
        const matchingElements = docClone.querySelectorAll(selector);
        matchingElements.forEach(el => {
          // Keep if it contains article or main tag
          if (!el.querySelector('article') && !el.closest('article')) {
            el.remove();
          }
        });
      });
    } catch (e) {
      console.warn('[Sahayak Extractor] Notice during DOM pre-cleaning:', e);
    }
  }

  /**
   * Tests whether text displays paywall/subscription truncation
   * @param {string} text 
   * @returns {boolean}
   */
  function detectPaywall(text) {
    if (!text) return false;
    return PAYWALL_PATTERNS.some(regex => regex.test(text));
  }

  /**
   * Normalizes and cleans plain text content
   * @param {string} rawText 
   * @returns {string}
   */
  function cleanText(rawText) {
    if (!rawText) return '';
    return rawText
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ \u00a0]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
  }

  /**
   * Applies smart token budget reduction if document is extremely long
   * @param {string} text 
   * @param {number} maxWords 
   * @returns {{ text: string, truncated: boolean, originalWords: number }}
   */
  function manageTokenBudget(text, maxWords = 18000) {
    const words = text.split(/\s+/);
    const wordCount = words.length;

    if (wordCount <= maxWords) {
      return { text, truncated: false, originalWords: wordCount };
    }

    console.log(`[Sahayak Extractor] Text exceeds ${maxWords} words (${wordCount} words). Applying hierarchical condensing...`);

    const headPortion = words.slice(0, 3000).join(' ');
    const tailPortion = words.slice(-2500).join(' ');

    const condensed = [
      headPortion,
      '\n\n[... Note: Extended middle sections omitted to respect token limits. Key headings and ending conclusion follow ...]\n\n',
      tailPortion
    ].join('');

    return {
      text: condensed,
      truncated: true,
      originalWords: wordCount
    };
  }

  /**
   * Main extractor function. Clones DOM, runs Readability, handles retries for SPAs.
   * @returns {Promise<object>} Extracted article data
   */
  async function extractPageContent() {
    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelayMs = 300;

    let isReaderable = false;
    let article = null;
    let strategy = 'readability';

    // Retry loop for Single-Page Applications (Edge Case 1.1)
    while (attempts < maxAttempts) {
      attempts++;

      // Clone DOM to prevent any live page mutation or interference
      const clonedDoc = document.cloneNode(true);
      cleanClonedDOM(clonedDoc);

      const checkReaderable = (typeof Readability !== 'undefined' && typeof Readability.isProbablyReaderable === 'function')
        ? Readability.isProbablyReaderable(clonedDoc)
        : (typeof isProbablyReaderable === 'function' ? isProbablyReaderable(clonedDoc) : true);

      if (typeof Readability !== 'undefined') {
        try {
          const reader = new Readability(clonedDoc, {
            charThreshold: 100,
            nbTopCandidates: 5
          });
          article = reader.parse();
        } catch (err) {
          console.warn('[Sahayak Extractor] Readability parse error on attempt ' + attempts + ':', err);
        }
      }

      const textLength = article && article.textContent ? article.textContent.trim().length : 0;
      const wordCount = textLength > 0 ? article.textContent.trim().split(/\s+/).length : 0;

      if (article && wordCount >= 180) {
        isReaderable = checkReaderable;
        strategy = attempts > 1 ? 'retry_readability' : 'readability';
        break;
      }

      // If document looks like it is still hydrating, wait for DOM mutations
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }

    // Fallback if Readability fails or page is not structured as an article
    let finalTitle = (article && article.title) ? article.title : document.title;
    let finalExcerpt = (article && article.excerpt) ? article.excerpt : '';
    let finalByline = (article && article.byline) ? article.byline : '';
    let finalSiteName = (article && article.siteName) ? article.siteName : window.location.hostname;
    let rawText = '';

    if (article && article.textContent && article.textContent.trim().length > 150) {
      rawText = cleanText(article.textContent);
    } else {
      // Fallback: Extract from main element or body (Edge Case 1.1 fallback)
      strategy = 'raw_fallback';
      console.warn('[Sahayak Extractor] Using raw fallback extraction.');
      const mainEl = document.querySelector('main, article, [role="main"], #content, .content, #main');
      const sourceEl = mainEl || document.body;
      rawText = cleanText(sourceEl ? sourceEl.innerText : '');
    }

    const { text: processedText, truncated, originalWords } = manageTokenBudget(rawText);
    const finalWordCount = processedText.split(/\s+/).filter(Boolean).length;
    const isPaywalled = detectPaywall(processedText);

    return {
      success: true,
      url: window.location.href,
      title: finalTitle || 'Untitled Page',
      byline: finalByline,
      siteName: finalSiteName,
      excerpt: finalExcerpt,
      textContent: processedText,
      wordCount: finalWordCount,
      readingTimeMinutes: Math.max(1, Math.ceil(finalWordCount / 200)),
      isReaderable,
      isPaywalled,
      isTruncated: truncated,
      originalWordCount: originalWords,
      strategy,
      extractionTimeMs: Date.now() - startTime
    };
  }

  // Runtime Message Listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || (message.type !== 'SAHAYAK_EXTRACT_CONTENT' && message.type !== 'EXTRACT_READABLE_CONTENT')) {
      return false;
    }

    console.log('[Sahayak Extractor] Received extraction request from:', sender);

    extractPageContent()
      .then(result => {
        sendResponse(result);
      })
      .catch(err => {
        console.error('[Sahayak Extractor] Extraction failure:', err);
        sendResponse({
          success: false,
          error: err.message || 'Failed to extract content from tab.',
          url: window.location.href
        });
      });

    // Return true to indicate asynchronous response to Chrome runtime
    return true;
  });

})();
