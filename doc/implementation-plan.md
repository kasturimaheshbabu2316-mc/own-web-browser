# Phase-Wise Implementation Plan: Sahayak AI Browser Assistant

> **Project**: Sahayak — Chrome Side-Panel AI Agent  
> **Source Documents**: [`doc/ProblemStatement.md`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/doc/ProblemStatement.md) & [`doc/architecture.md`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/doc/architecture.md)  
> **Target Timeline**: 4 Weeks (4 Core Phases, 17 Vertical Slices)  
> **Target Platform**: Google Chrome Extension (Manifest V3)  
> **Status**: Ready for Execution

---

## 1. Project Roadmap Overview

Sahayak is built in 4 vertical phases designed for progressive validation. Each phase produces a working, testable extension increment:

| Phase | Duration | Core Subsystem | Key Output Deliverable |
| --- | --- | --- | --- |
| **Phase 1** | Week 1 | **The Eyes** — Read the Web | Extension shell, API client, Readability article summary, YouTube timestamps, English/Hinglish toggle |
| **Phase 2** | Week 2 | **The Brain** — Understand Page & Screen | Grounded page chat, context-menu actions, screenshot-and-ask, Groq rate-limit fallback |
| **Phase 3** | Week 3 | **The Hands** — Act With User Approval | DOM element scanner, numbered badges, HITL approval loop, dry-run mode, practice errands |
| **Phase 4** | Week 4 | **Memory, Safety & Shipping** | Local profile autofill, one-click skills import/export, deterministic guardrails, GitHub release |

---

## 2. Phase 1: Week 1 — The Eyes: Read the Web

### Objective: Phase 1

Scaffold the Chrome Manifest V3 foundation and deliver the core content perception engine capable of extracting, de-cluttering, and summarizing text and YouTube media in English and Hinglish.

---

### Slice 1.1: Extension Shell, Side Panel & Settings Subsystem

#### Scope & Files: Slice 1.1

