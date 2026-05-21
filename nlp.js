class MarkovChain {
  constructor() {
    this.chain = {};
    this.starters = [];
  }

  train(texts) {
    for (const text of texts) {
      const words = text.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2) continue;

      this.starters.push(words[0]);

      for (let i = 0; i < words.length - 1; i++) {
        const current = words[i].toLowerCase();
        const next = words[i + 1].toLowerCase();
        if (!this.chain[current]) this.chain[current] = [];
        this.chain[current].push(next);
      }
    }
  }

  generate(minWords = 4, maxWords = 15) {
    if (this.starters.length === 0) return null;

    const wordCount = Math.floor(Math.random() * (maxWords - minWords + 1)) + minWords;
    const result = [];
    let current = this.starters[Math.floor(Math.random() * this.starters.length)];
    result.push(current);

    for (let i = 0; i < wordCount; i++) {
      const nextWords = this.chain[current?.toLowerCase()];
      if (!nextWords || nextWords.length === 0) break;
      current = nextWords[Math.floor(Math.random() * nextWords.length)];
      result.push(current);

      if (['.', '!', '?'].includes(current) && Math.random() < 0.4) break;
    }

    return result.join(' ');
  }
}

class ConversationMemory {
  constructor(maxLen = 20) {
    this.maxLen = maxLen;
    this.exchanges = [];
  }

  add(role, content) {
    this.exchanges.push({ role, content, ts: Date.now() });
    if (this.exchanges.length > this.maxLen) {
      this.exchanges = this.exchanges.slice(-this.maxLen);
    }
  }

  getLastBotResponses(count = 3) {
    return this.exchanges
      .filter(e => e.role === 'bot')
      .slice(-count)
      .map(e => e.content);
  }

  getLastTargetMessages(count = 5) {
    return this.exchanges
      .filter(e => e.role === 'target')
      .slice(-count)
      .map(e => e.content);
  }

  isRepeatingBot(text) {
    const lower = text.toLowerCase().trim();
    const lastBots = this.getLastBotResponses(5);
    for (const botMsg of lastBots) {
      if (botMsg.toLowerCase().includes(lower) || lower.includes(botMsg.toLowerCase().slice(0, 20))) {
        return true;
      }
    }
    return false;
  }
}

function analyzeSentiment(text) {
  const lower = text.toLowerCase();

  const angry = ['fuck', 'shit', 'damn', 'hate', 'mad', 'stupid', 'dumb', 'annoying', 'wtf', 'stop', 'kill', 'die', 'suck', 'trash', 'retard', 'ass', 'bitch'];
  const sad = ['sad', 'cry', 'lonely', 'miss', 'sorry', 'depressed', 'tired', 'leave', 'alone', 'hurt', 'pain', 'ugh'];
  const happy = ['happy', 'love', 'nice', 'good', 'great', 'awesome', 'fun', 'cool', 'lol', 'lmao', 'xd', 'amazing', 'wow', 'based', 'pog'];
  const confused = ['what', 'huh', 'who', 'where', 'why', 'how', '?', 'idk', 'maybe', 'confused', '???'];
  const questions = text.includes('?');
  const mentionsBot = text.includes('<@1506847837185638410>') || lower.includes('jack') || lower.includes('bot');

  const aScore = angry.filter(w => lower.includes(w)).length;
  const sScore = sad.filter(w => lower.includes(w)).length;
  const hScore = happy.filter(w => lower.includes(w)).length;
  const cScore = confused.filter(w => lower.includes(w)).length;

  if (mentionsBot) return 'addressing';
  if (aScore >= 1 && aScore >= hScore && aScore >= sScore) return 'angry';
  if (sScore >= 1 && sScore >= hScore && sScore >= aScore) return 'sad';
  if (hScore >= 1 && hScore >= aScore && hScore >= sScore) return 'happy';
  if (cScore >= 1 || questions) return 'confused';
  return 'neutral';
}

function isSpam(text) {
  if (text.length <= 2 && text.length > 0) return true;
  const unique = new Set(text.toLowerCase().split('')).size;
  if (text.length > 5 && unique <= 3) return true;
  const words = text.split(/\s+/);
  if (words.length === 0) return true;
  return false;
}

module.exports = { MarkovChain, ConversationMemory, analyzeSentiment, isSpam };
