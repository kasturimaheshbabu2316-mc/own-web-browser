# Sahayak (सहायक) — Safe, Human-in-the-Loop AI Browser Assistant

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Model](https://img.shields.io/badge/AI%20Model-Gemini%20Flash--Lite-orange.svg)](https://ai.google.dev/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local--First-green.svg)](#privacy-and-security-guarantee)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Sahayak (सहायक)** is an intelligent, privacy-first Chrome Side-Panel AI assistant designed to read, understand, and interact with the web alongside you. Powered by Google Gemini Flash-Lite and Mozilla Readability, it transforms complex web pages into structured insights, supports natural English & Hinglish communication, and follows a strict **Human-in-the-Loop (HITL)** architecture.

---

## 🌟 Core Philosophy: The Three Pillars

```text
       ┌─────────────────────────────────────────────────────────────┐
       │                 SAHAYAK ARCHITECTURE PILLARS               │
       └─────────────────────────────────────────────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
  👁️  THE EYES                🧠  THE BRAIN                 🤝  THE HANDS
  Content Extraction          Grounded Reasoning           Approved Action
  • Cloned DOM Readability    • Zero Hallucination         • Interactive Element Map
  • Ads & Noise Stripping     • Multimodal Vision          • Visual Action Badges
  • Paywall / SPA Defenses    • Bilingual (EN / Hinglish)  • Human Approval Required
```

1. **The Eyes (Read & Extract)**: Clones the active tab's DOM to extract noise-free article text without mutating the page or leaking state.
2. **The Brain (Understand & Ground)**: Operates strictly within XML-delimited untrusted web boundaries, preventing prompt injections and hallucinations while streaming responses via low-latency Server-Sent Events (SSE).
3. **The Hands (Act with Approval)**: Scans interactive elements, renders non-invasive numbered badges, and proposes single deterministic actions requiring explicit user confirmation before executing.

---

## 🚀 Key Features

### 📌 Structured 3-Part Summarization

Extracts any article, blog, documentation, or news story into three distinct, actionable cards:

* **📌 TL;DR**: 1–2 crisp, impactful sentences capturing the core thesis.
* **💡 Key Insights**: Exactly 5 distilled takeaways and data points.
* **🚀 Next Steps & Actionable Takeaways**: 2–3 practical recommendations for the reader.

### 🎥 YouTube Public Video Summarizer & Clickable Timestamps (Slice 1.4)

Automatically detects YouTube videos (`youtube.com/watch?v=*` and `/shorts/*`), extracts video metadata, description, chapters, and captions:

* **⏱️ Video Chapters & Timestamps**: Chronological chapter breakdown where each timestamp like `[02:15]` is an interactive, clickable button.
* **Direct Player Navigation**: Clicking any timestamp immediately dispatches an IPC seek command to the active YouTube tab (`video.currentTime = seconds`), jumping playback with an animated on-screen HUD.
* **Edge-Case Resilience**: Deterministically flags active live streams and bypasses pre-roll/mid-roll advertisements to ensure transcript accuracy.

### 🌐 Bilingual Dialect Toggle: English & Hinglish (Slice 1.5)

Switch instantly using the top header segment control (`EN` / `Hinglish`):

* **Standard English**: Crisp, authoritative summaries with industry-standard terminology.
* **Conversational Hinglish**: Natural, colloquial Hindi-English mixing written in the Latin alphabet while retaining all technical and domain terms (e.g., *"Yeh video explain karta hai ki microservices architecture kaise scale hoti hai..."*).
* **Storage Synchronization**: Preferences persist locally via `chrome.storage.local` across sessions and sync bidirectionally with Settings.

### 💬 Grounded Page Chat Engine (Slice 2.1)

Conversational chat in the Side Panel strictly grounded in the active browser tab's content:

* **Strict Negative Constraint**: When a user queries information absent from the page (e.g., general trivia, outside facts), the assistant strictly refuses: *"I cannot find this information in the current page."*
* **Multi-Turn Session Memory**: In-memory message history tracks questions and follow-ups within the active reading session.
* **Bilingual Support**: Answers fluently in standard English or natural conversational Hinglish matching the active language toggle.
* **Context Synchronization Bar**: Displays live word count and page metadata with a one-click **Sync** button to re-read updated page DOM.
* **Suggestion Chips & Copy Actions**: One-click prompt chips for quick page exploration and direct copy buttons for AI replies.

### 🖱️ Right-Click Context Menu AI Actions (Slice 2.2)

Highlight any text on any webpage and right-click to invoke instant AI actions:

* **⚡ Sahayak: Explain this**: Breaks down complicated paragraphs, defines obscure jargon, and clarifies meaning and context.
* **🌐 Sahayak: Translate to Hindi / Hinglish**: Converts English text into natural, conversational Hinglish (Hindi written in Latin alphabet, retaining technical terminology).
* **✍️ Sahayak: Draft a reply**: Generates two context-aware response options for messages, emails, or posts: (1) Quick & Crisp (1-2 sentences), and (2) Detailed & Professional.
* **Seamless Side Panel Activation**: Automatically opens the Side Panel via user gesture, switches to Chat, and begins streaming the response with full multi-turn conversational follow-up memory.

### ⚡ Ultra-Low Latency Streaming UI

Real-time typewriter streaming via Chrome's native streaming port (`sahayak-stream-port`) connected directly to Google's REST streaming API (`gemini-flash-lite-latest`), delivering full summaries in ~2 seconds.

### 🛡️ Production Web Edge-Case Defenses

* **Single-Page Application (SPA) Retries**: 5-step polling loop with mutation detection for hydrating Next.js, React, and Substack pages.
* **Live Stream & Ad Detection**: Bypasses YouTube ad players and warns on active live streams.
* **Paywall & Subscription Awareness**: Heuristically detects gated articles and extracts available preview content with user alerts.
* **Token Budget Safeguards**: Automatically condenses long documents (>18,000 words) using hierarchical head/section/tail chunking.
* **Anti-Prompt Injection Guardrails**: Isolates page text inside `<<<UNTRUSTED_WEB_PAGE_CONTENT>>>` and `<<<UNTRUSTED_YOUTUBE_VIDEO_CONTENT>>>` XML boundaries.

---

## 🏗️ System Architecture

```mermaid
graph TD
    User([User in Chrome]) -->|Opens Side Panel| SP[Side Panel Controller]
    SP -->|chrome.tabs.sendMessage| CS[Content Script: extractor.js]
    CS -->|document.cloneNode| DOM[Cloned DOM]
    DOM -->|Clean Overlays & Cookies| CR[Clean DOM]
    CR -->|Mozilla Readability| RD[Parsed Article Content]
    RD -->|IPC Response| SP
    SP -->|chrome.runtime.connect| SW[Service Worker: service-worker.js]
    SW -->|SSE Stream POST| GEMINI[Google Gemini Flash-Lite API]
    GEMINI -->|Tokens Stream| SW
    SW -->|postMessage chunks| SP
    SP -->|Incremental Markdown Parse| UI[Structured 3-Part Cards]
```

---

## 📦 Project Structure

```text
Own AI Browser/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── .gitignore                 # Excludes .env, local credentials, and build caches
├── assets/
│   └── icons/                 # Extension toolbar and webstore icons (16, 48, 128px)
├── doc/                       # Reference architecture & planning documents
│   ├── ProblemStatement.md    # Product requirements and technical foundation
│   ├── architecture.md        # IPC contracts, state machine, and threat model
│   ├── implementation-plan.md # 4-Phase, 16-slice progressive engineering plan
│   └── edge-case.md           # Failure modes and deterministic mitigations catalog
└── src/
    ├── background/
    │   ├── service-worker.js  # MV3 Background worker, side panel lifecycle & port router
    │   ├── context-menu.js    # Selection context menu registration & action routing
    │   └── ai-orchestrator.js # Direct REST client for Gemini with streaming & backoff
    ├── content/
    │   ├── readability.js     # Bundled Mozilla Readability + isProbablyReaderable
    │   ├── extractor.js       # Cloned DOM content extraction & paywall/SPA defenses
    │   └── youtube.js         # YouTube video perception, chapters, transcripts & seeking
    ├── shared/
    │   ├── constants.js       # Storage keys, models, IPC message types & defaults
    │   └── types.js           # Structured IPC message payload schemas
    └── sidepanel/
        ├── index.html         # Side panel UI layout (Summary, Chat, Agent, Settings)
        ├── sidepanel.css      # Dark mode design system & micro-animations
        ├── sidepanel.js       # Side panel controller & preferences manager
        ├── components/
        │   ├── summary-view.js # Article summarizer view, streaming renderer & clipboard
        │   └── chat-view.js    # Grounded page chat view, multi-turn history & suggestions
        └── lib/
            └── readability.js # Readability module for sidepanel operations
```

---

## 🛠️ Quick Start & Installation

### Prerequisites

* Google Chrome (Version 116+ for Chrome Side Panel API support).
* A free **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Step 1: Clone or Open the Repository

```bash
git clone https://github.com/kasturimaheshbabu2316-mc/own-web-browser.git
cd own-web-browser
```

### Step 2: Load Extension in Chrome

1. Open Google Chrome and navigate to:

   ```text
   chrome://extensions/
   ```

2. Enable the **"Developer mode"** toggle in the top-right corner.
3. Click the **"Load unpacked"** button in the top-left corner.
4. Select the project folder (`Own AI Browser`).

### Step 3: Configure Your API Key

1. Click the puzzle icon (🧩) in Chrome's toolbar and open **Sahayak - AI Browser Assistant**.
2. Go to the **Settings** tab.
3. Paste your free Gemini API Key and click **Save Settings** (or click **Test Connection** to verify live latency).
4. You are ready! Navigate to any article and click **"Summarize Page"**, or open the **Chat** tab to converse with the page.

---

## Privacy and Security Guarantee

* **100% Local-First Storage**: API keys and preferences are stored exclusively on your device using `chrome.storage.local`.
* **Zero Middleman Servers**: Requests go directly from your browser to Google's official Gemini endpoint. There is no telemetry, tracking, or proxy server.
* **No Secret Leaks**: `.env` and local configuration files are ignored by Git and never committed to source control.

---

## 🗺️ Roadmap & Phase Tracker

| Phase | Focus Area | Status | Deliverables |
| :--- | :--- | :---: | :--- |
| **Phase 1** | **The Eyes: Read & Extract** | 🟢 Complete | MV3 Shell, Gemini Streaming, Cloned Readability, YouTube Timestamps, Hinglish Toggle |
| **Phase 2** | **The Brain: Ground & Understand** | 🟡 In Progress | Grounded Page Chat (Done), Context Menus (Done), Screenshot-and-Ask, Groq Fallback |
| **Phase 3** | **The Hands: Approved Actions** | ⚪ Planned | Element Scanner, Numbered Badges, Proposal Cards, Human Confirmation Guard |
| **Phase 4** | **The Agent: Multi-Step Memory** | ⚪ Planned | Plan DAG Engine, Self-Correction Loop, User Profiling, Voice Input |

---

## 📚 Detailed Documentation

For in-depth technical specifications, please consult the documentation directory:

* 📄 [`doc/ProblemStatement.md`](doc/ProblemStatement.md) — Comprehensive technical challenge and solution design.
* 🏛️ [`doc/architecture.md`](doc/architecture.md) — IPC protocols, message types, state machine, and threat analysis.
* 📋 [`doc/implementation-plan.md`](doc/implementation-plan.md) — Detailed slice-by-slice roadmap.
* 🛡️ [`doc/edge-case.md`](doc/edge-case.md) — Comprehensive engineering catalog of 16+ edge cases and deterministic defenses.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