- Create [`manifest.json`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/manifest.json) with MV3 permissions: `sidePanel`, `storage`, `activeTab`, `scripting`.
- Create [`src/background/service-worker.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/background/service-worker.js) with side panel opener behavior: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });`.

- Create [`src/sidepanel/index.html`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/sidepanel/index.html) and [`src/sidepanel/sidepanel.css`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/sidepanel/sidepanel.css) using a clean dark/light UI design system.
- Implement Settings view inside the side panel to save the user's Gemini API key to `chrome.storage.local`.

#### Verification Steps: Slice 1.1

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** and click **Load unpacked**.
3. Select `c:\Users\kastu\Desktop\Own AI Browser`.
4. Click the extension toolbar icon; verify the Chrome Side Panel opens on the right side of the screen.
5. Enter a test API key into the Settings input; click **Save**; verify the key persists upon closing and reopening the side panel.

---

### Slice 1.2: Gemini Flash-Lite Direct REST Client

#### Scope & Files: Slice 1.2

- Create [`src/background/ai-orchestrator.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/background/ai-orchestrator.js) handling direct HTTPS calls to Google Gemini REST API:
  - Default Model: `gemini-2.0-flash-lite` or `gemini-1.5-flash-latest`.
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}`.
- Create [`src/shared/types.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/shared/types.js) defining the IPC request/response schema.
- Implement streaming text response via Server-Sent Events (SSE) or chunked buffer updates sent from background to side panel.

#### Verification Steps: Slice 1.2

1. In the side panel, click **Test AI Connection**.
2. Confirm the background worker receives the prompt, invokes Gemini, and renders the streamed reply in the side panel.
3. Test with an empty or invalid API key; verify a user-friendly error banner appears without crashing the extension.

---

### Slice 1.3: Article Extraction & Structured Summarization

#### Scope & Files: Slice 1.3

- Bundle Mozilla Readability in [`src/sidepanel/lib/readability.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/sidepanel/lib/readability.js).
- Create [`src/content/extractor.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/content/extractor.js) to clone the DOM, run `Readability.isProbablyReaderable(document)`, extract article text, and strip navs/ads.
- In [`src/sidepanel/components/summary-view.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/sidepanel/components/summary-view.js), implement the **Summarize Page** action.
- System prompt enforces structured output:
  - **TL;DR**: 1–2 sentences.
  - **Key Insights**: Exactly 5 bullet points.
  - **Next Steps**: 2–3 actionable suggestions.

#### Verification Steps: Slice 1.3

1. Navigate to a news article (e.g., Wikipedia, TechCrunch, or MDN).
2. Click **Summarize Article** in the side panel.
3. Verify that navigation bars, comments, and footers are omitted.
4. Verify the rendered card displays TL;DR, 5 bullet points, and Next Steps.

---

### Slice 1.4: Public YouTube Video Summarizer & Clickable Timestamps

#### Scope & Files: Slice 1.4

- In [`src/background/service-worker.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/background/service-worker.js), detect tab navigation to `youtube.com/watch?v=*`.
- Implement YouTube transcript fetcher via YouTube timedtext API or Gemini YouTube URL ingestion.
- Prompt generates chapter breakdown with `[MM:SS]` timestamps.
- When clicked, timestamps send an IPC message to the content script in the YouTube tab: `document.querySelector('video').currentTime = timestampSeconds;`.

#### Verification Steps: Slice 1.4

1. Open any public YouTube video with closed captions.
2. Click **Summarize Video** in the side panel.
3. Verify generated summary includes timestamp links like `[02:15]`.
4. Click `[02:15]`; verify the YouTube video player immediately jumps to 2 minutes and 15 seconds.

---

### Slice 1.5: Bilingual Language Toggle (English vs. Hinglish)

#### Scope & Files: Slice 1.5

- Add language segment switch (`EN` / `Hinglish`) in the side panel header.
- Store preference in `chrome.storage.local` under key `sahayak_language`.
- Inject language instructions into the AI system prompt to respond in conversational Hinglish mixing Hindi grammar with standard English technical terms (e.g., *"Yeh article explain karta hai ki microservices architecture kaise scale hoti hai..."*).

#### Verification Steps: Slice 1.5

1. Switch language toggle to **Hinglish**.
2. Click **Summarize Article** on an English article.
3. Verify the generated TL;DR and key points are written in natural, fluent Hinglish.
4. Switch toggle back to **EN**; re-summarize; verify output returns to English.

---

### Phase 1 Acceptance Criteria

- [ ] Unpacked extension loads into Chrome with zero manifest warnings.
- [ ] Side panel opens and retains the user's Gemini API key locally.
- [ ] Any readable web article generates a structured 3-part summary.
- [ ] Public YouTube videos produce chapter summaries with functional seek timestamps.
- [ ] English and Hinglish language switching functions seamlessly.

---

## 3. Phase 2: Week 2 — The Brain: Understand the Page and the Screen

### Objective: Phase 2

Turn the side panel into an active conversational partner that answers questions grounded strictly in the page context, supports right-click text actions, captures visible screen regions for visual queries, and gracefully handles free-tier rate limits.

---

### Slice 2.1: Grounded Page Chat Engine

#### Scope & Files: Slice 2.1

- Create [`src/sidepanel/components/chat-view.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/sidepanel/components/chat-view.js) with message thread UI, user bubble, AI bubble, and scroll-to-bottom.
- Extract live page text using `extractor.js` and inject as strict system context delimiters (`<<<PAGE_CONTEXT>>>` and `<<<END_PAGE_CONTEXT>>>`).

- Strict Negative Constraint: If the requested answer is not in the excerpt, model must reply:  
  *"I cannot find this information in the current page."*
- Maintain in-memory conversation history for the active session.

#### Verification Steps: Slice 2.1

1. Open a technical documentation page (e.g., Python `asyncio` docs).
2. Ask: *"What is an event loop according to this page?"* -> Verify accurate, grounded answer.
3. Ask: *"Who won the 1994 FIFA World Cup?"* -> Verify the model explicitly replies that the information is not present on the current page.

---

### Slice 2.2: Context-Menu AI Actions

#### Scope & Files: Slice 2.2

- In [`src/background/context-menu.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/background/context-menu.js), initialize context menus on `chrome.runtime.onInstalled`:
  1. `sahayak-explain`: *"Sahayak: Explain this"*
  2. `sahayak-translate`: *"Sahayak: Translate to Hindi / Hinglish"*
  3. `sahayak-draft`: *"Sahayak: Draft a reply"*
- Listening to `chrome.contextMenus.onClicked`:
  - Capture `info.selectionText`.
  - Automatically open side panel with `chrome.sidePanel.open({ windowId })`.
  - Route prompt to `ai-orchestrator.js` and pipe result into the active side panel view.

#### Verification Steps: Slice 2.2

1. Select a paragraph of complex text on any webpage.
2. Right-click and choose **Sahayak: Explain this**.
3. Verify the side panel opens and immediately displays a simplified explanation.
4. Select an email or post; right-click **Sahayak: Draft a reply**; verify a polished contextual response is generated.

---

### Slice 2.3: Visual Multimodal Understanding (Screenshot-and-Ask)

#### Scope & Files: Slice 2.3

- Add **Capture & Ask** button in the side panel.
- In background worker, execute `chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 })`.
- Provide an optional coordinate cropping tool in the side panel using an HTML5 canvas overlay.
- Dispatch image payload as an inline data part to `gemini-1.5-flash` or `gemini-2.0-flash`.

#### Verification Steps: Slice 2.3

1. Navigate to a page with an infographics chart, diagram, or error modal.
2. Click **Capture & Ask**; crop the diagram region.
3. Prompt: *"Explain the trend shown in this chart."*
4. Verify the multimodal model analyzes visual axes, labels, and numbers correctly.

---

### Slice 2.4: Free-Tier Resilience & Fallback Engine

#### Scope & Files: Slice 2.4

- In [`src/background/ai-orchestrator.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/background/ai-orchestrator.js):
  - Add Groq free-tier provider client (`https://api.groq.com/openai/v1/chat/completions`) using model `llama-3.3-70b-versatile`.
  - Add Groq API Key input in the Settings view.
