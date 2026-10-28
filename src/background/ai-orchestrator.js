/**
 * Sahayak Extension - AI Provider Orchestrator
 * Direct REST Client for Google Gemini API with Streaming & Retry Resilience
 * Phase 2, Slice 2.4: Free-Tier Resilience & Groq Llama-3.3 Fallback Engine
 */

import { STORAGE_KEYS, DEFAULT_CONFIG, GROQ_CONFIG } from '../shared/constants.js';
import { createGenerateResponse } from '../shared/types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Executes a standard non-streaming generation request to Google Gemini
 * Falls back to Groq Llama-3.3-70b if Gemini encounters HTTP 429 / 503 rate limits.
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
  contents = null,
  imageBase64 = null,
  mimeType = 'image/jpeg',
  systemInstruction = '',
  model = DEFAULT_CONFIG.MODEL,
  apiKey = '',
  temperature = 0.7,
  maxOutputTokens = 2048,
  retryCount = 0
}) {
  const resolvedKey = apiKey || await getSavedApiKey();
  if (!resolvedKey) {
    // If no Gemini key, check if Groq key is available for text queries
    if (!imageBase64) {
      const groqKey = await getSavedGroqApiKey();
      if (groqKey) {
        return generateGroqContent({ prompt, contents, systemInstruction, apiKey: groqKey, temperature, maxOutputTokens });
      }
    }
    return createGenerateResponse({
      success: false,
      error: 'Google Gemini API key not found. Please configure it in Settings.'
    });
  }

  const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${resolvedKey.trim()}`;
  const payload = buildGeminiPayload({ prompt, contents, imageBase64, mimeType, systemInstruction, temperature, maxOutputTokens });

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
        model,
        provider: 'gemini'
      });
    }

    // Handle Rate Limits (HTTP 429) & Server Overload (503) with Backoff
    if (response.status === 429 || response.status === 503) {
      if (retryCount < 2) {
        const delayMs = Math.pow(2, retryCount) * 1000 + Math.random() * 300;
        console.warn(`[AI Orchestrator] Gemini HTTP ${response.status}. Retrying in ${Math.round(delayMs)}ms (attempt ${retryCount + 1}/2)...`);
        await new Promise(res => setTimeout(res, delayMs));
        return generateContent({
          prompt,
          contents,
          imageBase64,
          mimeType,
          systemInstruction,
          model,
          apiKey: resolvedKey,
          temperature,
          maxOutputTokens,
          retryCount: retryCount + 1
        });
      }

      // If still throttled after 2 retries, fail over to Groq API for text requests (Slice 2.4)
      if (!imageBase64) {
        const groqKey = await getSavedGroqApiKey();
        if (groqKey) {
          console.warn(`[AI Orchestrator] Gemini throttled (HTTP ${response.status}). Failing over to Groq Llama-3.3-70b...`);
          return generateGroqContent({
            prompt,
            contents,
            systemInstruction,
            apiKey: groqKey,
            temperature,
            maxOutputTokens
          });
        }
      }
    }

    const errorJson = await response.json().catch(() => ({}));
    const message = errorJson.error?.message || `Gemini API error (HTTP ${response.status})`;
    return createGenerateResponse({
      success: false,
      error: message,
      model,
      provider: 'gemini'
    });
  } catch (error) {
    // On network failure, also try Groq fallback for text requests
    if (!imageBase64) {
      const groqKey = await getSavedGroqApiKey();
      if (groqKey) {
        console.warn(`[AI Orchestrator] Network error on Gemini: ${error.message}. Failing over to Groq...`);
        return generateGroqContent({
          prompt,
          contents,
          systemInstruction,
          apiKey: groqKey,
          temperature,
          maxOutputTokens
        });
      }
    }

    return createGenerateResponse({
      success: false,
      error: `Network error communicating with Gemini API: ${error.message}`,
      model,
      provider: 'gemini'
    });
  }
}

/**
 * Streams generated content from Gemini using Server-Sent Events (SSE)
 * Seamlessly fails over to Groq Llama-3.3-70b if Gemini encounters HTTP 429 or 503 rate limits.
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.systemInstruction]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]
 * @param {number} [options.temperature]
 * @param {number} [options.maxOutputTokens]
 * @param {function} onChunk - Callback for incremental text chunks
 * @param {function} onDone - Callback when streaming finishes (fullText, { provider, model })
 * @param {function} onError - Callback if stream errors
 * @param {function} [onStatus] - Callback for retry/fallback status updates
 */
export async function streamGenerateContent({
  prompt,
  contents = null,
  imageBase64 = null,
  mimeType = 'image/jpeg',
  systemInstruction = '',
  model = DEFAULT_CONFIG.MODEL,
  apiKey = '',
  temperature = 0.7,
  maxOutputTokens = 2048,
  onChunk,
  onDone,
  onError,
  onStatus
}) {
  const resolvedKey = apiKey || await getSavedApiKey();
  if (!resolvedKey) {
    // If no Gemini key, attempt direct Groq execution for text requests
    if (!imageBase64) {
      const groqKey = await getSavedGroqApiKey();
      if (groqKey) {
        if (onStatus) {
          onStatus({
            status: 'fallback',
            provider: 'groq',
            model: GROQ_CONFIG.MODEL,
            message: 'Groq Llama-3.3 Active'
          });
        }
        return streamGroqContent({
          prompt,
          contents,
          systemInstruction,
          apiKey: groqKey,
          temperature,
          maxOutputTokens,
          onChunk,
          onDone: (text) => onDone && onDone(text, { provider: 'groq', model: GROQ_CONFIG.MODEL }),
          onError
        });
      }
    }

    onError(new Error('Google Gemini API key not found. Please configure it in Settings.'));
    return;
  }

  const endpoint = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse&key=${resolvedKey.trim()}`;
  const payload = buildGeminiPayload({ prompt, contents, imageBase64, mimeType, systemInstruction, temperature, maxOutputTokens });

  let attempt = 0;
  const maxGeminiAttempts = 3; // initial attempt + 2 retries

  while (attempt < maxGeminiAttempts) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
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

        if (onDone) onDone(accumulatedText, { provider: 'gemini', model });
        return;
      }

      // Check for rate-limiting (HTTP 429) or service overload (HTTP 503)
      if (response.status === 429 || response.status === 503) {
        attempt++;
        if (attempt < maxGeminiAttempts) {
          const delayMs = Math.pow(2, attempt - 1) * 1000 + Math.random() * 300;
          console.warn(`[AI Orchestrator] Gemini stream HTTP ${response.status}. Retrying in ${Math.round(delayMs)}ms (attempt ${attempt}/2)...`);
          if (onStatus) {
            onStatus({
              status: 'retrying',
              attempt,
              delayMs,
              provider: 'gemini',
              message: `Gemini rate-limited (HTTP ${response.status}). Retrying in ${(delayMs / 1000).toFixed(1)}s...`
            });
          }
          await new Promise(res => setTimeout(res, delayMs));
          continue; // retry Gemini
        }
        // Retries exhausted, break to Groq fallback
        break;
      }

      // Non-retryable HTTP error (e.g., 400 Bad Request, 403 Forbidden)
      const errorJson = await response.json().catch(() => ({}));
      const message = errorJson.error?.message || `Stream error (HTTP ${response.status})`;
      onError(new Error(message));
      return;

    } catch (networkErr) {
      attempt++;
      if (attempt < maxGeminiAttempts) {
        const delayMs = Math.pow(2, attempt - 1) * 1000 + Math.random() * 300;
        console.warn(`[AI Orchestrator] Gemini network error: ${networkErr.message}. Retrying in ${Math.round(delayMs)}ms...`);
        if (onStatus) {
          onStatus({
            status: 'retrying',
            attempt,
            delayMs,
            provider: 'gemini',
            message: `Connection error. Retrying in ${(delayMs / 1000).toFixed(1)}s...`
          });
        }
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }
      break;
    }
  }

  // --- Groq Fallback Phase (Slice 2.4) ---
  if (!imageBase64) {
    const groqKey = await getSavedGroqApiKey();
    if (groqKey) {
      console.warn('[AI Orchestrator] Gemini throttled. Switching stream to Groq Llama-3.3-70b fallback...');
      if (onStatus) {
        onStatus({
          status: 'fallback',
          provider: 'groq',
          model: GROQ_CONFIG.MODEL,
          message: 'Rate-limited. Switched to Groq Fallback'
        });
      }

      return streamGroqContent({
        prompt,
        contents,
        systemInstruction,
        apiKey: groqKey,
        temperature,
        maxOutputTokens,
        onChunk,
        onDone: (fullText) => {
          if (onDone) onDone(fullText, { provider: 'groq', model: GROQ_CONFIG.MODEL });
        },
        onError
      });
    }
  }

  // If fallback was not possible (multimodal image or missing Groq key)
  const finalErrorMsg = imageBase64
    ? 'Gemini vision rate limit exceeded (HTTP 429/503). Please wait a moment and try again.'
    : 'Gemini rate limit reached (HTTP 429/503). Configure a free Groq API key in Settings for automatic instant failover.';
  onError(new Error(finalErrorMsg));
}

