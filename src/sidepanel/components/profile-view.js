/**
 * Sahayak Extension - User Profile View Component (Phase 4, Slice 4.1)
 * Local User Profile Memory & Smart Autofill:
 * - Persistent local storage in chrome.storage.local (sahayak_user_profile)
 * - Complete Schema: Full Name, Email, Phone, College/Org, Graduation Year, Skills, Portfolio URL, LinkedIn URL, GitHub URL, Preferred Tone, Statement/Bio
 * - One-click Demo data loader for effortless testing
 * - Export and Import profile JSON utilities
 * - Instant Practice Form autofill errand launcher
 */

import { STORAGE_KEYS, DEFAULT_USER_PROFILE } from '../../shared/constants.js';

export class ProfileView {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container - The #view-profile container element
   * @param {function} [options.onNavigateToAgent] - Callback to switch to Agent tab
   * @param {function} [options.onNavigateToSettings] - Callback to switch to Settings tab
   * @param {function} [options.onProfileUpdated] - Callback fired when profile updates
   */
  constructor({ container, onNavigateToAgent, onNavigateToSettings, onProfileUpdated }) {
    this.container = container;
    this.onNavigateToAgent = onNavigateToAgent;
    this.onNavigateToSettings = onNavigateToSettings;
    this.onProfileUpdated = onProfileUpdated;

    this.state = {
      profile: { ...DEFAULT_USER_PROFILE },
      isSaving: false
    };

    this.initDOM();
    this.bindEvents();
    this.loadProfile();
  }

