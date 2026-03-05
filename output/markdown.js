// Lightweight Markdown renderer for Skills on Edge

const Markdown = {
  render(src) {
    return this.parseBlocks(src.replace(/\r\n/g, '\n'));
  },

  escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  parseInline(text) {
    let s = this.escapeHtml(text);
    // images
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    // links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // bold+italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    // strikethrough
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // line breaks
    s = s.replace(/  \n/g, '<br>');
    return s;
  },

  parseBlocks(src) {
    const lines = src.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      const codeMatch = line.match(/^```(\w*)/);
      if (codeMatch) {
        const lang = codeMatch[1] || '';
        let code = '';
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          code += (code ? '\n' : '') + lines[i];
          i++;
        }
        i++; // skip closing ```
        html += this.renderCodeBlock(code, lang);
        continue;
      }

      // HTML block (passthrough)
      if (line.match(/^<(div|svg|canvas|style|script|iframe|table|details|section|article|figure)/i)) {
        let block = line;
        const tagMatch = line.match(/^<(\w+)/);
        const tag = tagMatch[1].toLowerCase();
        // Collect until closing tag
        if (!line.includes(`</${tag}>`)) {
          i++;
          while (i < lines.length) {
            block += '\n' + lines[i];
            if (lines[i].includes(`</${tag}>`)) { i++; break; }
            i++;
          }
        } else {
          i++;
        }
        html += block + '\n';
        continue;
      }

      // Heading
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        html += `<h${level}>${this.parseInline(headingMatch[2])}</h${level}>\n`;
        i++;
        continue;
      }

      // Horizontal rule
      if (line.match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
        html += '<hr>\n';
        i++;
        continue;
      }

      // Table
      if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\|?\s*[-:]+[-| :]*$/)) {
        html += this.parseTable(lines, i);
        // Skip table lines
        i++;
        i++; // separator
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          i++;
        }
        continue;
      }

      // Blockquote
      if (line.match(/^>\s?/)) {
        let quoteLines = [];
        while (i < lines.length && lines[i].match(/^>\s?/)) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        html += `<blockquote>${this.parseBlocks(quoteLines.join('\n'))}</blockquote>\n`;
        continue;
      }

      // Unordered list
      if (line.match(/^[\s]*[-*+]\s+/)) {
        html += this.parseList(lines, i, 'ul');
        while (i < lines.length && (lines[i].match(/^[\s]*[-*+]\s+/) || lines[i].match(/^\s+\S/))) {
          i++;
        }
        continue;
      }

      // Ordered list
      if (line.match(/^[\s]*\d+\.\s+/)) {
        html += this.parseList(lines, i, 'ol');
        while (i < lines.length && (lines[i].match(/^[\s]*\d+\.\s+/) || lines[i].match(/^\s+\S/))) {
          i++;
        }
        continue;
      }

      // Empty line
      if (!line.trim()) {
        i++;
        continue;
      }

      // Paragraph - collect contiguous lines
      let para = '';
      while (i < lines.length && lines[i].trim() &&
             !lines[i].match(/^(#{1,6}\s|```|>|[-*+]\s|\d+\.\s|---|\*\*\*|___|<(div|svg|canvas|style|script))/) &&
             !(lines[i].includes('|') && i + 1 < lines.length && lines[i + 1]?.match(/^\|?\s*[-:]+/))) {
        para += (para ? ' ' : '') + lines[i];
        i++;
      }
      html += `<p>${this.parseInline(para)}</p>\n`;
    }

    return html;
  },

  renderCodeBlock(code, lang) {
    const escaped = this.escapeHtml(code);
    const highlighted = lang ? this.highlight(escaped, lang) : escaped;
    const isRunnable = ['html', 'svg', 'htm'].includes(lang.toLowerCase());
    const isJsRunnable = ['javascript', 'js'].includes(lang.toLowerCase());

    let header = `<div class="code-header"><span class="lang-label">${lang || 'code'}</span>`;
    if (isRunnable || isJsRunnable) {
      header += `<button onclick="Markdown.runCode(this)" data-lang="${lang}">Run</button>`;
    }
    header += '</div>';

    return `<pre>${header}<code data-lang="${lang}">${highlighted}</code></pre>\n`;
  },

  parseTable(lines, start) {
    const headerCells = lines[start].split('|').map(c => c.trim()).filter(c => c);
    let html = '<table><thead><tr>';
    headerCells.forEach(c => { html += `<th>${this.parseInline(c)}</th>`; });
    html += '</tr></thead><tbody>';

    let i = start + 2; // skip header + separator
    while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
      const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
      html += '<tr>';
      cells.forEach(c => { html += `<td>${this.parseInline(c)}</td>`; });
      html += '</tr>';
      i++;
    }
    html += '</tbody></table>\n';
    return html;
  },

  parseList(lines, start, type) {
    const items = [];
    let i = start;
    const pattern = type === 'ul' ? /^[\s]*[-*+]\s+(.+)/ : /^[\s]*\d+\.\s+(.+)/;

    while (i < lines.length) {
      const match = lines[i].match(pattern);
      if (match) {
        items.push(match[1]);
        i++;
      } else if (lines[i].match(/^\s+\S/) && items.length > 0) {
        items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      } else {
        break;
      }
    }

    let html = `<${type}>`;
    items.forEach(item => { html += `<li>${this.parseInline(item)}</li>`; });
    html += `</${type}>\n`;
    return html;
  },

  // Basic syntax highlighting
  highlight(code, lang) {
    const l = lang.toLowerCase();
    if (['js', 'javascript', 'ts', 'typescript'].includes(l)) return this.highlightJS(code);
    if (['py', 'python'].includes(l)) return this.highlightPython(code);
    if (['html', 'xml', 'svg', 'htm'].includes(l)) return this.highlightHTML(code);
    if (['css'].includes(l)) return this.highlightCSS(code);
    if (['json'].includes(l)) return this.highlightJSON(code);
    return code;
  },

  highlightJS(code) {
    const kw = /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|new|this|async|await|try|catch|throw|typeof|instanceof|switch|case|break|continue|yield|of|in)\b/g;
    return code
      .replace(/(\/\/.*)/g, '<span class="cmt">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="cmt">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, '<span class="str">$1</span>')
      .replace(kw, '<span class="kw">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
  },

  highlightPython(code) {
    const kw = /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|lambda|yield|pass|break|continue|and|or|not|in|is|True|False|None|self|print|raise)\b/g;
    return code
      .replace(/(#.*)/g, '<span class="cmt">$1</span>')
      .replace(/(&quot;&quot;&quot;[\s\S]*?&quot;&quot;&quot;|&#39;&#39;&#39;[\s\S]*?&#39;&#39;&#39;)/g, '<span class="str">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, '<span class="str">$1</span>')
      .replace(kw, '<span class="kw">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
  },

  highlightHTML(code) {
    return code
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="kw">$2</span>')
      .replace(/([\w-]+)(=)/g, '<span class="fn">$1</span>$2')
      .replace(/(&quot;[^&]*?&quot;)/g, '<span class="str">$1</span>');
  },

  highlightCSS(code) {
    return code
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="cmt">$1</span>')
      .replace(/([.#]?[\w-]+)\s*\{/g, '<span class="fn">$1</span> {')
      .replace(/([\w-]+)\s*:/g, '<span class="kw">$1</span>:')
      .replace(/(&quot;[^&]*?&quot;)/g, '<span class="str">$1</span>')
      .replace(/\b(\d+\.?\d*(px|em|rem|%|vh|vw|s|ms)?)\b/g, '<span class="num">$1</span>');
  },

  highlightJSON(code) {
    return code
      .replace(/(&quot;[^&]*?&quot;)\s*:/g, '<span class="fn">$1</span>:')
      .replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span class="str">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="kw">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
  },

  // Run HTML/JS code blocks in a sandboxed iframe
  runCode(button) {
    const pre = button.closest('pre');
    const codeEl = pre.querySelector('code');
    const lang = button.dataset.lang.toLowerCase();
    const raw = codeEl.textContent;

    // Remove existing frame if re-running
    const existing = pre.querySelector('.render-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.className = 'render-frame';
    iframe.sandbox = 'allow-scripts';
    pre.appendChild(iframe);

    let htmlContent;
    if (['javascript', 'js'].includes(lang)) {
      htmlContent = `<!DOCTYPE html><html><head><style>body{font-family:sans-serif;padding:12px;margin:0;background:#fff;color:#333;}</style></head><body><div id="output"></div><canvas id="canvas" width="600" height="400" style="display:none"></canvas><script>
        const output = document.getElementById('output');
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        function show(el) { el.style.display = 'block'; }
        const _log = console.log;
        console.log = (...args) => { output.innerHTML += args.map(a => typeof a === 'object' ? JSON.stringify(a,null,2) : a).join(' ') + '<br>'; _log(...args); };
        try { ${raw} } catch(e) { output.innerHTML += '<span style=\"color:red\">' + e.message + '</span>'; }
      <\/script></body></html>`;
    } else {
      htmlContent = raw;
    }

    iframe.srcdoc = htmlContent;

    // Auto-resize iframe
    iframe.onload = () => {
      try {
        const h = iframe.contentDocument.documentElement.scrollHeight;
        iframe.style.height = Math.min(Math.max(h + 20, 100), 600) + 'px';
      } catch { iframe.style.height = '300px'; }
    };
  }
};
