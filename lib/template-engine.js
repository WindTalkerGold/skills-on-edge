// Skills on Edge - Template Engine
// Resolves {{path}} expressions against a data context

const TemplateEngine = {
  /**
   * Resolve a dot-path like "context.title" against a data object.
   */
  resolvePath(obj, path) {
    return path.split('.').reduce((cur, key) => (cur != null ? cur[key] : undefined), obj);
  },

  /**
   * Interpolate all {{expr}} placeholders in a string.
   * Data shape: { context, settings, steps, loop? }
   * Special: {{langInstruction}}, {{context.selectionOrText}}, {{loop.iteration}}
   */
  render(template, data) {
    if (!template || typeof template !== 'string') return template || '';

    return template.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
      const path = expr.trim();

      // Built-in: langInstruction
      if (path === 'langInstruction') {
        const lang = data.settings?.outputLang;
        return lang ? ` Respond in ${lang}.` : '';
      }

      // Built-in: context.selectionOrText — selection with fallback to full text
      // Also falls back if selection looks truncated (virtual scrolling: contains …)
      if (path === 'context.selectionOrText') {
        const sel = data.context?.selection;
        const text = data.context?.text;
        if (sel && sel.length > 50 && !/\n\s*…\s*\n/.test(sel)) {
          return sel;
        }
        return text ?? sel ?? '';
      }

      const value = this.resolvePath(data, path);
      return value != null ? String(value) : '';
    });
  },

  /**
   * Render all string values in an object/array recursively.
   */
  renderDeep(obj, data) {
    if (typeof obj === 'string') return this.render(obj, data);
    if (Array.isArray(obj)) return obj.map(item => this.renderDeep(item, data));
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, val] of Object.entries(obj)) {
        result[key] = this.renderDeep(val, data);
      }
      return result;
    }
    return obj;
  }
};
