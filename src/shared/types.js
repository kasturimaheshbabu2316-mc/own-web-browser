/**
 * Type contracts and payload schemas for Sahayak Extension IPC
 */

/**
 * Creates a standard IPC message envelope
 * @param {string} type - Message type from IPC_MESSAGES
 * @param {any} payload - Typed message payload
 * @param {'SIDEPANEL' | 'BACKGROUND' | 'CONTENT_SCRIPT'} source - Originator of message
 * @returns {object} Standard IPC Message
 */
export function createIPCMessage(type, payload = {}, source = 'SIDEPANEL') {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type,
    payload,
    timestamp: Date.now(),
    source
  };
}

/**
 * Creates a generation request payload
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} [params.systemInstruction]
 * @param {string} [params.model]
 * @param {string} [params.apiKey]
 * @param {number} [params.temperature=0.7]
 * @param {number} [params.maxOutputTokens=2048]
 * @returns {object}
 */
export function createGenerateRequest({
  prompt,
  systemInstruction = '',
  model = 'gemini-2.0-flash-lite',
  apiKey = '',
  temperature = 0.7,
  maxOutputTokens = 2048
}) {
  return {
    prompt,
    systemInstruction,
    model,
    apiKey,
    temperature,
    maxOutputTokens
  };
}

/**
 * Creates a standard generation response payload
 * @param {object} params
 * @param {boolean} params.success
 * @param {string} [params.text]
 * @param {string} [params.error]
 * @param {string} [params.model]
 * @returns {object}
 */
export function createGenerateResponse({
  success,
  text = '',
  error = null,
  model = ''
}) {
  return {
    success,
    text,
    error,
    model,
    timestamp: Date.now()
  };
}
