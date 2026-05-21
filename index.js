const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const say = require('say');
const ffmpegStatic = require('ffmpeg-static');
const OpenAI = require('openai');
require('dotenv').config();

process.env.FFMPEG_PATH = ffmpegStatic;

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
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}



const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

let voiceConnection = null;
let audioPlayer = createAudioPlayer();
let currentVoiceChannel = null;

let lastBotMsgs = [];
let lastTargetMsgs = [];

function isRepeatingBot(text) {
  const lower = text.toLowerCase().trim();
  return lastBotMsgs.some(botMsg =>
    botMsg.toLowerCase().includes(lower) || lower.includes(botMsg.toLowerCase().slice(0, 15))
  );
}

async function speakText(text) {
  if (!voiceConnection || voiceConnection.state.status !== VoiceConnectionStatus.Ready) return;

  const filePath = path.join(__dirname, `tts_${Date.now()}.wav`);
  const clean = text.replace(/["*_`\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return;

  return new Promise((resolve) => {
    say.export(clean, 'Microsoft David Desktop', 1, filePath, async (err) => {
      if (err) { resolve(); return; }
      try {
        const resource = createAudioResource(filePath);
        audioPlayer.play(resource);
        voiceConnection.subscribe(audioPlayer);
        audioPlayer.once(AudioPlayerStatus.Idle, () => {
          try { fs.unlinkSync(filePath); } catch (e) {}
          resolve();
        });
        setTimeout(() => {
          try { fs.unlinkSync(filePath); } catch (e) {}
          resolve();
        }, 10000);
      } catch (e) {
        try { fs.unlinkSync(filePath); } catch (e) {}
        resolve();
      }
    });
  });
}

async function getLLMResponse(text) {
  const recentTarget = lastTargetMsgs.slice(-6);
  const recentBot = lastBotMsgs.slice(-6);

  const systemMsg = `You are Jack, talking to yourself in a mirror. Mock yourself like a child.
Be condescending, patronizing, belittling. Call yourself "buddy", "champ", "kiddo", "little guy".
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

    const response = result.choices[0]?.message?.content?.trim();
    return response || null;
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

  const words = text.split(/\s+/).filter(w => w.length > 0).length;
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
    const isTarget = authorName === TARGET_USER || authorUser === TARGET_USER || displayName === TARGET_USER;

    if (content === '!leave' && voiceConnection) {
      voiceConnection.destroy();
      voiceConnection = null;
      currentVoiceChannel = null;
      await message.reply('Left.');
      return;
    }

    if (!isTarget) return;

    console.log(`[${displayName}] "${content.slice(0, 100)}"`);

    memory.messages.push({ content, timestamp: Date.now() });
    if (memory.messages.length > 200) memory.messages = memory.messages.slice(-100);
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
    await speakText(response).catch(() => {});
  } catch (e) {
    console.error('Error:', e.message);
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Target: "${TARGET_USER}" | Memory: ${memory.messages.length} msgs`);
  console.log(`Guilds: ${client.guilds.cache.map(g => g.name).join(', ') || 'none'}`);

  const guild = client.guilds.cache.first();
  if (guild) {
    const channel = guild.channels.cache.find(c => c.type === 2 && c.name.toLowerCase().includes('general'));
    if (channel) {
      currentVoiceChannel = channel;
      voiceConnection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
      });
      audioPlayer = createAudioPlayer();
      voiceConnection.subscribe(audioPlayer);
      console.log(`Joined voice: ${channel.name}`);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
