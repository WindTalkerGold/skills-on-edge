// Skills on Edge - Skill Definitions

function langInstruction(settings) {
  const lang = settings?.outputLang;
  if (!lang) return '';
  return ` Respond in ${lang}.`;
}

const Skills = {
  summarize: {
    id: 'summarize',
    name: 'Summarize',
    icon: '\u{1F4DD}',
    needsSelection: false,
    buildMessages(context, settings = {}) {
      return [
        { role: 'system', content: 'You are a summarization expert. Be extremely brief and dense. Output a short bullet list (3-7 bullets max). Each bullet should be one short sentence. No introduction, no conclusion, no filler. If the content is short, the summary should be even shorter. Aim for 10-20% of the original length.' + langInstruction(settings) },
        { role: 'user', content: `Summarize this page in a few brief bullet points. Be ultra-concise — every word must earn its place.\n\nTitle: ${context.title}\n\n${context.text}` }
      ];
    }
  },

  translate: {
    id: 'translate',
    name: 'Translate',
    icon: '\u{1F310}',
    needsSelection: false,
    buildMessages(context, settings = {}) {
      const targetLang = settings.translateLang || settings.outputLang || 'English';
      const text = context.selection || context.text;
      return [
        { role: 'system', content: `You are a professional translator. Translate to ${targetLang} faithfully, sentence by sentence, preserving the original structure. Translate every sentence — do not summarize, skip, or rephrase. Match the original word order and paragraph breaks as closely as the target language allows. Do not add commentary.` },
        { role: 'user', content: `Translate the following text to ${targetLang} sentence by sentence. Preserve every statement faithfully:\n\n${text}` }
      ];
    }
  },

  ask: {
    id: 'ask',
    name: 'Ask',
    icon: '\u{2753}',
    needsSelection: false,
    needsUserInput: true,
    inputPlaceholder: 'Ask a question about this page...',
    buildMessages(context, settings = {}) {
      const question = settings.userInput || '';
      const pageText = context.selection || context.text;
      return [
        { role: 'system', content: 'You are a helpful assistant. Answer the user\'s question based on the provided page content and your general knowledge. Be concise and direct. If the content doesn\'t contain enough information to fully answer, say so and answer with what you can.' + langInstruction(settings) },
        { role: 'user', content: `Page content:\n\nTitle: ${context.title}\n\n${pageText}\n\n---\n\nQuestion: ${question}` }
      ];
    }
  }
};

function getSkill(id) {
  return Skills[id] || null;
}

function getAllSkills() {
  return Object.values(Skills);
}