- Circuit Breaker & Exponential Backoff:
  - If Gemini returns HTTP 429 (rate-limit) or 503:
    1. Wait `1000ms * 2^attempt + jitter`.
    2. Retry up to 2 times.
    3. If still throttled, fail over to Groq API for text requests.
- Surface active status pills in the Side Panel:
  - Green: *Gemini Flash-Lite Active*
  - Orange: *Rate-limited. Switched to Groq Fallback*

#### Verification Steps: Slice 2.4

1. Simulate or trigger a 429 response by sending back-to-back rapid queries.
2. Confirm the extension does not throw an uncaught error.
3. Verify the UI updates to show retry status, and falls back to Groq successfully.

---

### Phase 2 Acceptance Criteria

- [ ] Chat responds accurately using only page context, refusing ungrounded queries.
- [ ] Right-click context menus trigger Explain, Translate, and Draft reply.
- [ ] Screenshot-and-ask captures visible screen regions and accurately answers visual questions.
- [ ] Throttling and rate limits fail over to the Groq fallback provider seamlessly.

---

## 4. Phase 3: Week 3 — The Hands: Act With User Approval

### Objective: Phase 3

Provide controlled browser interaction capabilities. Sahayak scans the page for interactive elements, assigns stable numbers, renders non-invasive badges, formulates single-step proposals via strict JSON, and executes browser mutations only after explicit human approval.

---

### Slice 3.1: Interactive Element Scanner

#### Scope & Files: Slice 3.1