  /**
   * Mounts the Profile View HTML structure
   */
  initDOM() {
    this.container.innerHTML = `
      <div class="profile-container">
        <!-- Top Title Header -->
        <div class="section-title-wrap">
          <div class="profile-title-row">
            <h2 class="section-title">User Profile Memory</h2>
            <span class="privacy-pill" title="Stored strictly in chrome.storage.local on your device">
              <span class="privacy-shield">🛡️</span> Local &amp; Private
            </span>
          </div>
          <p class="section-subtitle">
            Configure your personal profile details once. Sahayak safely uses this stored local memory to pre-populate job applications, internships, and form errands upon your explicit approval.
          </p>
        </div>

        <!-- Alert Banner -->
        <div id="profile-alert" class="alert-banner hidden">
          <span class="alert-icon"></span>
          <span class="alert-text"></span>
        </div>

        <!-- Profile Summary Header Card -->
        <div class="profile-summary-card">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar" id="profile-avatar">KM</div>
          </div>
          <div class="profile-header-meta">
            <div class="profile-name-row">
              <h3 class="profile-display-name" id="profile-display-name">Guest Profile</h3>
              <span class="profile-status-tag" id="profile-status-tag">Incomplete</span>
            </div>
            <p class="profile-display-sub" id="profile-display-sub">No university or organization configured</p>
            <div class="profile-progress-wrap">
              <div class="profile-progress-bar-bg">
                <div class="profile-progress-bar-fill" id="profile-progress-bar" style="width: 0%;"></div>
              </div>
              <span class="profile-progress-text" id="profile-progress-text">0 of 9 fields completed (0%)</span>
            </div>
          </div>
        </div>

        <!-- Action Quick-Bar -->
        <div class="profile-quick-actions">
          <button type="button" id="btn-quick-fill-demo" class="btn btn-secondary btn-sm" title="Pre-populate with sample student data for instant testing">
            <span>⚡ Demo Data</span>
          </button>
          <button type="button" id="btn-autofill-practice" class="btn btn-primary btn-sm" title="Open practice internship form and trigger agent autofill">
            <span>🚀 Practice Autofill</span>
          </button>
          <button type="button" id="btn-export-profile" class="btn btn-ghost btn-sm" title="Export profile as JSON">
            <span>📥 Export</span>
          </button>
          <button type="button" id="btn-import-profile-trigger" class="btn btn-ghost btn-sm" title="Import profile from JSON file">
            <span>📤 Import</span>
          </button>
          <input type="file" id="profile-file-input" class="hidden" accept=".json,application/json">
        </div>

        <!-- Profile Form Card -->
        <form id="profile-form" class="profile-form-wrap" novalidate>
          <!-- Section 1: Basic Identity -->
          <div class="card profile-form-card">
            <div class="card-header">
              <div class="card-title-group">
                <span class="card-icon">👤</span>
                <div>
                  <h3 class="card-title">Personal Details</h3>
                  <p class="card-desc">Core candidate identity information.</p>
                </div>
              </div>
            </div>

            <div class="card-body">
              <div class="input-group">
                <label for="prof-fullName" class="input-label">Full Name <span class="req">*</span></label>
                <input
                  type="text"
                  id="prof-fullName"
                  name="fullName"
                  class="text-input"
                  placeholder="e.g. Kasturi Mahesh"
                  required
                >
                <div class="field-hint">Used for name fields on forms and application greetings.</div>
              </div>

              <div class="input-grid-2">
                <div class="input-group">
                  <label for="prof-email" class="input-label">Email Address <span class="req">*</span></label>
                  <input
                    type="email"
                    id="prof-email"
                    name="email"
                    class="text-input"
                    placeholder="name@example.com"
                    required
                  >
                </div>

                <div class="input-group">
                  <label for="prof-phone" class="input-label">Contact Number / Phone</label>
                  <input
                    type="tel"
                    id="prof-phone"
                    name="phone"
                    class="text-input"
                    placeholder="+91 98765 43210"
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- Section 2: Academic & Skills -->
          <div class="card profile-form-card">
            <div class="card-header">
              <div class="card-title-group">
                <span class="card-icon">🎓</span>
                <div>
                  <h3 class="card-title">Academic &amp; Professional Background</h3>
                  <p class="card-desc">Educational affiliation and technical strengths.</p>
                </div>
              </div>
            </div>

            <div class="card-body">
              <div class="input-grid-2">
                <div class="input-group">
                  <label for="prof-college" class="input-label">College / Organization <span class="req">*</span></label>
                  <input
                    type="text"
                    id="prof-college"
                    name="collegeOrCompany"
                    class="text-input"
                    placeholder="e.g. IIT Bombay"
                    required
                  >
                </div>

                <div class="input-group">
                  <label for="prof-gradYear" class="input-label">Graduation Year</label>
                  <select id="prof-gradYear" name="graduationYear" class="select-input">
                    <option value="">Select graduation year...</option>
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                    <option value="2028">2028</option>
                    <option value="2029">2029</option>
                    <option value="2030">2030</option>
                  </select>
                </div>
              </div>

              <div class="input-group">
                <label for="prof-skills" class="input-label">Technical Skills (Comma separated)</label>
                <input
                  type="text"
                  id="prof-skills"
                  name="skills"
                  class="text-input"
                  placeholder="JavaScript, Python, React, Chrome Extensions, AI Agents"
                >
                <div class="field-hint">Helps the agent check corresponding skill checkboxes automatically.</div>
              </div>
            </div>
          </div>

          <!-- Section 3: Portfolio & Web Presence -->
          <div class="card profile-form-card">
            <div class="card-header">
              <div class="card-title-group">
                <span class="card-icon">🌐</span>
                <div>
                  <h3 class="card-title">Portfolio &amp; Social Links</h3>
                  <p class="card-desc">Public profiles and portfolio projects.</p>
                </div>
              </div>
            </div>

            <div class="card-body">
              <div class="input-group">
                <label for="prof-github" class="input-label">GitHub Profile URL</label>
                <input
                  type="url"
                  id="prof-github"
                  name="githubUrl"
                  class="text-input"
                  placeholder="https://github.com/username"
                >
              </div>

              <div class="input-group">
                <label for="prof-linkedin" class="input-label">LinkedIn Profile URL</label>
                <input
                  type="url"
                  id="prof-linkedin"
                  name="linkedinUrl"
                  class="text-input"
                  placeholder="https://linkedin.com/in/username"
                >
              </div>

              <div class="input-group">
                <label for="prof-portfolio" class="input-label">Portfolio Website URL</label>
                <input
                  type="url"
                  id="prof-portfolio"
                  name="portfolioUrl"
                  class="text-input"
                  placeholder="https://yourportfolio.dev"
                >
              </div>
            </div>
          </div>

          <!-- Section 4: Workflow Preferences & Statement -->
          <div class="card profile-form-card">
            <div class="card-header">
              <div class="card-title-group">
                <span class="card-icon">📝</span>
                <div>
                  <h3 class="card-title">Preferences &amp; Statement</h3>
                  <p class="card-desc">Default tone and background statement for forms and reply drafts.</p>
                </div>
              </div>
            </div>

            <div class="card-body">
              <div class="input-group">
                <label for="prof-preferredTone" class="input-label">Preferred Response Tone</label>
                <select id="prof-preferredTone" name="preferredTone" class="select-input">
                  <option value="formal">Formal &amp; Professional (Recommended)</option>
                  <option value="casual">Casual &amp; Friendly</option>
                  <option value="concise">Direct &amp; Ultra-Concise</option>
                </select>
              </div>

              <div class="input-group">
                <label for="prof-notes" class="input-label">Statement of Purpose / Bio</label>
                <textarea
                  id="prof-notes"
                  name="notes"
                  class="textarea-input"
                  rows="3"
                  placeholder="Brief summary of your background, career focus, or why you build software..."
                ></textarea>
                <div class="field-hint">Automatically filled into statement of purpose / cover letter fields.</div>
              </div>
            </div>
          </div>

          <!-- Form Action Controls -->
          <div class="button-row profile-button-row">
            <button type="submit" id="btn-save-profile" class="btn btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              <span>Save Profile</span>
            </button>

            <button type="button" id="btn-clear-profile" class="btn btn-ghost" title="Clear all profile fields">
              <span>Clear</span>
            </button>
          </div>
        </form>
      </div>
    `;

    // Cache DOM references
    this.dom = {
      form: this.container.querySelector('#profile-form'),
      alertBanner: this.container.querySelector('#profile-alert'),
      avatar: this.container.querySelector('#profile-avatar'),
      displayName: this.container.querySelector('#profile-display-name'),
      displaySub: this.container.querySelector('#profile-display-sub'),
      statusTag: this.container.querySelector('#profile-status-tag'),
      progressBar: this.container.querySelector('#profile-progress-bar'),
      progressText: this.container.querySelector('#profile-progress-text'),
      btnSave: this.container.querySelector('#btn-save-profile'),
      btnClear: this.container.querySelector('#btn-clear-profile'),
      btnDemo: this.container.querySelector('#btn-quick-fill-demo'),
      btnPractice: this.container.querySelector('#btn-autofill-practice'),
      btnExport: this.container.querySelector('#btn-export-profile'),
      btnImportTrigger: this.container.querySelector('#btn-import-profile-trigger'),
      fileInput: this.container.querySelector('#profile-file-input'),

      // Inputs
      fullNameInput: this.container.querySelector('#prof-fullName'),
      emailInput: this.container.querySelector('#prof-email'),
      phoneInput: this.container.querySelector('#prof-phone'),
      collegeInput: this.container.querySelector('#prof-college'),
      gradYearSelect: this.container.querySelector('#prof-gradYear'),
      skillsInput: this.container.querySelector('#prof-skills'),
      githubInput: this.container.querySelector('#prof-github'),
      linkedinInput: this.container.querySelector('#prof-linkedin'),
      portfolioInput: this.container.querySelector('#prof-portfolio'),
      toneSelect: this.container.querySelector('#prof-preferredTone'),
      notesTextarea: this.container.querySelector('#prof-notes')
    };
  }

