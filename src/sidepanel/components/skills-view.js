/**
 * Sahayak Extension - Skills View Component (Phase 4, Slice 4.2)
 * One-Click Reusable Skills Engine:
 * - 4 Pre-installed built-in skills:
 *   1. Exam Revision Notes (Formats definitions, core theories, quiz Q&As)
 *   2. Explain in Hinglish (Translates concepts into colloquial Hindi-English)
 *   3. Polite Email Reply (Drafts professional reply to selected message)
 *   4. Autofill Form from Profile (Maps profile keys to active form inputs)
 * - Custom Skill Authoring: Title, Description, Prompt Template, Target Subsystem
 * - Export skills to sahayak-skills.json
 * - Import and merge skills from local JSON file
 * - One-click execution dispatching directly to ChatView or AgentView
 */

import { STORAGE_KEYS, DEFAULT_BUILTIN_SKILLS } from '../../shared/constants.js';

export class SkillsView {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container - The #view-skills container element
   * @param {function} [options.onExecuteSkill] - Callback fired to run a skill: ({ skill }) => void
   * @param {function} [options.onSkillsUpdated] - Callback fired when skills list changes: (skills) => void
   * @param {function} [options.onNavigateToChat] - Callback to switch to Chat tab
   * @param {function} [options.onNavigateToAgent] - Callback to switch to Agent tab
   * @param {function} [options.onNavigateToSettings] - Callback to switch to Settings tab
   */
  constructor({
    container,
    onExecuteSkill,
    onSkillsUpdated,
    onNavigateToChat,
    onNavigateToAgent,
    onNavigateToSettings
  }) {
    this.container = container;
    this.onExecuteSkill = onExecuteSkill;
    this.onSkillsUpdated = onSkillsUpdated;
    this.onNavigateToChat = onNavigateToChat;
    this.onNavigateToAgent = onNavigateToAgent;
    this.onNavigateToSettings = onNavigateToSettings;

    this.state = {
      skills: [...DEFAULT_BUILTIN_SKILLS],
      searchQuery: '',
      activeCategory: 'all',
      isEditorOpen: false,
      editingSkillId: null
    };

    this.initDOM();
    this.bindEvents();
    this.loadSkills();
  }