- Create [`src/content/scanner.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/content/scanner.js).
- Target selectors:
  - Buttons: `button`, `[role="button"]`, `input[type="submit"]`, `input[type="button"]`
  - Links: `a[href]`, `[role="link"]`
  - Text fields: `input[type="text"]`, `input[type="email"]`, `input[type="search"]`, `textarea`
  - Choice controls: `select`, `input[type="checkbox"]`, `input[type="radio"]`
- Filter criteria:
  - Element must be visible: `offsetWidth > 0 && offsetHeight > 0`.
  - Computed style: `visibility !== 'hidden' && display !== 'none' && opacity > 0`.
- Return compact action map array: `{ id, tag, type, label, placeholder, isConsequential }`.

#### Verification Steps: Slice 3.1

1. Open [`assets/practice/internship-form.html`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/assets/practice/internship-form.html).
2. Trigger page scan from side panel.
3. Verify in browser console that all inputs, selects, and buttons receive unique sequential integers (`1, 2, 3...`).

---

### Slice 3.2: Numbered Action Map & Shadow DOM Badges

#### Scope & Files: Slice 3.2

- Create [`src/content/overlay.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/content/overlay.js).
- Create a container element `#sahayak-badge-host` with closed Shadow DOM to guarantee style isolation via `host.attachShadow({ mode: 'closed' })`.

- Calculate coordinates using `getBoundingClientRect()` with window scroll offsets.
- Render clean badge pills (`1`, `2`, `3`) anchored to top-left of each target element.
- Provide a toggle in the side panel to hide/show visual badges on demand.

#### Verification Steps: Slice 3.2

1. Navigate to any complex webpage (e.g., GitHub or Wikipedia).
2. Click **Show Badges** in the side panel.
3. Verify badges appear directly on top of links and buttons without shifting page layout or conflicting with site CSS.
4. Scroll page; verify badges track element coordinates properly.

---

### Slice 3.3: "Find It For Me" Natural Language Locator

#### Scope & Files: Slice 3.3

- In side panel, add a query input: *"Where do I find...?"*
- Prompt Gemini with user query and compact action map JSON. Model returns structured result containing `found`, `targetElementId`, and `explanation`.
- Content script smoothly scrolls target element into view via `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` and triggers a glowing pulse effect.

#### Verification Steps: Slice 3.3

1. On a long article or form, ask: *"Where is the submit button?"*
2. Verify the page auto-scrolls directly to the button.
3. Verify the target element pulses with an amber glow without being clicked.

---

### Slice 3.4: Human-in-the-Loop Agent State Machine

#### Scope & Files: Slice 3.4

- Create [`src/background/state-manager.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/background/state-manager.js) managing task lifecycle:
  - States: `IDLE`, `SCANNING`, `AWAITING_APPROVAL`, `EXECUTING`, `COMPLETED`, `STOPPED`.
- Single-Step Agent Loop:
  1. Content script scans DOM and builds action map.
  2. Model determines single next action in strict JSON containing `action` (`click`/`type`/`select`/`scroll`/`done`), `targetElementId`, `value`, `reason`, and `isConsequential`.
  3. Side panel renders **Action Proposal Card** with target, value, reason, and `[ Approve ] [ Skip ] [ Stop ]` controls.
  4. Execution halts completely until the user clicks **Approve**.

#### Verification Steps: Slice 3.4

1. Launch task: *"Fill my name into the form"* on the practice form.
2. Confirm the agent pauses in `AWAITING_APPROVAL` state.
3. Verify **zero** DOM mutations take place before clicking **Approve**.
4. Click **Approve**; verify the action executes and the state machine moves to the next step.

---

### Slice 3.5: Synthetic DOM Execution & Safety Controls

#### Scope & Files: Slice 3.5

- Create [`src/content/executor.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/content/executor.js).
- Implement robust synthetic event triggers compatible with modern frameworks (React, Vue, Angular):
  - `click`: Focus element, dispatch `pointerdown`, `mousedown`, `mouseup`, `click`.
  - `type`: Native prototype setter call (`HTMLInputElement.prototype`), dispatch `input` and `change` events.
  - `select`: Set `.value`, dispatch `change`.
- Agent Controls:
  - **Max Step Limit**: Default 10 steps, configurable in settings.
  - **Dry-Run Mode**: Highlights the element without dispatching click/type.
  - **Action Log**: Preserves history of every step, reason, timestamp, and user decision.
  - **Service Worker Persistence**: State synced to `chrome.storage.session` so sleeping workers resume cleanly.