  /**
   * Binds UI events
   */
  bindEvents() {
    if (this.dom.form) {
      this.dom.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveProfile();
      });
    }

    if (this.dom.btnClear) {
      this.dom.btnClear.addEventListener('click', () => this.clearProfile());
    }

    if (this.dom.btnDemo) {
      this.dom.btnDemo.addEventListener('click', () => this.fillDemoData());
    }

    if (this.dom.btnPractice) {
      this.dom.btnPractice.addEventListener('click', () => this.launchPracticeForm());
    }

    if (this.dom.btnExport) {
      this.dom.btnExport.addEventListener('click', () => this.exportProfile());
    }

    if (this.dom.btnImportTrigger && this.dom.fileInput) {
      this.dom.btnImportTrigger.addEventListener('click', () => this.dom.fileInput.click());
      this.dom.fileInput.addEventListener('change', (e) => this.handleFileImport(e));
    }

    // Dynamic progress bar update on input typing
    const allInputs = [
      this.dom.fullNameInput,
      this.dom.emailInput,
      this.dom.phoneInput,
      this.dom.collegeInput,
      this.dom.gradYearSelect,
      this.dom.skillsInput,
      this.dom.githubInput,
      this.dom.linkedinInput,
      this.dom.portfolioInput
    ];

    allInputs.forEach(input => {
      if (input) {
        input.addEventListener('input', () => this.updateHeaderUI());
      }
    });
  }

  /**
   * Loads saved profile from chrome.storage.local
   */
  async loadProfile() {
    try {
      let data = {};
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        data = await chrome.storage.local.get([STORAGE_KEYS.USER_PROFILE]);
      }

      const saved = data[STORAGE_KEYS.USER_PROFILE];
      if (saved && typeof saved === 'object') {
        this.state.profile = { ...DEFAULT_USER_PROFILE, ...saved };
      } else {
        this.state.profile = { ...DEFAULT_USER_PROFILE };
      }

      this.populateFormFields();
      this.updateHeaderUI();
      if (typeof this.onProfileUpdated === 'function') {
        this.onProfileUpdated(this.state.profile);
      }
      console.log('[ProfileView] Profile loaded successfully from local storage.');
    } catch (err) {
      console.error('[ProfileView] Failed to load profile:', err);
      this.showAlert(`Failed to load profile: ${err.message}`, 'error');
    }
  }

  /**
   * Populates form inputs from current state profile
   */
  populateFormFields() {
    const p = this.state.profile;
    if (this.dom.fullNameInput) this.dom.fullNameInput.value = p.fullName || '';
    if (this.dom.emailInput) this.dom.emailInput.value = p.email || '';
    if (this.dom.phoneInput) this.dom.phoneInput.value = p.phone || '';
    if (this.dom.collegeInput) this.dom.collegeInput.value = p.collegeOrCompany || '';
    if (this.dom.gradYearSelect) this.dom.gradYearSelect.value = p.graduationYear || '';
    if (this.dom.skillsInput) {
      this.dom.skillsInput.value = Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills || '');
    }
    if (this.dom.githubInput) this.dom.githubInput.value = p.githubUrl || '';
    if (this.dom.linkedinInput) this.dom.linkedinInput.value = p.linkedinUrl || '';
    if (this.dom.portfolioInput) this.dom.portfolioInput.value = p.portfolioUrl || '';
    if (this.dom.toneSelect) this.dom.toneSelect.value = p.preferredTone || 'formal';
    if (this.dom.notesTextarea) this.dom.notesTextarea.value = p.notes || '';
  }

  /**
   * Reads values from inputs and persists to chrome.storage.local
   */
  async saveProfile() {
    const fullName = (this.dom.fullNameInput?.value || '').trim();
    const email = (this.dom.emailInput?.value || '').trim();
    const phone = (this.dom.phoneInput?.value || '').trim();
    const collegeOrCompany = (this.dom.collegeInput?.value || '').trim();
    const graduationYear = (this.dom.gradYearSelect?.value || '').trim();
    const skills = (this.dom.skillsInput?.value || '').trim();
    const githubUrl = (this.dom.githubInput?.value || '').trim();
    const linkedinUrl = (this.dom.linkedinInput?.value || '').trim();
    const portfolioUrl = (this.dom.portfolioInput?.value || '').trim();
    const preferredTone = (this.dom.toneSelect?.value || 'formal').trim();
    const notes = (this.dom.notesTextarea?.value || '').trim();

    // Validation
    if (!fullName) {
      this.showAlert('Please enter your full name.', 'warning');
      this.dom.fullNameInput?.focus();
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.showAlert('Please enter a valid email address.', 'warning');
      this.dom.emailInput?.focus();
      return;
    }

    const profileData = {
      fullName,
      email,
      phone,
      collegeOrCompany,
      graduationYear,
      skills,
      githubUrl,
      linkedinUrl,
      portfolioUrl,
      preferredTone,
      notes,
      lastUpdated: Date.now()
    };

    try {
      this.dom.btnSave?.classList.add('loading');

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.USER_PROFILE]: profileData
        });
      }

      this.state.profile = profileData;
      this.updateHeaderUI();
      this.showAlert('Profile memory saved locally to chrome.storage.local!', 'success');

      if (typeof this.onProfileUpdated === 'function') {
        this.onProfileUpdated(profileData);
      }
    } catch (err) {
      console.error('[ProfileView] Error saving profile:', err);
      this.showAlert(`Failed to save profile: ${err.message}`, 'error');
    } finally {
      this.dom.btnSave?.classList.remove('loading');
    }
  }

  /**
   * Computes profile completion score and updates visual avatar badge & progress bar
   */
  updateHeaderUI() {
    const fullName = (this.dom.fullNameInput?.value || '').trim();
    const college = (this.dom.collegeInput?.value || '').trim();
    const email = (this.dom.emailInput?.value || '').trim();

    // Initials avatar
    let initials = '👤';
    if (fullName) {
      const parts = fullName.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        initials = (parts[0][0] + parts[1][0]).toUpperCase();
      } else if (parts.length === 1) {
        initials = parts[0].substring(0, 2).toUpperCase();
      }
    }
    if (this.dom.avatar) {
      this.dom.avatar.textContent = initials;
    }

    // Display names
    if (this.dom.displayName) {
      this.dom.displayName.textContent = fullName || 'Guest Profile';
    }
    if (this.dom.displaySub) {
      const subParts = [];
      if (college) subParts.push(college);
      if (email) subParts.push(email);
      this.dom.displaySub.textContent = subParts.length > 0 ? subParts.join(' • ') : 'No university or organization configured';
    }

    // Calculate score out of 9 core fields
    const fieldsToCheck = [
      fullName,
      email,
      (this.dom.phoneInput?.value || '').trim(),
      college,
      (this.dom.gradYearSelect?.value || '').trim(),
      (this.dom.skillsInput?.value || '').trim(),
      (this.dom.githubInput?.value || '').trim(),
      (this.dom.linkedinInput?.value || '').trim(),
      (this.dom.portfolioInput?.value || '').trim()
    ];

    const filledCount = fieldsToCheck.filter(Boolean).length;
    const percentage = Math.round((filledCount / fieldsToCheck.length) * 100);

    if (this.dom.progressBar) {
      this.dom.progressBar.style.width = `${percentage}%`;
    }

    if (this.dom.progressText) {
      this.dom.progressText.textContent = `${filledCount} of ${fieldsToCheck.length} fields completed (${percentage}%)`;
    }

    if (this.dom.statusTag) {
      if (percentage >= 80) {
        this.dom.statusTag.textContent = 'Complete';
        this.dom.statusTag.className = 'profile-status-tag status-good';
      } else if (percentage >= 40) {
        this.dom.statusTag.textContent = 'In Progress';
        this.dom.statusTag.className = 'profile-status-tag status-amber';
      } else {
        this.dom.statusTag.textContent = 'Incomplete';
        this.dom.statusTag.className = 'profile-status-tag status-incomplete';
      }
    }
  }

  /**
   * Pre-populates form inputs with standard realistic student profile data for testing (Slice 4.1)
   */
  fillDemoData() {
    const demoProfile = {
      fullName: 'Kasturi Mahesh',
      email: 'kasturi.mahesh@example.com',
      phone: '+91 98765 43210',
      collegeOrCompany: 'IIT Bombay',
      graduationYear: '2026',
      skills: 'JavaScript, Python, React, Chrome Extensions, AI Agents',
      githubUrl: 'https://github.com/kasturi-mahesh',
      linkedinUrl: 'https://linkedin.com/in/kasturi-mahesh',
      portfolioUrl: 'https://kasturi.dev',
      preferredTone: 'formal',
      notes: 'Passionate about human-in-the-loop agentic architectures, Chrome extensions, and browser automation safety.'
    };

    this.state.profile = demoProfile;
    this.populateFormFields();
    this.updateHeaderUI();
    this.showAlert('Demo profile loaded! Click "Save Profile" to commit.', 'info');
  }

  /**
   * Clears all profile inputs
   */
  async clearProfile() {
    this.state.profile = { ...DEFAULT_USER_PROFILE };
    this.populateFormFields();
    this.updateHeaderUI();

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove([STORAGE_KEYS.USER_PROFILE]);
      }
      this.showAlert('Profile memory cleared from local storage.', 'info');
      if (typeof this.onProfileUpdated === 'function') {
        this.onProfileUpdated(null);
      }
    } catch (err) {
      console.warn('[ProfileView] Clear profile error:', err);
    }
  }

  /**
   * Exports profile to downloadable JSON file
   */
  exportProfile() {
    const profile = { ...this.state.profile, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sahayak-user-profile-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showAlert('Profile exported successfully!', 'success');
  }

  /**
   * Handles importing a profile JSON file
   * @param {Event} event
   */
  handleFileImport(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (typeof parsed !== 'object' || !parsed) {
          throw new Error('Invalid JSON structure.');
        }

        this.state.profile = { ...DEFAULT_USER_PROFILE, ...parsed };
        this.populateFormFields();
        this.updateHeaderUI();
        await this.saveProfile();
        this.showAlert('Profile imported and saved successfully!', 'success');
      } catch (err) {
        console.error('[ProfileView] File import failed:', err);
        this.showAlert(`Failed to import profile: ${err.message}`, 'error');
      } finally {
        if (this.dom.fileInput) this.dom.fileInput.value = '';
      }
    };
    reader.readAsText(file);
  }

  /**
   * One-click launcher: opens practice form and initiates agent autofill
   */
  async launchPracticeForm() {
    try {
      // 1. Ensure current profile is saved
      await this.saveProfile();

      // 2. Open practice form tab
      const practiceUrl = chrome.runtime.getURL('assets/practice/internship-form.html');
      const tab = await chrome.tabs.create({ url: practiceUrl });

      // 3. Switch to Agent tab view
      if (typeof this.onNavigateToAgent === 'function') {
        this.onNavigateToAgent();
      }

      this.showAlert('Opening practice testbed... Switch to Agent tab to start errand!', 'info');
    } catch (err) {
      console.error('[ProfileView] Launch practice form failed:', err);
    }
  }

  /**
   * Called when Profile tab is switched to
   */
  async onTabActivated() {
    await this.loadProfile();
  }

  /**
   * Shows an inline alert banner
   * @param {string} message
   * @param {'success' | 'error' | 'warning' | 'info'} type
   */
  showAlert(message, type = 'info') {
    if (!this.dom.alertBanner) return;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    this.dom.alertBanner.className = `alert-banner alert-${type}`;
    const iconEl = this.dom.alertBanner.querySelector('.alert-icon');
    const textEl = this.dom.alertBanner.querySelector('.alert-text');

    if (iconEl) iconEl.textContent = icons[type] || 'ℹ';
    if (textEl) textEl.textContent = message;

    this.dom.alertBanner.classList.remove('hidden');

    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this._alertTimeout = setTimeout(() => {
      this.dom.alertBanner.classList.add('hidden');
    }, 5000);
  }
}
