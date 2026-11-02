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

/**
 * Prompts Gemini / Groq to locate an interactive element based on a user's natural language query (Slice 3.3)
 * @param {object} params
 * @param {string} params.query - e.g. "Where do I submit?" or "Find the email input"
 * @param {Array<object>} params.actionMap - Compact action map array from scanner.js
 * @param {string} [params.language='en']
 * @returns {Promise<object>} { success: boolean, found: boolean, targetElementId: number|null, explanation: string }
 */
export async function findInteractiveElement({ query, actionMap = [], language = 'en' }) {
  if (!query || !query.trim()) {
    return { success: false, error: 'Query is required.' };
  }

  if (!actionMap || actionMap.length === 0) {
    return {
      success: true,
      found: false,
      targetElementId: null,
      explanation: 'No interactive elements were detected on this page.'
    };
  }

  // Build compact string representation of the action map
  const compactList = actionMap.map(el => {
    return `ID: #${el.id} | Tag: <${el.tag}> | Type: ${el.type} | Label: "${el.label}"${el.placeholder ? ` | Placeholder: "${el.placeholder}"` : ''}${el.isConsequential ? ' | ⚠️ Consequential' : ''}`;
  }).join('\n');

  const langInstruction = language === 'hinglish'
    ? 'Provide the explanation in conversational, friendly Hinglish (Hindi written in Latin script with standard English technical terms).'
    : 'Provide the explanation in clear, concise English.';

  const systemInstruction = `You are Sahayak's "Find It For Me" DOM Navigator.
Given a user query and a list of interactive elements detected on the current webpage, determine which element best satisfies what the user is looking for.
${langInstruction}

Strict JSON Output Requirement:
You MUST reply with ONLY a single valid JSON object, without any markdown formatting or code fences:
{
  "found": true,
  "targetElementId": 21,
  "explanation": "Brief explanation pointing out what element was found and why"
}
If no element on the page matches what the user is asking for, return:
{
  "found": false,
  "targetElementId": null,
  "explanation": "Brief explanation stating the element could not be found on this page"
}`;

  const prompt = `User Query: "${query.trim()}"

Webpage Interactive Elements List:
${compactList}

Identify the best matching element and respond with the strict JSON object.`;

  try {
    const result = await generateContent({
      prompt,
      systemInstruction,
      temperature: 0.1, // High determinism
      maxOutputTokens: 512
    });

    if (!result.success || !result.text) {
      throw new Error(result.error || 'Failed to generate locator response.');
    }

    // Parse JSON safely
    const cleanText = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse locator response as JSON.');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      success: true,
      found: Boolean(parsed.found && parsed.targetElementId),
      targetElementId: parsed.targetElementId ? parseInt(parsed.targetElementId, 10) : null,
      explanation: parsed.explanation || (parsed.found ? `Found element #${parsed.targetElementId}` : 'Could not find a matching element on this page.')
    };
  } catch (err) {
    console.error('[AI Orchestrator] findInteractiveElement failed:', err);
    return {
      success: false,
      error: err.message || 'Locator analysis failed.'
    };
  }
}

/**
 * Prompts Gemini / Groq to determine the single next action in an agent errand (Slice 3.4)
 * @param {object} params
 * @param {string} params.goal - User's stated task (e.g. "Fill my name into the form")
 * @param {Array<object>} params.actionMap - Array of detected interactive elements
 * @param {Array<object>} [params.history=[]] - Past step history of this task
 * @param {string} [params.language='en']
 * @param {object} [params.userProfile=null]
 * @returns {Promise<object>} { success: boolean, proposal: { thought, action, targetElementId, value, reason, isConsequential }, error?: string }
 */