/**
 * Executes a non-streaming generation request to Groq API
 * @param {object} options
 * @returns {Promise<object>} Standard generate response
 */
export async function generateGroqContent({
  prompt,
  contents = null,
  systemInstruction = '',
  apiKey = '',
  temperature = 0.3,
  maxOutputTokens = 2048
}) {
  const resolvedKey = apiKey || await getSavedGroqApiKey();
  if (!resolvedKey) {
    return createGenerateResponse({
      success: false,
      error: 'Groq API key not found. Please configure it in Settings.',
      model: GROQ_CONFIG.MODEL,
      provider: 'groq'
    });
  }

  const messages = buildGroqMessages({ prompt, contents, systemInstruction });

  try {
    const response = await fetch(GROQ_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resolvedKey.trim()}`
      },
      body: JSON.stringify({
        model: GROQ_CONFIG.MODEL,
        messages,
        temperature,
        max_tokens: maxOutputTokens,
        stream: false
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const message = errJson.error?.message || `Groq API error (HTTP ${response.status})`;
      return createGenerateResponse({
        success: false,
        error: message,
        model: GROQ_CONFIG.MODEL,
        provider: 'groq'
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return createGenerateResponse({
      success: true,
      text,
      model: GROQ_CONFIG.MODEL,
      provider: 'groq'
    });
  } catch (err) {
    return createGenerateResponse({
      success: false,
      error: `Network error connecting to Groq: ${err.message}`,
      model: GROQ_CONFIG.MODEL,
      provider: 'groq'
    });
  }
}

/**
 * Streams generated content from Groq using Server-Sent Events (SSE)
 * @param {object} options
 */
export async function streamGroqContent({
  prompt,
  contents = null,
  systemInstruction = '',
  apiKey = '',
  temperature = 0.3,
  maxOutputTokens = 2048,
  onChunk,
  onDone,
  onError
}) {
  const resolvedKey = apiKey || await getSavedGroqApiKey();
  if (!resolvedKey) {
    if (onError) onError(new Error('Groq API key not found. Please configure it in Settings.'));
    return;
  }

  const messages = buildGroqMessages({ prompt, contents, systemInstruction });

  try {
    const response = await fetch(GROQ_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resolvedKey.trim()}`
      },
      body: JSON.stringify({
        model: GROQ_CONFIG.MODEL,
        messages,
        temperature,
        max_tokens: maxOutputTokens,
        stream: true
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const message = errJson.error?.message || `Groq stream error (HTTP ${response.status})`;
      if (onError) onError(new Error(message));
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
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          if (onDone) onDone(accumulatedText, { provider: 'groq', model: GROQ_CONFIG.MODEL });
          return;
        }

        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.substring(6).trim());
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              accumulatedText += delta;
              if (onChunk) onChunk(delta, accumulatedText);
            }
          } catch (e) {
            // Partial JSON chunk
          }
        }
      }
    }

    if (onDone) onDone(accumulatedText, { provider: 'groq', model: GROQ_CONFIG.MODEL });
  } catch (err) {
    if (onError) onError(err);
  }
}

