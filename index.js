const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const OpenAI = require('openai');
require('dotenv').config();

const TARGET_USER = process.env.TARGET_USER?.toLowerCase();
const MEMORY_FILE = path.join(__dirname, 'jack_memory.json');
const BOT_USER_ID = '1506847837185638410';

const groq = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

let memory = { messages: [] };
if (fs.existsSync(MEMORY_FILE)) {
  try { memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) {}
}

function saveMemory() {
  if (memory.messages.length > 200) memory.messages = memory.messages.slice(-100);
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2)); } catch (e) {}
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let lastBotMsgs = [];
let lastTargetMsgs = [];

function isRepeatingBot(text) {
  const lower = text.toLowerCase().trim();
  return lastBotMsgs.some(botMsg =>
    botMsg.toLowerCase().includes(lower) || lower.includes(botMsg.toLowerCase().slice(0, 15))
  );
}

async function getLLMResponse(text) {
  const recentTarget = lastTargetMsgs.slice(-6);
  const recentBot = lastBotMsgs.slice(-6);

  const systemMsg = `You are a condescending adult talking to a child. Mock them like they're dumb.
Call them "buddy", "champ", "kiddo", "little guy", "sweetie".
Keep it SHORT — 1-2 sentences. Never be helpful.`;

  try {
    const msgs = [
      { role: 'system', content: systemMsg },
    ];

    for (let i = 0; i < Math.max(recentTarget.length, recentBot.length); i++) {
      if (i < recentTarget.length) msgs.push({ role: 'user', content: recentTarget[i] });
      if (i < recentBot.length) msgs.push({ role: 'assistant', content: recentBot[i] });
    }

    msgs.push({ role: 'user', content: text });

    const result = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: msgs,
      max_tokens: 100,
      temperature: 0.8,
    });

    return result.choices[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error('Groq:', e.message?.slice(0, 100) || e);
    return null;
  }
}

function getFallback(text) {
  if (isRepeatingBot(text)) {
    const roasts = [
      "You know that's my line, right?",
      "Good one. You really showed me by quoting me.",
      "Wow, original. You're like a parrot.",
      "You like my responses that much, huh?",
      "Cute, you're repeating me.",
    ];
    return roasts[Math.floor(Math.random() * roasts.length)];
  }

  if (text.length <= 2) {
    return [
      "Use your words, kiddo.",
      "Full sentences please.",
      "Try again, champ.",
      "I don't speak baby.",
      "That's all you got?",
    ][Math.floor(Math.random() * 5)];
  }

  const pool = [
    "Aww, that's so cute, sweetie.",
    "Oh honey, you're trying so hard.",
    "Good job, buddy! You're doing great.",
    "What a big kid you are.",
    "That's adorable.",
    "You're like a little puppy.",
    "I'm so proud of you for using your words.",
    "Look at you go, little guy.",
    "Take your time, kiddo.",
    "That's... very you.",
    "Did the grown-ups help you write that?",
    "Oh, bless your heart.",
    "Someone needs a nap.",
    "Are you having a tantrum?",
    "Use your inside voice, sweetie.",
    "Calm down, it's not that serious.",
    "I know, big words are hard.",
    "You sure showed them, tiger.",
    "There there, let it all out.",
    "You'll get it eventually, sport.",
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const authorName = message.author.globalName?.toLowerCase();
    const authorUser = message.author.username.toLowerCase();
    const displayName = message.member?.displayName?.toLowerCase() || authorName || authorUser;
    const content = message.content;

    console.log(`[${displayName}] "${content.slice(0, 100)}"`);

    memory.messages.push({ content, timestamp: Date.now() });
    saveMemory();

    lastTargetMsgs.push(content);
    if (lastTargetMsgs.length > 20) lastTargetMsgs = lastTargetMsgs.slice(-10);

    let response = await getLLMResponse(content);
    if (!response || typeof response !== 'string') {
      response = getFallback(content);
    }

    response = String(response).trim() || "Use your words, kiddo.";

    lastBotMsgs.push(response);
    if (lastBotMsgs.length > 20) lastBotMsgs = lastBotMsgs.slice(-10);

    console.log(`>>> ${response.slice(0, 100)}`);
    await message.reply(response).catch(() => {});
  } catch (e) {
    console.error('Error:', e.message);
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Target: "${TARGET_USER}" | Memory: ${memory.messages.length} msgs`);
  console.log(`Guilds: ${client.guilds.cache.map(g => g.name).join(', ') || 'none'}`);
});

process.on('unhandledRejection', (e) => console.error('Unhandled:', e.message));
client.on('error', (e) => console.error('Client error:', e.message));

const server = http.createServer((req, res) => res.end('ok'));
server.listen(process.env.PORT || 3000, () => console.log('HTTP server up'));
server.on('error', (e) => console.error('HTTP error:', e.message));

client.login(process.env.DISCORD_TOKEN);