export async function proposeAgentAction({
  goal,
  actionMap = [],
  history = [],
  language = 'en',
  userProfile = null
}) {
  if (!goal || !goal.trim()) {
    return { success: false, error: 'Goal is required to propose an action.' };
  }

  if (!actionMap || actionMap.length === 0) {
    return {
      success: false,
      error: 'No interactive elements available on page to perform this task.'
    };
  }

  // Build compact string representation of the action map
  const compactElements = actionMap.map(el => {
    return `ID: #${el.id} | Tag: <${el.tag}> | Type: ${el.type} | Label: "${el.label}"${el.placeholder ? ` | Placeholder: "${el.placeholder}"` : ''}${el.isConsequential ? ' | ⚠️ Consequential' : ''}`;
  }).join('\n');

  // Format past history if any steps exist
  let historySection = 'None (This is Step 1).';
  if (history && history.length > 0) {
    historySection = history.map((h, i) => {
      return `Step ${i + 1}: [Decision: ${h.decision.toUpperCase()}] Action: ${h.action.toUpperCase()} on Element #${h.targetElementId || 'None'} ${h.value ? `with value "${h.value}"` : ''} — ${h.reason}`;
    }).join('\n');
  }

  // Format user profile section if available (Slice 4.1 Local User Profile Memory)
  let profileSection = 'User Profile Memory: None stored.';
  if (userProfile && typeof userProfile === 'object') {
    const profileLines = [];
    const profName = userProfile.fullName || userProfile.name;
    if (profName) profileLines.push(`- Full Name: "${profName}"`);
    if (userProfile.email) profileLines.push(`- Email Address: "${userProfile.email}"`);
    if (userProfile.phone) profileLines.push(`- Contact / Phone: "${userProfile.phone}"`);
    const profCollege = userProfile.collegeOrCompany || userProfile.college;
    if (profCollege) profileLines.push(`- College / University / Organization: "${profCollege}"`);
    if (userProfile.graduationYear) profileLines.push(`- Graduation Year: "${userProfile.graduationYear}"`);
    if (userProfile.skills) {
      const skillsStr = Array.isArray(userProfile.skills) ? userProfile.skills.join(', ') : userProfile.skills;
      profileLines.push(`- Technical Skills: "${skillsStr}"`);
    }
    const profGithub = userProfile.githubUrl || userProfile.github;
    if (profGithub) profileLines.push(`- GitHub Profile URL: "${profGithub}"`);
    const profLinkedin = userProfile.linkedinUrl || userProfile.linkedin;
    if (profLinkedin) profileLines.push(`- LinkedIn Profile URL: "${profLinkedin}"`);
    const profPortfolio = userProfile.portfolioUrl || userProfile.portfolio;
    if (profPortfolio) profileLines.push(`- Portfolio URL: "${profPortfolio}"`);
    if (userProfile.preferredTone) profileLines.push(`- Tone Preference: "${userProfile.preferredTone}"`);
    if (userProfile.notes) profileLines.push(`- Statement of Purpose / Bio: "${userProfile.notes}"`);

    if (profileLines.length > 0) {
      profileSection = `User Profile Memory (Stored Local Data for Autofill & Personalization):\n${profileLines.join('\n')}`;
    }
  }

  const langInstruction = language === 'hinglish'
    ? 'Provide the "reason" field in friendly, conversational Hinglish (Hindi written in Latin script with standard English technical terms).'
    : 'Provide the "reason" field in clear, concise English.';

  const systemInstruction = `You are Sahayak's Human-in-the-Loop Browser Automation Agent.
Your role is to guide the user through completing an errand on a webpage by proposing ONE single atomic action at a time.
No browser action will ever execute without direct human approval.

Supported Action Types:
- "type": Enter text into an input, textarea, or search field. Requires "targetElementId" and "value".
- "click": Click a button, link, checkbox, or radio button. Requires "targetElementId".
- "select": Choose a value from a dropdown (<select>). Requires "targetElementId" and "value".
- "scroll": Scroll a specific element into center view. Requires "targetElementId".
- "done": The user's goal has been fully completed! (e.g. all requested fields are filled, or errand finished).
- "fail": The goal cannot be achieved with the elements available on this page.

Strict Execution Rules:
1. Propose EXACTLY ONE action. Never combine multiple steps.
2. If the user's goal is already satisfied by past actions, return action: "done".
3. NEVER target password fields.
4. When the goal is "Fill this form using my profile" or mentions "profile", extract and map matching fields directly from User Profile Memory:
   * Full Name -> target input labeled "Full Name" or "Name" (use exact stored name)
   * Email -> target input labeled "Email" or type="email"
   * Phone -> target input labeled "Phone", "WhatsApp", or type="tel"
   * College / Org -> target input labeled "College", "University", "Organization"
   * Graduation Year -> target select dropdown labeled "Graduation Year" or "Passing Year"
   * Technical Skills -> target checkboxes or inputs matching the skills in profile
   * GitHub URL -> target input labeled "GitHub"
   * LinkedIn URL -> target input labeled "LinkedIn"
   * Statement -> target textarea labeled "Statement" or "Cover Letter"
5. If the goal is "Fill my name into the form", find the element labeled "Full Name" or similar, and propose "type" with the stored name (use "${userProfile?.fullName || userProfile?.name || 'Kasturi Mahesh'}").
6. Do NOT submit a form (click consequential Submit buttons) unless the user's explicit goal specifically requested to submit.
7. ${langInstruction}

Strict JSON Output Requirement:
Respond with ONLY a single valid JSON object, without any markdown formatting or code fences:
{
  "thought": "Brief 1-sentence reasoning explaining why this element and action was chosen",
  "action": "type",
  "targetElementId": 4,
  "value": "Kasturi Mahesh",
  "reason": "Enter full name from profile into the Full Name field",
  "isConsequential": false
}`;

  const prompt = `User Goal: "${goal.trim()}"

${profileSection}

Prior Steps History:
${historySection}

Current Page Interactive Elements:
${compactElements}

Determine the single next action to make progress toward the goal using the stored profile memory and reply with strict JSON.`;

  try {
    const result = await generateContent({
      prompt,
      systemInstruction,
      temperature: 0.1, // Deterministic single-step proposal
      maxOutputTokens: 512
    });

    if (!result.success || !result.text) {
      throw new Error(result.error || 'Failed to generate action proposal.');
    }

    // Parse JSON cleanly
    const cleanText = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Model response did not contain a valid JSON object.');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validation & Normalization
    const validActions = ['click', 'type', 'select', 'scroll', 'done', 'fail'];
    const action = (parsed.action || '').toLowerCase().trim();

    if (!validActions.includes(action)) {
      throw new Error(`Invalid action type "${action}" returned by model.`);
    }

    let targetElementId = parsed.targetElementId ? parseInt(parsed.targetElementId, 10) : null;
    let isConsequential = Boolean(parsed.isConsequential);

    // If an element was targeted, verify it exists in actionMap
    if (targetElementId !== null && action !== 'done' && action !== 'fail') {
      const targetEl = actionMap.find(el => el.id === targetElementId);
      if (!targetEl) {
        // Fallback: search if model returned 0 or slightly off id
        throw new Error(`Target element #${targetElementId} does not exist in the current page action map.`);
      }
      if (targetEl.isConsequential) {
        isConsequential = true;
      }
    }

    return {
      success: true,
      proposal: {
        thought: parsed.thought || 'Next step towards completing the user errand.',
        action,
        targetElementId,
        value: parsed.value !== undefined ? String(parsed.value) : null,
        reason: parsed.reason || (action === 'done' ? 'Goal has been reached.' : `Execute ${action} on element #${targetElementId}`),
        isConsequential
      }
    };
  } catch (err) {
    console.warn('[AI Orchestrator] proposeAgentAction AI call failed, checking deterministic fallback:', err.message);
    const fallbackProposal = generateDeterministicProposal({ goal, actionMap, history, userProfile });
    if (fallbackProposal) {
      console.log('[AI Orchestrator] Using deterministic action proposal:', fallbackProposal);
      return {
        success: true,
        proposal: fallbackProposal
      };
    }

    return {
      success: false,
      error: err.message || 'Failed to determine next action.'
    };
  }
}