#### Verification Steps: Slice 3.5

1. Run a 3-step form filling errand in **Dry-Run Mode**.
2. Verify each field highlights sequentially upon approval, but values remain untouched.
3. Switch off dry-run; verify values are typed and React/form inputs acknowledge changes.
4. Click **Stop** mid-task; verify errand terminates instantly and badges clear.

---

### Phase 3 Acceptance Criteria

- [ ] All interactive elements are detected, classified, and numbered.
- [ ] Numbered badges display seamlessly inside an isolated Shadow DOM.
- [ ] Natural language search ("Find it for me") scrolls to and highlights target elements.
- [ ] Agent proposes one step at a time via strict JSON schema.
- [ ] No browser action executes without direct user approval.
- [ ] Approve, Skip, Stop, dry-run, and step limits function reliably.
- [ ] Two practice errands complete successfully under user guidance.

---

## 5. Phase 4: Week 4 — Memory, Safety, and Shipping

### Objective: Phase 4

Equip Sahayak with persistent local user profile memory, one-click reusable prompt recipes, code-enforced deterministic safety guardrails, and prepare the project for public GitHub release.

---

### Slice 4.1: Local User Profile Memory & Smart Autofill

#### Scope & Files: Slice 4.1

- Create [`src/sidepanel/components/profile-view.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/sidepanel/components/profile-view.js).
- User Profile Schema:
  - Full Name, Email, Phone, College/Org, Graduation Year, Skills, Portfolio URL, LinkedIn URL, GitHub URL.
  - Stored strictly in `chrome.storage.local` under `sahayak_user_profile`.
- When giving an errand like *"Fill this application from my profile"*, the agent injects relevant profile fields into the prompt context to match form inputs.

#### Verification Steps: Slice 4.1

1. Fill out user profile in the side panel settings (e.g., Name: *"Kasturi Mahesh"*, College: *"IIT"*).
2. Open practice form: [`assets/practice/internship-form.html`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/assets/practice/internship-form.html).
3. Start errand: *"Fill this form using my profile"*.
4. Verify the agent proposes mapping the correct stored fields to form inputs for approval.

---

### Slice 4.2: One-Click Reusable Skills Engine

#### Scope & Files: Slice 4.2

- Create [`src/sidepanel/components/skills-view.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/sidepanel/components/skills-view.js).
- Pre-install 4 built-in skills:
  1. **Exam Revision Notes**: Formats definitions, core theories, and sample quiz Q&As.
  2. **Explain in Hinglish**: Translates concepts into colloquial Hindi-English.
  3. **Polite Email Reply**: Drafts professional reply to selected message.
  4. **Autofill Form from Profile**: Maps profile keys to active form inputs.
- Skill Management:
  - **Create Custom Skill**: Title, description, prompt template.
  - **Export Skills**: Downloads `sahayak-skills.json`.
  - **Import Skills**: Reads and merges local JSON file into `chrome.storage.local`.

#### Verification Steps: Slice 4.2

1. Click the **Exam Revision Notes** skill card on an educational article.
2. Verify the side panel immediately runs the prompt template on the extracted page content.
3. Create a custom skill; export it to JSON; delete it; re-import it; verify it restores accurately.

---

### Slice 4.3: Deterministic Safety Rails & Guardrail Engine

#### Scope & Files: Slice 4.3

- Create [`src/background/safety-guardrails.js`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/src/background/safety-guardrails.js).
- Guardrail 1 — Restricted Domain Blacklist:
  - Regex test on `window.location.hostname`:
    - `/(bank|netbanking|hdfc|icici|sbi|chase|paypal|razorpay|stripe|paytm|billdesk)/i`
  - If match: agent loop refuses to start, showing security warning banner.
- Guardrail 2 — Protected Field Quarantine:
  - Exclude elements with `type="password"`, `autocomplete="current-password"`, `autocomplete="one-time-code"`.
  - Ignore input names or IDs matching `/(otp|cvv|cardnumber|pin|ssn|passcode)/i`.
