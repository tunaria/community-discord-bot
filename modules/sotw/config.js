// Student of the Week settings, read from the environment through ctx.env.
const path = require('path');
const { validTimeZone } = require('./time');

const DEFAULT_HOSTS = 'discord.com,discordapp.com,cdn.discordapp.com,youtube.com,youtu.be,imgur.com';

function num(env, name, fallback) {
  const raw = env(name);
  if (raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function lowerList(raw) {
  return raw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}

function buildConfig(env, root = process.cwd()) {
  const tz = env('SOTW_TIMEZONE') || 'America/Los_Angeles';
  const port = num(env, 'SOTW_HTTP_PORT', 0);
  return {
    enabled: env('SOTW_ENABLED').toLowerCase() === 'true',
    dataDir: path.resolve(root, env('SOTW_DATA_DIR') || 'data/sotw'),
    submitChannel: env('SOTW_SUBMIT_CHANNEL'),
    staffChannel: env('SOTW_STAFF_CHANNEL'),
    announceChannel: env('SOTW_ANNOUNCE_CHANNEL'),
    hallChannel: env('SOTW_HALL_CHANNEL'),
    linkHosts: lowerList(env('SOTW_LINK_HOSTS') || DEFAULT_HOSTS),
    blockedWords: lowerList(env('SOTW_BLOCKED_WORDS')),
    vetoHours: num(env, 'SOTW_VETO_HOURS', 12),
    minAccountDays: num(env, 'SOTW_MIN_ACCOUNT_DAYS', 14),
    minMemberDays: num(env, 'SOTW_MIN_MEMBER_DAYS', 3),
    maxPerWeek: num(env, 'SOTW_MAX_PER_WEEK', 2),
    timezone: validTimeZone(tz) ? tz : 'UTC',
    cycleWeekday: num(env, 'SOTW_CYCLE_DAY', 6),
    cycleHour: num(env, 'SOTW_CYCLE_HOUR', 20),
    reactionWeight: 0.2,
    aiKey: env('SOTW_AI_KEY'),
    aiUrl: env('SOTW_AI_URL') || 'https://api.openai.com/v1/chat/completions',
    aiModel: env('SOTW_AI_MODEL') || 'gpt-4o-mini',
    moderationUrl: env('SOTW_MODERATION_URL'),
    httpHost: env('SOTW_HTTP_HOST') || '127.0.0.1',
    httpPort: port,
    publicUrl: env('SOTW_PUBLIC_URL').replace(/\/+$/, ''),
  };
}

module.exports = { buildConfig, DEFAULT_HOSTS };
