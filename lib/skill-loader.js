// Skills on Edge - Skill Loader
// Loads user skills from extension files (examples) and chrome.storage.local (imported)

const SKILL_SCHEMA_FIELDS = ['id', 'name', 'actions'];
const VALID_ACTION_TYPES = ['llm-chat', 'llm-build-prompt', 'http-call', 'transform', 'loop'];
const VALID_ON_ERROR = ['abort', 'skip', 'fallback'];

const UserSkills = {
  async getAll() {
    // Load file-based user skills from user-skills/*.json
    // Try known files directly — no index file needed
    const fileSkills = [];
    const { userSkillFiles } = await chrome.storage.local.get('userSkillFiles');
    const filesToTry = new Set(userSkillFiles || []);
    // Always try the bundled examples
    for (const f of ['explain.json', 'keypoints.json', 'reply.json', 'csharp-simple-check.json']) {
      filesToTry.add(f);
    }
    for (const file of filesToTry) {
      try {
        const url = chrome.runtime.getURL(`user-skills/${file}`);
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const skill = await resp.json();
        if (skill.enabled === undefined) skill.enabled = true;
        fileSkills.push(skill);
      } catch {
        // File doesn't exist or invalid — skip
      }
    }

    // Load storage-based user skills (imported via options page)
    const { userSkills } = await chrome.storage.local.get('userSkills');
    const storageSkills = userSkills || [];

    // Merge: file-based first, then storage-based (skip duplicates by id)
    const seenIds = new Set(fileSkills.map(s => s.id));
    const merged = [...fileSkills];
    for (const s of storageSkills) {
      if (!seenIds.has(s.id)) {
        merged.push(s);
        seenIds.add(s.id);
      }
    }
    return merged;
  },

  async save(skills) {
    await chrome.storage.local.set({ userSkills: skills });
  },

  async add(skill) {
    const errors = this.validate(skill);
    if (errors.length) throw new Error('Invalid skill: ' + errors.join(', '));

    const skills = await this.getAll();
    // Replace if same id exists
    const idx = skills.findIndex(s => s.id === skill.id);
    if (idx !== -1) {
      skills[idx] = skill;
    } else {
      skills.push(skill);
    }
    await this.save(skills);
    return skill;
  },

  async remove(skillId) {
    let skills = await this.getAll();
    skills = skills.filter(s => s.id !== skillId);
    await this.save(skills);
  },

  async setEnabled(skillId, enabled) {
    const skills = await this.getAll();
    const skill = skills.find(s => s.id === skillId);
    if (skill) {
      skill.enabled = enabled;
      await this.save(skills);
    }
  },

  validate(skill) {
    const errors = [];
    if (!skill || typeof skill !== 'object') return ['Skill must be an object'];
    for (const field of SKILL_SCHEMA_FIELDS) {
      if (!skill[field]) errors.push(`Missing required field: ${field}`);
    }
    if (skill.id && !/^[a-z0-9-]+$/.test(skill.id)) {
      errors.push('id must be lowercase alphanumeric with hyphens');
    }
    if (!Array.isArray(skill.actions) || skill.actions.length === 0) {
      errors.push('actions must be a non-empty array');
    } else {
      skill.actions.forEach((action, i) => {
        if (!action.id) errors.push(`Action ${i}: missing id`);
        if (!VALID_ACTION_TYPES.includes(action.type)) {
          errors.push(`Action ${i}: invalid type "${action.type}"`);
        }
        if (action.onError && !VALID_ON_ERROR.includes(action.onError)) {
          errors.push(`Action ${i}: invalid onError "${action.onError}"`);
        }
      });
    }
    return errors;
  },

  async importFromJson(jsonString) {
    const skill = JSON.parse(jsonString);
    // Default enabled to true if not set
    if (skill.enabled === undefined) skill.enabled = true;
    return this.add(skill);
  }
};
