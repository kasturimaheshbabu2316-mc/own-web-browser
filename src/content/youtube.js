/**
 * Sahayak Extension - YouTube Content & Player Controller Script
 * Injected into YouTube tabs to extract video metadata, transcripts, chapters,
 * handle live stream/ad edge cases, and execute video playback seeking.
 */

(function () {
  'use strict';

  // Prevent duplicate execution
  if (window.__SAHAYAK_YOUTUBE_LOADED__) {
    return;
  }
  window.__SAHAYAK_YOUTUBE_LOADED__ = true;

  console.log('[Sahayak YouTube] Content script loaded on:', window.location.href);

  /**
   * Checks if current URL is a YouTube video watch page or shorts
   */
  function isYouTubeWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/shorts/');
  }

  /**
   * Extracts clean video ID from URL
   */
  function getVideoId() {
    try {
      const url = new URL(window.location.href);
      if (url.pathname === '/watch') {
        return url.searchParams.get('v') || '';
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/shorts/')[1].split('/')[0] || '';
      }
    } catch {
      // Fallback regex
    }
    const match = window.location.href.match(/[?&]v=([^&#]+)/) || window.location.href.match(/\/shorts\/([^/?&#]+)/);
    return match ? match[1] : '';
  }

  /**
   * Edge Case 1.3: Detects if the current video is an active live stream
   */
  function isLiveStream() {
    const liveBadges = document.querySelectorAll('.ytp-live, .ytp-live-badge, ytd-watch-metadata[is-live]');
    for (const el of liveBadges) {
      if (el.getAttribute('disabled') === 'false' || el.offsetParent !== null) {
        return true;
      }
    }
    const liveTextEl = document.querySelector('.ytp-live-badge');
    if (liveTextEl && liveTextEl.textContent.trim().length > 0 && !liveTextEl.classList.contains('ytp-live-badge-disabled')) {
      return true;
    }
    return false;
  }

  /**
   * Edge Case 1.4: Detects if a pre-roll or mid-roll advertisement is currently playing
   */
  function isAdPlaying() {
    return Boolean(
      document.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay, .ytp-ad-module')
    );
  }

  /**
   * Formats seconds into MM:SS or HH:MM:SS
   */
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  /**
   * Converts MM:SS or HH:MM:SS string to total seconds
   */
  function parseTimeToSeconds(timeStr = '') {
    if (!timeStr) return 0;
    const parts = timeStr.trim().replace(/^\[|\]$/g, '').split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  /**
   * Extracts video title, channel, duration, and description
   */
  function getVideoMetadata() {
    const videoId = getVideoId();
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1, h1.title');
    const rawTitle = titleEl ? titleEl.textContent.trim() : document.title.replace(' - YouTube', '').trim();

    const channelEl = document.querySelector('#channel-name a, #owner #channel-name a, ytd-channel-name a');
    const channelName = channelEl ? channelEl.textContent.trim() : '';

    const videoEl = document.querySelector('video') || document.querySelector('.html5-main-video');
    const durationSeconds = videoEl && !isNaN(videoEl.duration) && videoEl.duration > 0
      ? Math.floor(videoEl.duration)
      : 0;

    const descEl = document.querySelector('#description-inline-expander, #description, ytd-text-inline-expander');
    const description = descEl ? descEl.innerText.trim() : '';

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: rawTitle || 'YouTube Video',
      channelName: channelName || 'YouTube Creator',
      durationSeconds,
      durationFormatted: formatTime(durationSeconds),
      description,
      isLive: isLiveStream(),
      isAd: isAdPlaying()
    };
  }

  /**
   * Extracts chapters from player markers or video description
   */
  function extractChapters(description = '') {
    const chapters = [];

    // Method 1: Query native YouTube chapter list markers
    const markerEls = document.querySelectorAll('ytd-macro-markers-list-item-renderer, ytd-chapter-renderer');
    if (markerEls && markerEls.length > 0) {
      markerEls.forEach((el) => {
        const timeEl = el.querySelector('#time, .ytd-macro-markers-list-item-renderer #time');
        const titleEl = el.querySelector('#details h4, #title');
        if (timeEl && titleEl) {
          const timeText = timeEl.textContent.trim();
          const titleText = titleEl.textContent.trim();
          if (timeText && titleText) {
            chapters.push({
              timestamp: timeText,
              seconds: parseTimeToSeconds(timeText),
              title: titleText
            });
          }
        }
      });
    }

    // Method 2: If no DOM chapter markers found, parse description for timestamps
    if (chapters.length === 0 && description) {
      const lines = description.split('\n');
      const timeRegex = /(?:^|\s)(?:\[|\()?(\d{1,2}:\d{2}(?::\d{2})?)(?:\]|\))?\s*[-–—:]?\s*(.+)/;

      for (const line of lines) {
        const match = line.match(timeRegex);
        if (match) {
          const timeText = match[1].trim();
          const chapterTitle = match[2].trim();
          if (chapterTitle.length > 1 && chapterTitle.length < 120) {
            chapters.push({
              timestamp: timeText,
              seconds: parseTimeToSeconds(timeText),
              title: chapterTitle
            });
          }
        }
      }
    }

    return chapters;
  }

  /**
   * Extracts transcript segments from YouTube transcript panel or DOM
   */
  function extractTranscriptSegments() {
    const segments = [];

    // Check if YouTube searchable transcript panel segments are rendered in DOM
    const segmentEls = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (segmentEls && segmentEls.length > 0) {
      segmentEls.forEach((el) => {
        const timeEl = el.querySelector('.segment-timestamp');
        const textEl = el.querySelector('.segment-text');
        if (timeEl && textEl) {
          const timeText = timeEl.textContent.trim();
          const text = textEl.textContent.trim();
          if (timeText && text) {
            segments.push({
              timestamp: timeText,
              seconds: parseTimeToSeconds(timeText),
              text
            });
          }
        }
      });
    }

    return segments;
  }

  /**
   * Seeks YouTube video player to specific seconds and displays visual HUD feedback
   */
  function seekVideo(targetSeconds) {
    const video = document.querySelector('video') || document.querySelector('.html5-main-video');
    if (!video) {
      console.warn('[Sahayak YouTube] Video element not found on page.');
      return { success: false, error: 'Video element not found on page.' };
    }

    const seconds = Math.max(0, parseFloat(targetSeconds) || 0);

    // Apply native HTML5 video seek
    video.currentTime = seconds;
    video.play().catch(() => {});

    // Also call YouTube movie_player API if available in DOM
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.seekTo === 'function') {
        player.seekTo(seconds, true);
      }
    } catch {}

    const formattedTime = formatTime(seconds);
    console.log(`[Sahayak YouTube] Video sought to ${seconds}s ([${formattedTime}])`);

    // Render floating on-screen feedback HUD over video
    showSeekHUD(formattedTime);

    return {
      success: true,
      currentTime: seconds,
      formattedTime
    };
  }

  /**
   * Displays temporary floating HUD on YouTube player confirming playback jump
   */
  function showSeekHUD(formattedTime) {
    let hud = document.getElementById('sahayak-seek-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'sahayak-seek-hud';
      hud.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(-10px);
        background: rgba(15, 23, 42, 0.92);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        padding: 8px 18px;
        border-radius: 9999px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.4);
        z-index: 9999999;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
        opacity: 0;
      `;
      document.body.appendChild(hud);
    }

    hud.innerHTML = `
      <span style="color: #ef4444; font-size: 16px;">▶</span>
      <span>Sahayak: Jumped to <strong>${formattedTime}</strong></span>
    `;

    // Trigger animation
    requestAnimationFrame(() => {
      hud.style.opacity = '1';
      hud.style.transform = 'translateX(-50%) translateY(0)';
    });

    clearTimeout(window.__sahayak_hud_timeout__);
    window.__sahayak_hud_timeout__ = setTimeout(() => {
      hud.style.opacity = '0';
      hud.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 1800);
  }

  /**
   * Main YouTube extraction coordinator
   */
  async function extractYouTubeData() {
    const meta = getVideoMetadata();

    // Edge Case 1.3: Check if live stream
    if (meta.isLive) {
      return {
        success: false,
        isLiveStream: true,
        error: 'Live streams cannot be summarized until the broadcast completes.',
        ...meta
      };
    }

    const chapters = extractChapters(meta.description);
    const transcriptSegments = extractTranscriptSegments();

    // Build synthesized readable content text for AI context
    let formattedContent = `YouTube Video Title: ${meta.title}\n`;
    formattedContent += `Channel / Creator: ${meta.channelName}\n`;
    formattedContent += `Duration: ${meta.durationFormatted} (${meta.durationSeconds}s)\n`;
    formattedContent += `Video URL: ${meta.url}\n\n`;

    if (chapters.length > 0) {
      formattedContent += `=== VIDEO CHAPTERS & TIMESTAMPS ===\n`;
      chapters.forEach((ch) => {
        formattedContent += `[${ch.timestamp}] ${ch.title}\n`;
      });
      formattedContent += `\n`;
    }

    if (transcriptSegments.length > 0) {
      formattedContent += `=== VIDEO TRANSCRIPT ===\n`;
      transcriptSegments.forEach((seg) => {
        formattedContent += `[${seg.timestamp}] ${seg.text}\n`;
      });
      formattedContent += `\n`;
    } else if (meta.description) {
      formattedContent += `=== VIDEO DESCRIPTION ===\n${meta.description}\n`;
    }

    const wordCount = formattedContent.split(/\s+/).filter(Boolean).length;

    return {
      success: true,
      isVideo: true,
      isYouTube: true,
      videoId: meta.videoId,
      url: meta.url,
      title: meta.title,
      channelName: meta.channelName,
      durationSeconds: meta.durationSeconds,
      durationFormatted: meta.durationFormatted,
      hasChapters: chapters.length > 0,
      chaptersCount: chapters.length,
      chapters,
      hasTranscript: transcriptSegments.length > 0,
      transcriptCount: transcriptSegments.length,
      transcriptSegments,
      textContent: formattedContent,
      wordCount,
      isLiveStream: false,
      isAdPlaying: meta.isAd
    };
  }

  // Runtime message listener for YouTube requests
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    // Handle extraction request specifically for YouTube data
    if (message.type === 'SAHAYAK_EXTRACT_YOUTUBE_DATA') {
      extractYouTubeData()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    // Handle video seeking to timestamp
    if (message.type === 'SAHAYAK_SEEK_YOUTUBE_VIDEO') {
      const targetSec = message.seconds !== undefined ? message.seconds : (message.payload?.seconds || 0);
      const res = seekVideo(targetSec);
      sendResponse(res);
      return false;
    }

    // If general extraction was requested on a YouTube page, provide YouTube data
    if (message.type === 'SAHAYAK_EXTRACT_CONTENT' || message.type === 'EXTRACT_READABLE_CONTENT') {
      if (isYouTubeWatchPage()) {
        extractYouTubeData()
          .then(result => sendResponse(result))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
      }
    }

    return false;
  });

})();