/**
 * Deterministic fallback for common errand goals on forms
 * @param {object} params
 * @returns {object|null}
 */
function generateDeterministicProposal({ goal, actionMap, history = [], userProfile = null }) {
  const g = (goal || '').toLowerCase().trim();
  const userName = userProfile?.fullName || userProfile?.name || 'Kasturi Mahesh';
  const userEmail = userProfile?.email || 'kasturi.mahesh@example.com';
  const userPhone = userProfile?.phone || '+91 98765 43210';
  const userCollege = userProfile?.collegeOrCompany || userProfile?.college || 'IIT Bombay';
  const userGradYear = userProfile?.graduationYear || '2026';
  const userGithub = userProfile?.githubUrl || userProfile?.github || 'https://github.com/kasturi-mahesh';
  const userLinkedin = userProfile?.linkedinUrl || userProfile?.linkedin || 'https://linkedin.com/in/kasturi-mahesh';
  const userSkills = userProfile?.skills || 'JavaScript, Python, React, Chrome Extensions';
  const userStatement = userProfile?.notes || 'Enthusiastic about building safe human-in-the-loop AI browser systems.';
  const approvedSteps = history.filter(h => h.decision === 'approved');

  // Goal: Name only
  if (g.includes('name') && !g.includes('form') && !g.includes('profile') && !g.includes('application')) {
    const alreadyFilled = approvedSteps.some(h =>
      (h.action === 'type' && (h.value === userName || (h.reason && h.reason.toLowerCase().includes('name'))))
    );
    if (alreadyFilled) {
      return {
        thought: 'Full name has already been entered into the form.',
        action: 'done',
        targetElementId: null,
        value: null,
        reason: 'Candidate name has been filled into the form.',
        isConsequential: false
      };
    }

    const nameEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('name') ||
      (el.placeholder || '').toLowerCase().includes('name')
    );
    if (nameEl) {
      return {
        thought: `Found input element #${nameEl.id} labeled "${nameEl.label}" for candidate name.`,
        action: 'type',
        targetElementId: nameEl.id,
        value: userName,
        reason: `Enter full name "${userName}" into the ${nameEl.label} field`,
        isConsequential: Boolean(nameEl.isConsequential)
      };
    }
  }

  // Goal: Year / Graduation only
  if ((g.includes('grad') || g.includes('year') || g.includes('2026')) && !g.includes('form') && !g.includes('profile') && !g.includes('application')) {
    const alreadySelected = approvedSteps.some(h => h.action === 'select');
    if (alreadySelected) {
      return {
        thought: 'Graduation year has been selected.',
        action: 'done',
        targetElementId: null,
        value: null,
        reason: 'Graduation year is selected.',
        isConsequential: false
      };
    }

    const gradEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('year') ||
      (el.label || '').toLowerCase().includes('grad') ||
      el.tag === 'SELECT'
    );
    if (gradEl) {
      return {
        thought: `Found dropdown #${gradEl.id} for graduation year.`,
        action: 'select',
        targetElementId: gradEl.id,
        value: userGradYear,
        reason: `Select "${userGradYear}" in the ${gradEl.label || 'Graduation Year'} dropdown`,
        isConsequential: false
      };
    }
  }

  // Goal: Terms / Agreement only
  if ((g.includes('term') || g.includes('agree') || g.includes('condition')) && !g.includes('form') && !g.includes('profile')) {
    const termsEl = actionMap.find(el =>
      el.type === 'checkbox' && (
        (el.label || '').toLowerCase().includes('term') ||
        (el.label || '').toLowerCase().includes('agree')
      )
    );
    if (termsEl) {
      return {
        thought: `Found terms checkbox #${termsEl.id}.`,
        action: 'click',
        targetElementId: termsEl.id,
        value: null,
        reason: 'Check the terms & agreement checkbox',
        isConsequential: false
      };
    }
  }

  // Goal: Submit
  if (g.includes('submit') && !g.includes('form') && !g.includes('profile')) {
    const submitEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('submit') ||
      el.type === 'submit'
    );
    if (submitEl) {
      return {
        thought: `Found submit button #${submitEl.id}.`,
        action: 'click',
        targetElementId: submitEl.id,
        value: null,
        reason: 'Submit the application form',
        isConsequential: true
      };
    }
  }

  // Comprehensive multi-step form errand (e.g. "Fill this form using my profile", "Fill internship application", "Fill form")
  if (g.includes('form') || g.includes('profile') || g.includes('internship') || g.includes('application') || g.includes('fill')) {
    // 1. Candidate Full Name
    const nameEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('name') ||
      (el.placeholder || '').toLowerCase().includes('name')
    );
    const nameFilled = approvedSteps.some(h =>
      h.action === 'type' && (h.targetElementId === nameEl?.id || (h.reason && h.reason.toLowerCase().includes('name')))
    );
    if (nameEl && !nameFilled) {
      return {
        thought: `Found input element #${nameEl.id} labeled "${nameEl.label}" for candidate name.`,
        action: 'type',
        targetElementId: nameEl.id,
        value: userName,
        reason: `Enter full name "${userName}" from profile into the ${nameEl.label} field`,
        isConsequential: false
      };
    }

    // 2. Candidate Email
    const emailEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('email') ||
      (el.placeholder || '').toLowerCase().includes('email') ||
      el.type === 'email'
    );
    const emailFilled = approvedSteps.some(h =>
      h.action === 'type' && (h.targetElementId === emailEl?.id || (h.reason && h.reason.toLowerCase().includes('email')))
    );
    if (emailEl && !emailFilled) {
      return {
        thought: `Found email field #${emailEl.id} labeled "${emailEl.label}".`,
        action: 'type',
        targetElementId: emailEl.id,
        value: userEmail,
        reason: `Enter email address "${userEmail}" from profile into the ${emailEl.label} field`,
        isConsequential: false
      };
    }

    // 3. Contact Phone
    const phoneEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('phone') ||
      (el.label || '').toLowerCase().includes('contact') ||
      (el.label || '').toLowerCase().includes('whatsapp') ||
      el.type === 'tel'
    );
    const phoneFilled = approvedSteps.some(h =>
      h.action === 'type' && (h.targetElementId === phoneEl?.id || (h.reason && h.reason.toLowerCase().includes('phone')))
    );
    if (phoneEl && !phoneFilled) {
      return {
        thought: `Found phone input #${phoneEl.id} labeled "${phoneEl.label}".`,
        action: 'type',
        targetElementId: phoneEl.id,
        value: userPhone,
        reason: `Enter contact number "${userPhone}" from profile into the ${phoneEl.label} field`,
        isConsequential: false
      };
    }

    // 4. College / Organization
    const collegeEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('college') ||
      (el.label || '').toLowerCase().includes('university')
    );
    const collegeFilled = approvedSteps.some(h =>
      h.action === 'type' && (h.targetElementId === collegeEl?.id || (h.reason && h.reason.toLowerCase().includes('college')))
    );
    if (collegeEl && !collegeFilled) {
      return {
        thought: `Found college input #${collegeEl.id} labeled "${collegeEl.label}".`,
        action: 'type',
        targetElementId: collegeEl.id,
        value: userCollege,
        reason: `Enter college/university "${userCollege}" from profile into the ${collegeEl.label} field`,
        isConsequential: false
      };
    }

    // 5. Graduation Year
    const gradEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('year') ||
      (el.label || '').toLowerCase().includes('grad') ||
      (el.tag === 'SELECT' && (el.label || '').toLowerCase().includes('grad'))
    );
    const gradFilled = approvedSteps.some(h =>
      h.action === 'select' && (h.targetElementId === gradEl?.id || (h.reason && h.reason.toLowerCase().includes('grad')))
    );
    if (gradEl && !gradFilled) {
      return {
        thought: `Found dropdown #${gradEl.id} for graduation year.`,
        action: 'select',
        targetElementId: gradEl.id,
        value: userGradYear,
        reason: `Select "${userGradYear}" from profile in the ${gradEl.label || 'Graduation Year'} dropdown`,
        isConsequential: false
      };
    }

    // 6. Target Track / Role (if on practice form)
    const roleEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('track') ||
      (el.label || '').toLowerCase().includes('role')
    );
    const roleFilled = approvedSteps.some(h =>
      h.action === 'select' && (h.targetElementId === roleEl?.id || (h.reason && h.reason.toLowerCase().includes('track')))
    );
    if (roleEl && !roleFilled) {
      return {
        thought: `Found internship track dropdown #${roleEl.id}.`,
        action: 'select',
        targetElementId: roleEl.id,
        value: 'ai-systems',
        reason: 'Select "ai-systems" track in Target Internship Track dropdown',
        isConsequential: false
      };
    }

    // 7. Core Skills Checkboxes
    const skillsKeywords = typeof userSkills === 'string'
      ? userSkills.toLowerCase().split(/[,|;]/).map(s => s.trim()).filter(Boolean)
      : (Array.isArray(userSkills) ? userSkills.map(s => String(s).toLowerCase().trim()) : []);

    const skillCheckboxes = actionMap.filter(el =>
      el.type === 'checkbox' && (
        (el.label || '').toLowerCase().includes('javascript') ||
        (el.label || '').toLowerCase().includes('python') ||
        (el.label || '').toLowerCase().includes('chrome') ||
        (el.label || '').toLowerCase().includes('react')
      )
    );

    for (const box of skillCheckboxes) {
      const boxLabel = (box.label || '').toLowerCase();
      const matchesSkill = skillsKeywords.some(sk => boxLabel.includes(sk) || (sk.includes('js') && boxLabel.includes('javascript')));
      const alreadyChecked = approvedSteps.some(h => h.action === 'click' && h.targetElementId === box.id);
      if (matchesSkill && !alreadyChecked) {
        return {
          thought: `Found skill checkbox #${box.id} matching profile skills.`,
          action: 'click',
          targetElementId: box.id,
          value: null,
          reason: `Select skill "${box.label}" matching stored profile`,
          isConsequential: false
        };
      }
    }

    // 8. GitHub Profile URL
    const githubEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('github') ||
      (el.placeholder || '').toLowerCase().includes('github')
    );
    const githubFilled = approvedSteps.some(h =>
      h.action === 'type' && (h.targetElementId === githubEl?.id || (h.reason && h.reason.toLowerCase().includes('github')))
    );
    if (githubEl && !githubFilled && userGithub) {
      return {
        thought: `Found GitHub input field #${githubEl.id}.`,
        action: 'type',
        targetElementId: githubEl.id,
        value: userGithub,
        reason: `Enter GitHub profile "${userGithub}" from profile into ${githubEl.label} field`,
        isConsequential: false
      };
    }

    // 9. LinkedIn Profile URL
    const linkedinEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('linkedin') ||
      (el.placeholder || '').toLowerCase().includes('linkedin')
    );
    const linkedinFilled = approvedSteps.some(h =>
      h.action === 'type' && (h.targetElementId === linkedinEl?.id || (h.reason && h.reason.toLowerCase().includes('linkedin')))
    );
    if (linkedinEl && !linkedinFilled && userLinkedin) {
      return {
        thought: `Found LinkedIn input field #${linkedinEl.id}.`,
        action: 'type',
        targetElementId: linkedinEl.id,
        value: userLinkedin,
        reason: `Enter LinkedIn profile "${userLinkedin}" from profile into ${linkedinEl.label} field`,
        isConsequential: false
      };
    }

    // 10. Statement of Purpose
    const statementEl = actionMap.find(el =>
      (el.label || '').toLowerCase().includes('statement') ||
      (el.label || '').toLowerCase().includes('purpose') ||
      (el.label || '').toLowerCase().includes('cover') ||
      el.tag === 'TEXTAREA'
    );
    const statementFilled = approvedSteps.some(h =>
      h.action === 'type' && (h.targetElementId === statementEl?.id || (h.reason && h.reason.toLowerCase().includes('statement')))
    );
    if (statementEl && !statementFilled && userStatement) {
      return {
        thought: `Found statement of purpose textarea #${statementEl.id}.`,
        action: 'type',
        targetElementId: statementEl.id,
        value: userStatement,
        reason: `Enter statement of purpose from profile into ${statementEl.label} field`,
        isConsequential: false
      };
    }

    // 11. Terms & Agreement Checkbox
    const termsEl = actionMap.find(el =>
      el.type === 'checkbox' && (
        (el.label || '').toLowerCase().includes('term') ||
        (el.label || '').toLowerCase().includes('agree') ||
        (el.label || '').toLowerCase().includes('certify')
      )
    );
    const termsChecked = approvedSteps.some(h =>
      h.action === 'click' && (h.targetElementId === termsEl?.id || (h.reason && h.reason.toLowerCase().includes('term')))
    );
    if (termsEl && !termsChecked) {
      return {
        thought: `Found terms agreement checkbox #${termsEl.id}.`,
        action: 'click',
        targetElementId: termsEl.id,
        value: null,
        reason: 'Check the terms & agreement checkbox',
        isConsequential: false
      };
    }

    // All form fields completed!
    return {
      thought: 'All requested application fields have been successfully mapped from profile and approved.',
      action: 'done',
      targetElementId: null,
      value: null,
      reason: 'Application form fields have been successfully completed using stored profile memory.',
      isConsequential: false
    };
  }

  return null;
}


