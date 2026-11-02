/**
 * Sahayak Extension - Deterministic Safety Rails & Guardrail Engine (Phase 4, Slice 4.3)
 *
 * Four code-enforced deterministic guardrails that protect the user from
 * unintended or high-risk automated browser actions:
 *
 *   Guardrail 1 — Restricted Domain Blacklist
 *   Guardrail 2 — Protected Field Quarantine
 *   Guardrail 3 — Consequential Action Detection
 *   Guardrail 4 — Immediate Kill Switch (Esc / Emergency Stop)
 *
 * These checks run DETERMINISTICALLY before any AI action is proposed or
 * executed; they do NOT rely on the model's judgement.
 */

// ---------------------------------------------------------------------------
// Guardrail 1 — Restricted Domain Blacklist
// ---------------------------------------------------------------------------

/**
 * Regex matching known financial / payment / sensitive banking domains.
 * Any tab whose hostname matches this pattern will be refused agent start.
 * @type {RegExp}
 */
const RESTRICTED_DOMAIN_REGEX =
  /(bank|netbanking|hdfc|icici|sbi|chase|paypal|razorpay|stripe|paytm|billdesk|citibank|axisbank|kotak|yesbank|rbl|idbi|pnb|boi|unionbank|canara|upi|bhim|phonepe|gpay|amazon\.pay|venmo|cashapp|zelle|wise\.com|revolut|monzo)/i;

/**
 * Additional exact-hostname blocklist for known high-risk domains.
 * @type {string[]}
 */
const RESTRICTED_HOSTNAME_BLOCKLIST = [
  'netbanking.hdfcbank.com',
  'onlinesbi.sbi.co.in',
  'retail.icicibank.com',
  'mobilebanking.axisbank.com',
  'www.paypal.com',
  'checkout.stripe.com',
  'razorpay.com',
  'paytm.com',
  'billdesk.com'
];

/**
 * Checks if a URL belongs to a restricted/sensitive financial domain.
 * @param {string} url - Full URL string of the active tab.
 * @returns {{ blocked: boolean, reason: string }}
 */
export function checkDomainRestriction(url) {
  if (!url || typeof url !== 'string') {
    return { blocked: false, reason: '' };
  }

  // chrome://, about:, file://, moz-extension:// etc. are blocked by other guards
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('moz-extension://')
  ) {
    return {
      blocked: true,
      reason:
        'Browser internal pages cannot be automated. Please navigate to a regular webpage first.'
    };
  }

  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch (_) {
    return { blocked: false, reason: '' };
  }

  // Exact blocklist check
  if (RESTRICTED_HOSTNAME_BLOCKLIST.some(blocked => hostname === blocked || hostname.endsWith('.' + blocked))) {
    return {
      blocked: true,
      reason: `🔒 Security Block: "${hostname}" is a known financial/payment domain. Sahayak never automates banking or payment pages to protect your account security.`
    };
  }

  // Regex pattern check on hostname
  if (RESTRICTED_DOMAIN_REGEX.test(hostname)) {
    return {
      blocked: true,
      reason: `🔒 Security Block: "${hostname}" matches a restricted financial or payment domain. Sahayak will not automate this page.`
    };
  }

  return { blocked: false, reason: '' };
}

// ---------------------------------------------------------------------------
// Guardrail 2 — Protected Field Quarantine
// ---------------------------------------------------------------------------

/**
 * Regex matching input name/id attributes that identify sensitive credential fields.
 * Used by scanner.js (already filters type=password) and by the guardrail audit.
 * @type {RegExp}
 */
export const PROTECTED_FIELD_REGEX =
  /(otp|cvv|cardnumber|card_number|card-number|pin|ssn|passcode|securitycode|security_code|authcode|auth_code|secret|password|passwd|pwd|cvc|expiry|expiration|mm_yy)/i;

/**
 * autocomplete attribute values that mark a field as sensitive.
 * @type {string[]}
 */
const PROTECTED_AUTOCOMPLETE_VALUES = [
  'current-password',
  'new-password',
  'one-time-code',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year'
];

/**
 * Audits an action map (from scanner.js) and removes any elements that are
 * protected credential/sensitive fields before they reach the AI model.
 *
 * This is a secondary defence layer; scanner.js already filters type=password.
 *
 * @param {Array<object>} actionMap - Array of scanned element descriptors.
 * @returns {{ sanitized: Array<object>, quarantined: Array<object> }}
 */
