// Text cleaning and entry screening for Student of the Week. Pure functions, no Discord.
const MAX_TITLE = 60;
const MAX_DESC = 400;
const MAX_DISPLAY = 40;

const CONTROL_RE = /[\x00-\x1f\x7f]/g;
const MENTION_RE = /@(everyone|here)|<[@#&!]?\d+>/gi;
const CLIENT_UNSAFE_RE = /[<>[\]{}|\\^~`]/g;
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', '@': 'a', $: 's' };

function cleanText(text, limit) {
  return String(text || '')
    .replace(CONTROL_RE, ' ')
    .replace(MENTION_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

// Plain text that is safe to show in the game client: no markup, links or special characters.
function displayText(text, limit = MAX_DISPLAY) {
  let t = cleanText(text, 200);
  t = t.replace(/https?:\/\/\S+/gi, '').replace(CLIENT_UNSAFE_RE, '').replace(/\s+/g, ' ').trim();
  if (t.length > limit) t = t.slice(0, limit - 3).trimEnd() + '...';
  return t;
}

// Returns { url } or { error }.
function validateUrl(input, allowedHosts) {
  const raw = String(input || '').trim();
  if (raw.length > 300 || /\s/.test(raw)) return { error: 'The link is invalid or too long.' };
  let u;
  try { u = new URL(raw); } catch (e) { return { error: 'The link must start with http:// or https://.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'The link must start with http:// or https://.' };
  if (u.username || u.password) return { error: 'Links with embedded credentials are not allowed.' };
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.some(h => host === h || host.endsWith('.' + h))) {
    return { error: 'That site is not on the allowed list: ' + [...allowedHosts].sort().join(', ') };
  }
  return { url: u.href };
}

function normalise(text) {
  return String(text).toLowerCase().replace(/[01345@$]/g, c => LEET[c]).replace(/[^a-z ]/g, '');
}

function hasBlockedWord(text, blockedWords) {
  const norm = ' ' + normalise(text) + ' ';
  const squashed = norm.replace(/ /g, '');
  for (const word of blockedWords) {
    const w = normalise(word).trim();
    if (!w) continue;
    if (norm.includes(' ' + w + ' ') || (w.length >= 5 && squashed.includes(w))) return true;
  }
  return false;
}

// Returns { entry: { title, url, description } } or { error }.
function screenEntry(title, url, description, cfg) {
  const t = cleanText(title, MAX_TITLE);
  const d = cleanText(description, MAX_DESC);
  if (t.length < 3) return { error: 'The title is too short.' };
  if (d.length < 10) return { error: 'Please add a short description (at least 10 characters).' };
  const v = validateUrl(url, cfg.linkHosts);
  if (v.error) return { error: v.error };
  if (hasBlockedWord(t + ' ' + d, cfg.blockedWords)) return { error: 'Your entry contains words that are not allowed.' };
  if (!displayText(t)) return { error: 'The title has no usable characters.' };
  return { entry: { title: t, url: v.url, description: d } };
}

module.exports = { MAX_TITLE, MAX_DESC, MAX_DISPLAY, cleanText, displayText, validateUrl, hasBlockedWord, screenEntry };