/**
 * Converts Gemini prompt/turn structures into OpenAI-compatible messages format for Groq
 */
export function buildGroqMessages({ prompt, contents = null, systemInstruction = '' }) {
  const messages = [];

  if (systemInstruction && systemInstruction.trim()) {
    messages.push({
      role: 'system',
      content: systemInstruction.trim()
    });
  }

  if (contents && Array.isArray(contents) && contents.length > 0) {
    for (const turn of contents) {
      const role = turn.role === 'model' || turn.role === 'assistant' ? 'assistant' : 'user';
      const textParts = (turn.parts || [])
        .map(p => p.text || '')
        .filter(t => t.trim() !== '');

      if (textParts.length > 0) {
        messages.push({
          role,
          content: textParts.join('\n\n')
        });
      }
    }
  } else if (prompt && prompt.trim()) {
    messages.push({
      role: 'user',
      content: prompt.trim()
    });
  }

  // Guarantee at least one user message
  if (messages.length === 0 || !messages.some(m => m.role === 'user')) {
    messages.push({
      role: 'user',
      content: prompt || 'Analyze this content.'
    });
  }

  return messages;
}

/**
 * Builds standard Google Gemini REST payload with multimodal image support
 */
function buildGeminiPayload({
  prompt,
  contents = null,
  imageBase64 = null,
  mimeType = 'image/jpeg',
  systemInstruction,
  temperature,
  maxOutputTokens
}) {
  let resolvedContents = contents;

  if (!resolvedContents || resolvedContents.length === 0) {
    const parts = [];

    // Multimodal image inlineData part (Slice 2.3)
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64
        }
      });
    }

    if (prompt && prompt.trim() !== '') {
      parts.push({ text: prompt.trim() });
    } else if (imageBase64) {
      parts.push({ text: 'Analyze and explain this image in detail, describing any key text, charts, diagrams, or visual data.' });
    }

    resolvedContents = [{ role: 'user', parts }];
  }

  const payload = {
    contents: resolvedContents,
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

/**
 * Helper to get user's saved Groq API Key from chrome.storage.local (Slice 2.4)
 */
export async function getSavedGroqApiKey() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.GROQ_API_KEY]);
    return data[STORAGE_KEYS.GROQ_API_KEY] || '';
  } catch {
    return '';
  }
}
