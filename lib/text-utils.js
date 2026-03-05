// Skills on Edge - Text Utilities for chunked processing

const TextUtils = {
  /**
   * Split text into N roughly equal chunks by paragraph boundaries.
   * Returns an array of strings.
   */
  chunkText(text, numChunks) {
    if (numChunks <= 1) return [text];

    const paragraphs = text.split(/\n\s*\n/);
    if (paragraphs.length <= numChunks) {
      // Fewer paragraphs than chunks — just return each paragraph
      return paragraphs.filter(p => p.trim().length > 0);
    }

    const targetSize = Math.ceil(text.length / numChunks);
    const chunks = [];
    let current = '';

    for (const para of paragraphs) {
      if (current.length > 0 && current.length + para.length > targetSize && chunks.length < numChunks - 1) {
        chunks.push(current.trim());
        current = '';
      }
      current += (current ? '\n\n' : '') + para;
    }
    if (current.trim()) chunks.push(current.trim());

    return chunks;
  },

  /**
   * Filter text to keep only "useful" lines — removes boilerplate, noise, short nav items.
   * Returns filtered text, capped at maxChars.
   */
  extractUsefulText(text, maxChars = 4000) {
    const boilerplatePatterns = [
      /^\s*copyright/i,
      /^\s*all rights reserved/i,
      /^\s*cookie/i,
      /^\s*subscribe/i,
      /^\s*sign in/i,
      /^\s*log in/i,
      /^\s*sign up/i,
      /^\s*privacy policy/i,
      /^\s*terms of (service|use)/i,
      /^\s*follow us/i,
      /^\s*share (this|on)/i,
      /^\s*advertisement/i,
      /^\s*sponsored/i,
      /^\s*newsletter/i
    ];

    let lines = text.split('\n');

    // Remove lines shorter than 15 chars (nav items, buttons, labels)
    lines = lines.filter(line => line.trim().length >= 15);

    // Remove lines that are all punctuation/whitespace
    lines = lines.filter(line => /[a-zA-Z\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(line));

    // Remove common boilerplate
    lines = lines.filter(line => {
      const trimmed = line.trim();
      return !boilerplatePatterns.some(pat => pat.test(trimmed));
    });

    // Remove near-duplicate lines (exact match after trimming)
    const seen = new Set();
    lines = lines.filter(line => {
      const key = line.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let result = lines.join('\n');

    // If still over maxChars, sample every Nth line
    if (result.length > maxChars) {
      const step = Math.ceil(lines.length / (maxChars / 80)); // ~80 chars per line estimate
      const sampled = lines.filter((_, i) => i % step === 0);
      result = sampled.join('\n');
    }

    return result.substring(0, maxChars);
  }
};
