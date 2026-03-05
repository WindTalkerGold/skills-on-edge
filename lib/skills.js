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
        { role: 'system', content: 'You are a helpful assistant. Provide concise, well-structured summaries.' + langInstruction(settings) },
        { role: 'user', content: `Summarize the following web page content concisely. Focus on the main points and key takeaways.\n\nTitle: ${context.title}\nURL: ${context.url}\n\nContent:\n${context.text}` }
      ];
    }
  },

  explain: {
    id: 'explain',
    name: 'Explain',
    icon: '\u{1F4A1}',
    needsSelection: true,
    buildMessages(context, settings = {}) {
      const text = context.selection || context.text;
      return [
        { role: 'system', content: 'You are a helpful assistant. Explain concepts clearly and simply.' + langInstruction(settings) },
        { role: 'user', content: `Explain the following text in simple, easy-to-understand terms:\n\n${text}` }
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
        { role: 'system', content: `You are a professional translator. Translate accurately to ${targetLang}, preserving meaning and tone.` },
        { role: 'user', content: `Translate the following text to ${targetLang}:\n\n${text}` }
      ];
    }
  },

  keypoints: {
    id: 'keypoints',
    name: 'Key Points',
    icon: '\u{1F4CC}',
    needsSelection: false,
    buildMessages(context, settings = {}) {
      return [
        { role: 'system', content: 'You are a helpful assistant. Extract key information as clear bullet points.' + langInstruction(settings) },
        { role: 'user', content: `Extract the key points from the following content as a concise bullet list:\n\nTitle: ${context.title}\n\nContent:\n${context.text}` }
      ];
    }
  },

  reply: {
    id: 'reply',
    name: 'Generate Reply',
    icon: '\u{2709}\u{FE0F}',
    needsSelection: true,
    buildMessages(context, settings = {}) {
      const text = context.selection || context.text;
      return [
        { role: 'system', content: 'You are a helpful assistant. Generate professional, appropriate replies.' + langInstruction(settings) },
        { role: 'user', content: `Generate a professional reply to the following message or text:\n\n${text}` }
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