  /**
   * Builds the HTML scaffolding for the Skills View
   */
  initDOM() {
    this.container.innerHTML = `
      <div class="skills-container">
        <!-- Section Header -->
        <div class="section-title-wrap">
          <div class="skills-title-row">
            <h2 class="section-title">One-Click Skills</h2>
            <span class="skills-count-pill" id="skills-count-badge">4 Skills</span>
          </div>
          <p class="section-subtitle">
            Instant reusable AI recipes. Run built-in study and writing workflows on the active page, or create custom skills for your recurring tasks.
          </p>
        </div>

        <!-- Alert Banner -->
        <div id="skills-alert" class="alert-banner hidden">
          <span class="alert-icon"></span>
          <span class="alert-text"></span>
        </div>

        <!-- Skills Actions Toolbar -->
        <div class="skills-toolbar">
          <div class="skills-search-box">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              id="skills-search-input"
              class="skills-search-input"
              placeholder="Search skills by title, topic, or keyword..."
              aria-label="Search skills"
            >
            <button type="button" id="btn-skills-clear-search" class="btn-search-clear hidden" title="Clear search">✕</button>
          </div>

          <div class="skills-toolbar-buttons">
            <button type="button" id="btn-create-skill" class="btn btn-primary btn-sm" title="Create a new custom skill recipe">
              <span>+ New Skill</span>
            </button>
            <button type="button" id="btn-export-skills" class="btn btn-secondary btn-sm" title="Download all skills as sahayak-skills.json">
              <span>📥 Export</span>
            </button>
            <button type="button" id="btn-import-skills-trigger" class="btn btn-secondary btn-sm" title="Import skills from a JSON file">
              <span>📤 Import</span>
            </button>
            <input type="file" id="skills-file-input" class="hidden" accept=".json,application/json">
            <button type="button" id="btn-reset-skills" class="btn btn-ghost btn-sm" title="Restore default built-in skills">
              <span>🔄 Defaults</span>
            </button>
          </div>
        </div>

        <!-- Category Filter Chips -->
        <div class="skills-filter-chips" id="skills-category-chips">
          <button type="button" class="filter-chip active" data-category="all">All</button>
          <button type="button" class="filter-chip" data-category="Study">📚 Study</button>
          <button type="button" class="filter-chip" data-category="Language">🇮🇳 Language</button>
          <button type="button" class="filter-chip" data-category="Communication">✉️ Communication</button>
          <button type="button" class="filter-chip" data-category="Agent">🤖 Agent</button>
          <button type="button" class="filter-chip" data-category="Custom">⭐ Custom</button>
        </div>

        <!-- Custom Skill Editor Drawer/Card (Hidden by default) -->
        <div id="skill-editor-card" class="skill-editor-card hidden">
          <div class="editor-header">
            <h3 class="editor-title" id="editor-modal-title">Create New Skill</h3>
            <button type="button" id="btn-close-editor" class="btn-icon-close" title="Close editor">✕</button>
          </div>

          <form id="skill-editor-form" class="editor-form" novalidate>
            <div class="input-grid-2">
              <div class="input-group">
                <label for="editor-skill-title" class="input-label">Skill Title *</label>
                <input
                  type="text"
                  id="editor-skill-title"
                  class="text-input"
                  placeholder="e.g. Code Review Assistant"
                  required
                >
              </div>

              <div class="input-group">
                <label for="editor-skill-icon" class="input-label">Icon / Emoji</label>
                <select id="editor-skill-icon" class="select-input">
                  <option value="⚡">⚡ Lightning</option>
                  <option value="📚">📚 Books / Study</option>
                  <option value="🇮🇳">🇮🇳 India / Hinglish</option>
                  <option value="✉️">✉️ Email / Letter</option>
                  <option value="📝">📝 Note / Form</option>
                  <option value="💡">💡 Idea / Insight</option>
                  <option value="💻">💻 Code / Dev</option>
                  <option value="🔍">🔍 Research / Search</option>
                  <option value="🛡️">🛡️ Security / Safety</option>
                  <option value="🚀">🚀 Rocket / Action</option>
                </select>
              </div>
            </div>

            <div class="input-grid-2">
              <div class="input-group">
                <label for="editor-skill-category" class="input-label">Category</label>
                <select id="editor-skill-category" class="select-input">
                  <option value="Study">Study &amp; Academic</option>
                  <option value="Language">Language &amp; Translation</option>
                  <option value="Communication">Communication &amp; Writing</option>
                  <option value="Agent">Browser Automation</option>
                  <option value="Productivity">Productivity</option>
                  <option value="Custom" selected>Custom</option>
                </select>
              </div>

              <div class="input-group">
                <label for="editor-skill-target" class="input-label">Target Subsystem</label>
                <select id="editor-skill-target" class="select-input">
                  <option value="chat">Chat Mode (Grounded Q&amp;A on Page)</option>
                  <option value="agent">Agent Mode (Browser Automation Errand)</option>
                </select>
              </div>
            </div>

            <div class="input-group">
              <label for="editor-skill-desc" class="input-label">Short Description *</label>
              <input
                type="text"
                id="editor-skill-desc"
                class="text-input"
                placeholder="Brief summary of what this skill does..."
                required
              >
            </div>

            <div class="input-group">
              <label for="editor-skill-prompt" class="input-label">Prompt Template *</label>
              <textarea
                id="editor-skill-prompt"
                class="textarea-input"
                rows="4"
                placeholder="Enter prompt instructions. The page content or form context is automatically provided to the AI."
                required
              ></textarea>
              <div class="field-hint">Tip: For Agent skills, specify the browser goal (e.g. 'Fill this form using my profile').</div>
            </div>

            <div class="editor-button-row">
              <button type="submit" id="btn-save-editor" class="btn btn-primary">
                <span>Save Skill</span>
              </button>
              <button type="button" id="btn-cancel-editor" class="btn btn-ghost">
                <span>Cancel</span>
              </button>
            </div>
          </form>
        </div>

        <!-- Skills Cards Grid / List -->
        <div class="skills-cards-grid" id="skills-cards-container">
          <!-- Dynamically populated -->
        </div>

        <!-- Empty State (Filter / Search no results) -->
        <div id="skills-empty-state" class="skills-empty-state hidden">
          <div class="empty-icon">🔍</div>
          <h4 class="empty-title">No matching skills found</h4>
          <p class="empty-desc">Try clearing your search query or create a new custom skill recipe.</p>
          <button type="button" id="btn-empty-clear" class="btn btn-secondary btn-sm">Clear Filter</button>
        </div>
      </div>
    `;

    this.dom = {
      countBadge: this.container.querySelector('#skills-count-badge'),
      alertBanner: this.container.querySelector('#skills-alert'),
      searchInput: this.container.querySelector('#skills-search-input'),
      btnClearSearch: this.container.querySelector('#btn-skills-clear-search'),
      btnCreate: this.container.querySelector('#btn-create-skill'),
      btnExport: this.container.querySelector('#btn-export-skills'),
      btnImportTrigger: this.container.querySelector('#btn-import-skills-trigger'),
      fileInput: this.container.querySelector('#skills-file-input'),
      btnReset: this.container.querySelector('#btn-reset-skills'),
      filterChipsContainer: this.container.querySelector('#skills-category-chips'),
      cardsContainer: this.container.querySelector('#skills-cards-container'),
      emptyState: this.container.querySelector('#skills-empty-state'),
      btnEmptyClear: this.container.querySelector('#btn-empty-clear'),
      // Editor Modal Elements
      editorCard: this.container.querySelector('#skill-editor-card'),
      editorTitle: this.container.querySelector('#editor-modal-title'),
      editorForm: this.container.querySelector('#skill-editor-form'),
      btnCloseEditor: this.container.querySelector('#btn-close-editor'),
      btnCancelEditor: this.container.querySelector('#btn-cancel-editor'),
      inputTitle: this.container.querySelector('#editor-skill-title'),
      inputIcon: this.container.querySelector('#editor-skill-icon'),
      inputCategory: this.container.querySelector('#editor-skill-category'),
      inputTarget: this.container.querySelector('#editor-skill-target'),
      inputDesc: this.container.querySelector('#editor-skill-desc'),
      inputPrompt: this.container.querySelector('#editor-skill-prompt'),
      btnSaveEditor: this.container.querySelector('#btn-save-editor')
    };
  }

