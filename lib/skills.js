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

  amiright: {
    id: 'amiright',
    name: 'Am I Right?',
    icon: '\u{2753}',
    needsSelection: false,
    needsUserInput: true,
    inputPlaceholder: 'Type your understanding here...',
    buildMessages(context, settings = {}) {
      const claim = settings.userInput || '';
      const pageText = context.selection || context.text;
      return [
        { role: 'system', content: 'You are a critical thinking assistant. The user will share their understanding of something. Evaluate whether their understanding is correct based on the page content provided AND your general knowledge. Be honest: confirm what is right, correct what is wrong, and clarify any nuances or missing points. Start your response with a clear verdict (Correct / Partially Correct / Incorrect) before explaining.' + langInstruction(settings) },
        { role: 'user', content: `Here is the page content for context:\n\nTitle: ${context.title}\n\nContent:\n${pageText}\n\n---\n\nMy understanding:\n${claim}\n\nIs my understanding correct? Please verify against both the page content and common knowledge.` }
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
