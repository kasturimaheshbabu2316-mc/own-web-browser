/**
 * Sahayak Extension - AI Provider Orchestrator
 * Direct REST Client for Google Gemini API with Streaming & Retry Resilience
 */

import { STORAGE_KEYS, DEFAULT_CONFIG } from '../shared/constants.js';
import { createGenerateResponse } from '../shared/types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Executes a standard non-streaming generation request to Google Gemini
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.systemInstruction]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]
 * @param {number} [options.temperature]
 * @param {number} [options.maxOutputTokens]
 * @param {number} [options.retryCount=0]
 * @returns {Promise<object>} Standard generate response
 */
export async function generateContent({
  prompt,
  systemInstruction = '',
  model = DEFAULT_CONFIG.MODEL,
  apiKey = '',
  temperature = 0.7,
  maxOutputTokens = 2048,
  retryCount = 0
}) {
  const resolvedKey = apiKey || await getSavedApiKey();
  if (!resolvedKey) {
    return createGenerateResponse({
      success: false,
      error: 'Google Gemini API key not found. Please configure it in Settings.'
    });
  }

  const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${resolvedKey.trim()}`;
  const payload = buildGeminiPayload({ prompt, systemInstruction, temperature, maxOutputTokens });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      const generatedText = extractCandidateText(data);
      return createGenerateResponse({
        success: true,
        text: generatedText,
        model
      });
    }

    // Handle Rate Limits (HTTP 429) & Server Overload (503) with Backoff
    if ((response.status === 429 || response.status === 503) && retryCount < 2) {
      const delayMs = Math.pow(2, retryCount) * 1000 + Math.random() * 300;
      console.warn(`[AI Orchestrator] HTTP ${response.status}. Retrying in ${Math.round(delayMs)}ms (attempt ${retryCount + 1})...`);
      await new Promise(res => setTimeout(res, delayMs));
      return generateContent({
        prompt,
        systemInstruction,
        model,
        apiKey: resolvedKey,
        temperature,
        maxOutputTokens,
        retryCount: retryCount + 1
      });
    }

    const errorJson = await response.json().catch(() => ({}));
    const message = errorJson.error?.message || `Gemini API error (HTTP ${response.status})`;
    return createGenerateResponse({
      success: false,
      error: message,
      model
    });
  } catch (error) {
    return createGenerateResponse({
      success: false,
      error: `Network error communicating with Gemini API: ${error.message}`,
      model
    });
  }
}

/**
 * Streams generated content from Gemini using Server-Sent Events (SSE)
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.systemInstruction]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]
 * @param {number} [options.temperature]
 * @param {number} [options.maxOutputTokens]
 * @param {function} onChunk - Callback for incremental text chunks
 * @param {function} onDone - Callback when streaming finishes
 * @param {function} onError - Callback if stream errors
 */
export async function streamGenerateContent({
  prompt,
  systemInstruction = '',
  model = DEFAULT_CONFIG.MODEL,
  apiKey = '',
  temperature = 0.7,
  maxOutputTokens = 2048,
  onChunk,
  onDone,
  onError
}) {
  const resolvedKey = apiKey || await getSavedApiKey();
  if (!resolvedKey) {
    onError(new Error('Google Gemini API key not found. Please configure it in Settings.'));
    return;
  }

  const endpoint = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse&key=${resolvedKey.trim()}`;
  const payload = buildGeminiPayload({ prompt, systemInstruction, temperature, maxOutputTokens });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const message = errorJson.error?.message || `Stream error (HTTP ${response.status})`;
      onError(new Error(message));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep partial line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.substring(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const chunk = extractCandidateText(parsed);
            if (chunk) {
              accumulatedText += chunk;
              if (onChunk) onChunk(chunk, accumulatedText);
            }
          } catch (e) {
            console.warn('[AI Orchestrator] Error parsing SSE JSON chunk:', e);
          }
        }
      }
    }

    if (onDone) onDone(accumulatedText);
  } catch (err) {
    if (onError) onError(err);
  }
}

/**
 * Builds standard Google Gemini REST payload
 */
function buildGeminiPayload({ prompt, systemInstruction, temperature, maxOutputTokens }) {
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };

  if (systemInstruction && systemInstruction.trim() !== '') {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction.trim() }]
    };
  }

  return payload;
}

/**
 * Extracts candidate text from Gemini response structure
 */
function extractCandidateText(data) {
  if (!data || !data.candidates || data.candidates.length === 0) return '';
  const candidate = data.candidates[0];
  if (!candidate.content || !candidate.content.parts) return '';
  return candidate.content.parts.map(p => p.text || '').join('');
}

/**
 * Helper to get user's saved Gemini API Key from chrome.storage.local
 */
async function getSavedApiKey() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.GEMINI_API_KEY]);
    return data[STORAGE_KEYS.GEMINI_API_KEY] || '';
  } catch {
    return '';
  }
}