- Guardrail 3 — Consequential Action Modal:
  - Detect buttons with text: `Submit`, `Pay Now`, `Order`, `Delete`, `Transfer`.
  - Displays a high-visibility red confirmation dialog requiring explicit secondary confirmation.
- Guardrail 4 — Immediate Kill Switch:
  - `Esc` key or sticky **Emergency Stop** button clears running task instantly.

#### Verification Steps: Slice 4.3

1. Navigate to a test login page with password/OTP inputs.
2. Verify password and OTP inputs are never tagged with badges and never targeted by the agent.
3. Test a mock banking domain; verify the agent displays a red security block.
4. Attempt to click a "Submit" button; verify secondary confirmation modal appears before execution.

---

### Slice 4.4: Public Distribution, Release Packaging & Landing Page

#### Scope & Files: Slice 4.4

- Verify repository sanitation:
  - Ensure `.gitignore` excludes API keys, environment files, and build artifacts.
  - Audit that no hardcoded credentials exist in source code.
- Prepare Documentation:
  - Write comprehensive [`README.md`](file:///c:/Users/kastu/Desktop/Own%20AI%20Browser/README.md) with architecture overview, feature list, GIF/screenshots, and step-by-step installation instructions.
- Create Release ZIP:
  - Package clean directory containing `manifest.json`, `src/`, `assets/`, `README.md`.
  - Test unpacking from fresh ZIP archive via Chrome **Load unpacked**.
- Landing Page:
  - Create static single-page landing site in `docs/index.html` suitable for GitHub Pages.

#### Verification Steps: Slice 4.4

1. Run repository secret scanner; ensure zero keys committed.
2. Extract distribution ZIP into a clean temporary directory.
3. Load unpacked in a clean Chrome profile; verify full end-to-end functionality across all 4 weeks of features.

---

### Phase 4 Acceptance Criteria

- [ ] Local user profile safely persists and pre-populates form errands.
- [ ] Built-in and custom skills run in one click and export/import cleanly.
- [ ] Financial domains, password fields, and OTP inputs are deterministically blocked.
- [ ] Consequential buttons enforce secondary user confirmation.
- [ ] Distribution ZIP installs cleanly on any desktop Chrome browser.
- [ ] Complete setup guide, landing page, and documentation ready for GitHub release.

---

## 6. End-to-End Verification Matrix

Before publishing the project, execute this end-to-end verification checklist:

| Verification Target | Expected Behavior | Pass / Fail |
| --- | --- | --- |
| **Clean Installation** | Unpacks without manifest or permission warnings in Chrome | [ ] |
| **API Credential Security** | Stored in `chrome.storage.local`; omitted from source/repo | [ ] |
| **Article Summarization** | Outputs TL;DR, 5 points, next steps from Readability.js | [ ] |
| **YouTube Navigation** | Generates chapter breakdown with functional timestamp seeking | [ ] |
| **Bilingual Toggle** | Seamlessly alternates between English and colloquial Hinglish | [ ] |
| **Grounded Page Chat** | Answers strictly from page context; declines ungrounded queries | [ ] |
| **Context Menu Actions** | Right-click triggers Explain, Translate, and Draft Reply | [ ] |
| **Multimodal Vision** | Captures tab and correctly analyzes visual diagrams/charts | [ ] |
| **Rate-Limit Resilience** | Retries with backoff and fails over to Groq free tier on 429 | [ ] |
| **DOM Scanner & Badges** | Assigns stable numbers in closed Shadow DOM overlay | [ ] |
| **Find It For Me** | Natural language query scrolls to and highlights target element | [ ] |
| **Human-in-the-Loop Loop** | No DOM action occurs without user clicking "Approve" | [ ] |
| **Safety Guardrails** | Blocks banking domains, password fields, and OTP inputs | [ ] |
| **Consequential Action Gate** | Requires secondary confirmation for Submit/Pay buttons | [ ] |
| **Profile Autofill** | Reuses local profile data to complete practice application | [ ] |
| **Skills Management** | Built-in skills run in 1 click; custom skills export/import | [ ] |