  /**
   * Binds user event listeners
   */
  bindEvents() {
    // Search input
    this.dom.searchInput.addEventListener('input', (e) => {
      this.state.searchQuery = e.target.value.trim().toLowerCase();
      this.dom.btnClearSearch.classList.toggle('hidden', !this.state.searchQuery);
      this.renderSkills();
    });

    // Clear search
    this.dom.btnClearSearch.addEventListener('click', () => {
      this.dom.searchInput.value = '';
      this.state.searchQuery = '';
      this.dom.btnClearSearch.classList.add('hidden');
      this.renderSkills();
      this.dom.searchInput.focus();
    });

    // Category filter chips
    this.dom.filterChipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      const category = chip.getAttribute('data-category');
      if (category) {
        this.state.activeCategory = category;
        this.dom.filterChipsContainer.querySelectorAll('.filter-chip').forEach(c => {
          c.classList.toggle('active', c === chip);
        });
        this.renderSkills();
      }
    });

    // Clear empty state button
    this.dom.btnEmptyClear.addEventListener('click', () => {
      this.dom.searchInput.value = '';
      this.state.searchQuery = '';
      this.state.activeCategory = 'all';
      this.dom.btnClearSearch.classList.add('hidden');
      this.dom.filterChipsContainer.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-category') === 'all');
      });
      this.renderSkills();
    });

    // Create custom skill button
    this.dom.btnCreate.addEventListener('click', () => {
      this.openEditor(null);
    });

    // Editor close & cancel
    this.dom.btnCloseEditor.addEventListener('click', () => this.closeEditor());
    this.dom.btnCancelEditor.addEventListener('click', () => this.closeEditor());

    // Editor form submit
    this.dom.editorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSaveSkill();
    });

    // Export skills button
    this.dom.btnExport.addEventListener('click', () => {
      this.exportSkillsJSON();
    });

    // Import skills file triggers
    this.dom.btnImportTrigger.addEventListener('click', () => {
      this.dom.fileInput.click();
    });

    this.dom.fileInput.addEventListener('change', (e) => {
      this.handleFileImport(e);
    });

    // Reset default skills button
    this.dom.btnReset.addEventListener('click', () => {
      if (confirm('Restore the 4 default built-in skills? Any custom skills you added will be preserved.')) {
        this.resetDefaultSkills();
      }
    });
  }

  /**
   * Loads saved skills from chrome.storage.local
   */
  async loadSkills() {
    try {
      let saved = null;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get([STORAGE_KEYS.SAVED_SKILLS]);
        saved = data[STORAGE_KEYS.SAVED_SKILLS];
      }

      if (Array.isArray(saved) && saved.length > 0) {
        // Ensure all built-in skills exist in the list
        const merged = [...saved];
        for (const builtin of DEFAULT_BUILTIN_SKILLS) {
          if (!merged.some(s => s.id === builtin.id)) {
            merged.push(builtin);
          }
        }
        this.state.skills = merged;
      } else {
        this.state.skills = [...DEFAULT_BUILTIN_SKILLS];
        await this.persistSkills();
      }

      this.renderSkills();
      if (typeof this.onSkillsUpdated === 'function') {
        this.onSkillsUpdated(this.state.skills);
      }
      console.log(`[SkillsView] Loaded ${this.state.skills.length} skills successfully.`);
    } catch (err) {
      console.error('[SkillsView] Failed to load skills:', err);
      this.showAlert(`Failed to load skills: ${err.message}`, 'error');
    }
  }

  /**
   * Persists current skills array to chrome.storage.local
   */
  async persistSkills() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.SAVED_SKILLS]: this.state.skills
        });
      }
      if (typeof this.onSkillsUpdated === 'function') {
        this.onSkillsUpdated(this.state.skills);
      }
    } catch (err) {
      console.error('[SkillsView] Failed to persist skills to local storage:', err);
      this.showAlert(`Failed to save skills: ${err.message}`, 'error');
    }
  }

  /**
   * Renders skills cards based on active category and search filter
   */
  renderSkills() {
    const { skills, searchQuery, activeCategory } = this.state;

    // Filter skills
    const filtered = skills.filter(skill => {
      // Category filter
      if (activeCategory === 'Custom') {
        if (skill.isBuiltIn) return false;
      } else if (activeCategory !== 'all') {
        if (skill.category !== activeCategory) return false;
      }

      // Search query filter
      if (searchQuery) {
        const matchTitle = (skill.title || '').toLowerCase().includes(searchQuery);
        const matchDesc = (skill.description || '').toLowerCase().includes(searchQuery);
        const matchCategory = (skill.category || '').toLowerCase().includes(searchQuery);
        const matchPrompt = (skill.promptTemplate || '').toLowerCase().includes(searchQuery);
        if (!matchTitle && !matchDesc && !matchCategory && !matchPrompt) {
          return false;
        }
      }

      return true;
    });

    // Update count badge
    const customCount = skills.filter(s => !s.isBuiltIn).length;
    const builtinCount = skills.filter(s => s.isBuiltIn).length;
    this.dom.countBadge.textContent = `${builtinCount} Built-in • ${customCount} Custom`;

    // Render cards or empty state
    if (filtered.length === 0) {
      this.dom.cardsContainer.innerHTML = '';
      this.dom.cardsContainer.classList.add('hidden');
      this.dom.emptyState.classList.remove('hidden');
      return;
    }

    this.dom.emptyState.classList.add('hidden');
    this.dom.cardsContainer.classList.remove('hidden');

    this.dom.cardsContainer.innerHTML = filtered.map(skill => {
      const isBuiltin = Boolean(skill.isBuiltIn);
      const isAgent = skill.targetTab === 'agent';
      const originTag = isBuiltin
        ? '<span class="skill-tag builtin">Built-in</span>'
        : '<span class="skill-tag custom">Custom</span>';
      const modeTag = isAgent
        ? '<span class="skill-mode-tag agent" title="Runs as an automated browser errand">🤖 Agent Mode</span>'
        : '<span class="skill-mode-tag chat" title="Runs as a grounded conversational query">💬 Chat Mode</span>';

      return `
        <div class="skill-card ${isBuiltin ? 'builtin-skill' : 'custom-skill'}" data-id="${this.escapeHtml(skill.id)}">
          <div class="skill-card-header">
            <div class="skill-icon-wrap">
              <span class="skill-icon">${skill.icon || '⚡'}</span>
            </div>
            <div class="skill-meta-header">
              <div class="skill-badge-row">
                <span class="skill-category-badge">${this.escapeHtml(skill.category || 'General')}</span>
                ${originTag}
                ${modeTag}
              </div>
              <h3 class="skill-title">${this.escapeHtml(skill.title)}</h3>
            </div>
          </div>

          <p class="skill-desc">${this.escapeHtml(skill.description)}</p>

          <div class="skill-prompt-preview">
            <span class="prompt-preview-label">Prompt Template:</span>
            <code class="prompt-preview-code">${this.escapeHtml(skill.promptTemplate)}</code>
          </div>

          <div class="skill-card-footer">
            <button type="button" class="btn btn-primary btn-sm btn-run-skill" data-id="${this.escapeHtml(skill.id)}" title="Run this skill recipe on the active page">
              <span class="run-sparkle">⚡</span> Run Skill
            </button>
            <div class="skill-secondary-actions">
              <button type="button" class="btn btn-ghost btn-sm btn-copy-prompt" data-id="${this.escapeHtml(skill.id)}" title="Copy prompt template to clipboard">
                📋
              </button>
              ${!isBuiltin ? `
                <button type="button" class="btn btn-ghost btn-sm btn-edit-skill" data-id="${this.escapeHtml(skill.id)}" title="Edit custom skill">
                  ✏️
                </button>
                <button type="button" class="btn btn-ghost btn-sm btn-delete-skill" data-id="${this.escapeHtml(skill.id)}" title="Delete custom skill">
                  🗑️
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach card action listeners
    this.dom.cardsContainer.querySelectorAll('.btn-run-skill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.runSkill(id);
      });
    });

    this.dom.cardsContainer.querySelectorAll('.btn-copy-prompt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.copySkillPrompt(id, e.currentTarget);
      });
    });

    this.dom.cardsContainer.querySelectorAll('.btn-edit-skill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.openEditor(id);
      });
    });

    this.dom.cardsContainer.querySelectorAll('.btn-delete-skill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.deleteCustomSkill(id);
      });
    });
  }

  /**
   * Executes a skill recipe (One-Click)
   * @param {string} skillId
   */
  async runSkill(skillId) {
    const skill = this.state.skills.find(s => s.id === skillId);
    if (!skill) return;

    this.showAlert(`Executing skill "${skill.title}"...`, 'info');

    if (typeof this.onExecuteSkill === 'function') {
      try {
        await this.onExecuteSkill({ skill });
      } catch (err) {
        console.error('[SkillsView] Error executing skill:', err);
        this.showAlert(`Execution error: ${err.message}`, 'error');
      }
    }
  }

  /**
   * Copies the skill's prompt template to the user's clipboard
   * @param {string} skillId
   * @param {HTMLElement} btn
   */
  async copySkillPrompt(skillId, btn) {
    const skill = this.state.skills.find(s => s.id === skillId);
    if (!skill) return;

    try {
      await navigator.clipboard.writeText(skill.promptTemplate);
      const originalText = btn.textContent;
      btn.textContent = '✓';
      btn.classList.add('btn-success');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('btn-success');
      }, 1500);
      this.showAlert(`Copied "${skill.title}" prompt template to clipboard.`, 'success');
    } catch (err) {
      this.showAlert('Could not copy to clipboard.', 'error');
    }
  }

  /**
   * Opens the custom skill editor modal/drawer
   * @param {string|null} skillId
   */
  openEditor(skillId = null) {
    this.state.isEditorOpen = true;
    this.state.editingSkillId = skillId;

    if (skillId) {
      const skill = this.state.skills.find(s => s.id === skillId);
      if (skill) {
        this.dom.editorTitle.textContent = `Edit Skill: ${skill.title}`;
        this.dom.inputTitle.value = skill.title || '';
        this.dom.inputIcon.value = skill.icon || '⚡';
        this.dom.inputCategory.value = skill.category || 'Custom';
        this.dom.inputTarget.value = skill.targetTab || 'chat';
        this.dom.inputDesc.value = skill.description || '';
        this.dom.inputPrompt.value = skill.promptTemplate || '';
      }
    } else {
      this.dom.editorTitle.textContent = 'Create New Skill';
      this.dom.editorForm.reset();
      this.dom.inputIcon.value = '⚡';
      this.dom.inputCategory.value = 'Custom';
      this.dom.inputTarget.value = 'chat';
    }

    this.dom.editorCard.classList.remove('hidden');
    this.dom.inputTitle.focus();
    this.dom.editorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Closes the editor drawer
   */
  closeEditor() {
    this.state.isEditorOpen = false;
    this.state.editingSkillId = null;
    this.dom.editorCard.classList.add('hidden');
  }

  /**
   * Saves custom skill from editor form
   */
  async handleSaveSkill() {
    const title = this.dom.inputTitle.value.trim();
    const description = this.dom.inputDesc.value.trim();
    const promptTemplate = this.dom.inputPrompt.value.trim();
    const icon = this.dom.inputIcon.value || '⚡';
    const category = this.dom.inputCategory.value || 'Custom';
    const targetTab = this.dom.inputTarget.value || 'chat';

    if (!title) {
      this.showAlert('Skill title is required.', 'error');
      this.dom.inputTitle.focus();
      return;
    }

    if (!description) {
      this.showAlert('Skill description is required.', 'error');
      this.dom.inputDesc.focus();
      return;
    }

    if (!promptTemplate) {
      this.showAlert('Prompt template is required.', 'error');
      this.dom.inputPrompt.focus();
      return;
    }

    if (this.state.editingSkillId) {
      // Updating existing skill
      const index = this.state.skills.findIndex(s => s.id === this.state.editingSkillId);
      if (index !== -1) {
        this.state.skills[index] = {
          ...this.state.skills[index],
          title,
          description,
          promptTemplate,
          icon,
          category,
          targetTab,
          updatedAt: Date.now()
        };
        this.showAlert(`Skill "${title}" updated successfully!`, 'success');
      }
    } else {
      // Creating new custom skill
      const newSkill = {
        id: `custom-skill-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title,
        description,
        promptTemplate,
        icon,
        category,
        targetTab,
        isBuiltIn: false,
        createdAt: Date.now()
      };
      this.state.skills.unshift(newSkill);
      this.showAlert(`Skill "${title}" created and ready to use!`, 'success');
    }

    await this.persistSkills();
    this.closeEditor();
    this.renderSkills();
  }

  /**
   * Deletes a custom skill
   * @param {string} skillId
   */
  async deleteCustomSkill(skillId) {
    const skill = this.state.skills.find(s => s.id === skillId);
    if (!skill || skill.isBuiltIn) return;

    if (confirm(`Are you sure you want to delete the skill "${skill.title}"?`)) {
      this.state.skills = this.state.skills.filter(s => s.id !== skillId);
      await this.persistSkills();
      this.renderSkills();
      this.showAlert(`Deleted skill "${skill.title}".`, 'info');
    }
  }

  /**
   * Restores default built-in skills
   */
  async resetDefaultSkills() {
    // Preserve custom skills
    const customSkills = this.state.skills.filter(s => !s.isBuiltIn);
    this.state.skills = [...DEFAULT_BUILTIN_SKILLS, ...customSkills];
    await this.persistSkills();
    this.renderSkills();
    this.showAlert('Restored default built-in skills successfully!', 'success');
  }

  /**
   * Exports skills list to a JSON file download (sahayak-skills.json)
   */
  exportSkillsJSON() {
    try {
      const exportData = {
        app: 'Sahayak Browser AI',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        skillsCount: this.state.skills.length,
        skills: this.state.skills
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sahayak-skills-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showAlert(`Exported ${this.state.skills.length} skills to JSON!`, 'success');
    } catch (err) {
      console.error('[SkillsView] Export failed:', err);
      this.showAlert(`Export failed: ${err.message}`, 'error');
    }
  }

  /**
   * Handles user uploaded JSON file to import and merge skills
   * @param {Event} event
   */
  async handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    event.target.value = '';

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let importedSkills = [];
      if (Array.isArray(parsed)) {
        importedSkills = parsed;
      } else if (parsed && Array.isArray(parsed.skills)) {
        importedSkills = parsed.skills;
      } else {
        throw new Error('Invalid JSON format. Expected an array of skills or an object with a "skills" property.');
      }

      if (importedSkills.length === 0) {
        throw new Error('The imported file contains no skills.');
      }

      // Validate & clean imported skills
      let importedCount = 0;
      const currentSkills = [...this.state.skills];

      for (const item of importedSkills) {
        if (!item || !item.title || !item.promptTemplate) {
          continue;
        }

        const skillId = item.id || `custom-skill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const existingIndex = currentSkills.findIndex(s => s.id === skillId || s.title.toLowerCase() === item.title.toLowerCase());

        const cleanedSkill = {
          id: skillId,
          title: String(item.title).trim(),
          description: String(item.description || item.title).trim(),
          promptTemplate: String(item.promptTemplate).trim(),
          icon: item.icon || '⚡',
          category: item.category || 'Custom',
          targetTab: item.targetTab === 'agent' ? 'agent' : 'chat',
          isBuiltIn: Boolean(item.isBuiltIn && DEFAULT_BUILTIN_SKILLS.some(b => b.id === skillId)),
          createdAt: item.createdAt || Date.now()
        };

        if (existingIndex !== -1) {
          // Update existing
          currentSkills[existingIndex] = cleanedSkill;
        } else {
          // Add new
          currentSkills.push(cleanedSkill);
        }
        importedCount++;
      }

      this.state.skills = currentSkills;
      await this.persistSkills();
      this.renderSkills();

      this.showAlert(`Successfully imported and merged ${importedCount} skills!`, 'success');
    } catch (err) {
      console.error('[SkillsView] Import error:', err);
      this.showAlert(`Import failed: ${err.message}`, 'error');
    }
  }

  /**
   * Helper to display temporary alert banner
   * @param {string} message
   * @param {'success'|'error'|'info'|'warning'} type
   */
  showAlert(message, type = 'info') {
    if (!this.dom.alertBanner) return;
    this.dom.alertBanner.className = `alert-banner alert-${type}`;
    this.dom.alertBanner.querySelector('.alert-text').textContent = message;
    this.dom.alertBanner.classList.remove('hidden');

    if (type !== 'error') {
      setTimeout(() => {
        this.dom.alertBanner?.classList.add('hidden');
      }, 5000);
    }
  }

  /**
   * Called when the Skills tab becomes active
   */
  onTabActivated() {
    this.renderSkills();
  }

  /**
   * Escapes HTML characters for safe rendering
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