export function quarantineProtectedFields(actionMap) {
  if (!Array.isArray(actionMap)) return { sanitized: [], quarantined: [] };

  const sanitized = [];
  const quarantined = [];

  for (const element of actionMap) {
    const type = String(element.type || '').toLowerCase();
    const autocomplete = String(element.autocomplete || '').toLowerCase();
    const name = String(element.name || '').toLowerCase();
    const htmlId = String(element.htmlId || '').toLowerCase();
    const label = String(element.label || '').toLowerCase();
    const rawIdStr = typeof element.id === 'string' ? element.id.toLowerCase() : '';

    const isProtectedType = type === 'password' || type === 'hidden';
    const isProtectedAutocomplete = PROTECTED_AUTOCOMPLETE_VALUES.some(v => autocomplete === v);
    const isProtectedNameOrId =
      PROTECTED_FIELD_REGEX.test(name) ||
      PROTECTED_FIELD_REGEX.test(htmlId) ||
      PROTECTED_FIELD_REGEX.test(label) ||
      (rawIdStr ? PROTECTED_FIELD_REGEX.test(rawIdStr) : false);

    if (isProtectedType || isProtectedAutocomplete || isProtectedNameOrId) {
      quarantined.push({ ...element, _quarantineReason: 'Protected credential field' });
    } else {
      sanitized.push(element);
    }
  }

  if (quarantined.length > 0) {
    console.warn(
      `[SafetyGuardrails] Quarantined ${quarantined.length} protected field(s):`,
      quarantined.map(q => `#${q.id || q.label} (${q._quarantineReason})`)
    );
  }

  return { sanitized, quarantined };
}

// ---------------------------------------------------------------------------
// Guardrail 3 — Consequential Action Detection
// ---------------------------------------------------------------------------

/**
 * Keywords in button/link text that indicate a consequential, irreversible action.
 * These trigger a mandatory secondary confirmation dialog.
 * @type {RegExp}
 */
export const CONSEQUENTIAL_ACTION_REGEX =
  /\b(submit|pay\s*now|pay|order\s*now|order|place\s*order|delete|remove|transfer|send\s*money|wire\s*transfer|checkout|buy\s*now|purchase|confirm\s*payment|confirm\s*order|deactivate|cancel\s*subscription|unsubscribe|close\s*account)\b/i;

/**
 * Checks whether a proposed action is consequential and requires secondary confirmation.
 * Evaluates the proposal's action type, label, and value.
 *
 * @param {object} proposal - Proposed agent action object.
 * @param {string} proposal.action      - Action type: 'click' | 'type' | 'select' | 'scroll' | 'done'
 * @param {string} [proposal.reason]    - AI's stated reason for the action.
 * @param {string} [proposal.value]     - Value to type/select (if applicable).
 * @param {boolean} [proposal.isConsequential] - Flag set by scanner.js
 * @returns {{ isConsequential: boolean, warningMessage: string }}
 */
export function checkConsequentialAction(proposal) {
  if (!proposal) return { isConsequential: false, warningMessage: '' };

  // Scanner already flagged this element as consequential
  if (proposal.isConsequential === true) {
    return {
      isConsequential: true,
      warningMessage: `This action targets a high-risk element. "${proposal.reason || 'An irreversible mutation'}" may submit data, make a payment, or trigger a destructive operation.`
    };
  }

  // Regex check on reason / value text
  const testText = `${proposal.reason || ''} ${proposal.value || ''}`;
  if (CONSEQUENTIAL_ACTION_REGEX.test(testText)) {
    return {
      isConsequential: true,
      warningMessage: `Detected high-risk keywords in the proposed action: "${testText.trim().substring(0, 80)}". This may be irreversible.`
    };
  }

  // click on a submit-type action
  if (proposal.action === 'click' && proposal.targetLabel) {
    if (CONSEQUENTIAL_ACTION_REGEX.test(proposal.targetLabel)) {
      return {
        isConsequential: true,
        warningMessage: `Clicking "${proposal.targetLabel}" may submit data or trigger an irreversible operation.`
      };
    }
  }

  return { isConsequential: false, warningMessage: '' };
}

// ---------------------------------------------------------------------------
// Guardrail 4 — Kill Switch helpers
// ---------------------------------------------------------------------------

/**
 * Validates a scan result before it is forwarded to the AI model.
 * Applies domain block + field quarantine and returns a gate decision.
 *
 * @param {object} params
 * @param {string} params.tabUrl         - URL of the active tab.
 * @param {Array}  params.actionMap      - Raw scanned element list from scanner.js.
 * @returns {{ allowed: boolean, blockReason: string|null, sanitizedActionMap: Array, quarantinedCount: number }}
 */
export function runGuardrailGate({ tabUrl, actionMap }) {
  // G1: Domain restriction
  const domainCheck = checkDomainRestriction(tabUrl);
  if (domainCheck.blocked) {
    return {
      allowed: false,
      blockReason: domainCheck.reason,
      sanitizedActionMap: [],
      quarantinedCount: 0
    };
  }

  // G2: Protected field quarantine
  const { sanitized, quarantined } = quarantineProtectedFields(actionMap);

  return {
    allowed: true,
    blockReason: null,
    sanitizedActionMap: sanitized,
    quarantinedCount: quarantined.length
  };
}

// ---------------------------------------------------------------------------
// Exports summary
// ---------------------------------------------------------------------------
// checkDomainRestriction(url)         → G1 domain block
// quarantineProtectedFields(actionMap) → G2 field quarantine
// checkConsequentialAction(proposal)  → G3 secondary confirmation gate
// runGuardrailGate({ tabUrl, actionMap }) → combined G1+G2 pre-flight check
// PROTECTED_FIELD_REGEX               → shared regex for scanner.js reuse
// CONSEQUENTIAL_ACTION_REGEX          → shared regex for UI badge colouring
