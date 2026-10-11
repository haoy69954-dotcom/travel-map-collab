import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { lookup } from 'node:dns/promises';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const localEnvFile = path.join(root, '.env.local');
if (fs.existsSync(localEnvFile)) {
  for (const line of fs.readFileSync(localEnvFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
const amapKey = process.env.AMAP_JS_KEY || '';
const amapSecurityCode = process.env.AMAP_SECURITY_CODE || '';
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const dataFile = path.join(dataDir, 'state.json');
const authFile = path.join(dataDir, 'auth.json');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const clients = new Map();
const presence = new Map();
const scrypt = promisify(crypto.scrypt);
const sessionAge = 30 * 24 * 60 * 60 * 1000;
const loginAttempts = new Map();

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function demo() {
  const time = now();
  const members = [
    { id: 'demo-m1', name: '小满', color: '#e4936d', joinedAt: time },
    { id: 'demo-m2', name: '阿澈', color: '#769b89', joinedAt: time },
    { id: 'demo-m3', name: '之之', color: '#9a8bc3', joinedAt: time }
  ];
  return {
    trips: {
      'demo-kyoto': {
        id: 'demo-kyoto', title: '秋天去京都', destination: '日本 · 京都', center: [35.0105, 135.7798], zoom: 13,
        startDate: '2026-11-07', endDate: '2026-11-09', dayCount: 3, dayHotels: {}, legModes: {},
        createdAt: time, revision: 1, members,
        places: [
          { id: 'demo-p1', name: '清水寺', lat: 34.9949, lng: 135.7850, category: '景点', address: '京都市东山区清水 1-294', openingHours: '请出行前确认', costNote: '', reason: '想在清晨人少的时候去，顺路走二年坂。', sourceUrl: '', authorId: 'demo-m1', status: 'scheduled', dayIndex: 1, routeOrder: 0, createdAt: time, votes: { 'demo-m1': 'want', 'demo-m2': 'want' }, comments: [
            { id: 'demo-c1', authorId: 'demo-m2', text: '赞成！我们可以早点出门，避开人流。', createdAt: time }
          ] },
          { id: 'demo-p2', name: '鸭川河畔', lat: 35.0083, lng: 135.7713, category: '散步', address: '京都市鸭川沿岸', openingHours: '全天开放', costNote: '免费', reason: '傍晚沿着河边走走，给行程留一点空白。', sourceUrl: '', authorId: 'demo-m2', status: 'idea', dayIndex: null, routeOrder: null, createdAt: time, votes: { 'demo-m2': 'want', 'demo-m3': 'maybe' }, comments: [] },
          { id: 'demo-p3', name: '锦市场', lat: 35.0050, lng: 135.7648, category: '美食', address: '京都市中京区锦小路通', openingHours: '各店铺营业时间不同', costNote: '', reason: '大家可以各自挑喜欢吃的。', sourceUrl: '', authorId: 'demo-m3', status: 'scheduled', dayIndex: 1, routeOrder: 1, createdAt: time, votes: { 'demo-m1': 'want', 'demo-m3': 'want' }, comments: [
            { id: 'demo-c2', authorId: 'demo-m1', text: '周六中午在这里吃怎么样？', createdAt: time }
          ] }
        ],
        messages: [
          { id: 'demo-g1', authorId: 'demo-m1', text: '这次我们就在这里一起做攻略吧！看到想去的地方直接标在地图上。', placeId: '', createdAt: time },
          { id: 'demo-g2', authorId: 'demo-m2', text: '我提了鸭川，想留一个不用赶路的傍晚。', placeId: 'demo-p2', createdAt: time },
          { id: 'demo-g3', authorId: 'demo-m3', text: '锦市场先放到周六，大家觉得合适吗？', placeId: 'demo-p3', createdAt: time }
        ],
        activity: [{ id: id(), authorId: 'demo-m3', text: '把锦市场安排在 11 月 7 日', createdAt: time }]
      }
    }
  };
}

fs.mkdirSync(dataDir, { recursive: true });
let auth = fs.existsSync(authFile) ? JSON.parse(fs.readFileSync(authFile, 'utf8')) : { users: [], sessions: [] };
auth.users ||= [];
auth.sessions ||= [];
function saveAuth() {
  const temp = `${authFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(auth, null, 2), { mode: 0o600 });
  fs.renameSync(temp, authFile);
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }; }
function memberForUser(trip, user) { return user && trip.members.find(m => m.userId === user.id); }
function sessionToken(req) { return (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('travel_session='))?.slice('travel_session='.length) || ''; }
function sessionHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function currentUser(req) {
  const token = sessionToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = auth.sessions.find(item => item.hash === sessionHash(token) && item.expiresAt > Date.now());
  return session ? auth.users.find(user => user.id === session.userId) || null : null;
}
function setSession(res, user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  auth.sessions = auth.sessions.filter(item => item.expiresAt > Date.now());
  auth.sessions.push({ hash: sessionHash(token), userId: user.id, expiresAt: Date.now() + sessionAge });
  saveAuth();
  const secure = req.socket.encrypted || (req.headers.origin && new URL(req.headers.origin).protocol === 'https:');
  res.setHeader('set-cookie', `travel_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionAge / 1000}${secure ? '; Secure' : ''}`);
}
async function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
async function passwordMatches(password, encoded) {
  const [, salt, expectedHex] = String(encoded || '').split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(expectedHex || '')) return false;
  const actual = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expectedHex, 'hex'));
}
function authRequired(req, res) {
  const user = currentUser(req);
  if (!user) fail(res, 401, '请先登录账号');
  return user;
}
async function handleAuth(req, res, parts) {
  if (parts[2] === 'me' && req.method === 'GET') return send(res, 200, { user: currentUser(req) ? publicUser(currentUser(req)) : null });
  if (parts[2] === 'trips' && req.method === 'GET') {
    const user = authRequired(req, res); if (!user) return;
    const trips = Object.values(state.trips).filter(trip => memberForUser(trip, user)).map(trip => ({ id: trip.id, title: trip.title, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, dayCount: trip.dayCount, joinedAt: memberForUser(trip, user).joinedAt })).sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
    return send(res, 200, { trips });
  }
  if (parts[2] === 'register' && req.method === 'POST') {
    const input = await body(req);
    const name = trimmed(input.name, 24), email = trimmed(input.email, 254).toLowerCase(), password = String(input.password || '');
    if (name.length < 2) return fail(res, 400, '昵称至少需要 2 个字');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, '请输入有效的邮箱地址');
    if (password.length < 10 || password.length > 128) return fail(res, 400, '密码需要 10 到 128 个字符');
    if (auth.users.some(user => user.email === email)) return fail(res, 409, '这个邮箱已经注册，请直接登录');
    const hashed = await passwordHash(password);
    if (auth.users.some(user => user.email === email)) return fail(res, 409, '这个邮箱已经注册，请直接登录');
    const user = { id: id(), name, email, passwordHash: hashed, createdAt: now() };
    auth.users.push(user); saveAuth(); setSession(res, user, req);
    return send(res, 201, { user: publicUser(user) });
  }
  if (parts[2] === 'login' && req.method === 'POST') {
    const input = await body(req);
    const email = trimmed(input.email, 254).toLowerCase(), password = String(input.password || '');
    const key = `${req.socket.remoteAddress}:${email}`;
    const attempts = (loginAttempts.get(key) || []).filter(time => time > Date.now() - 10 * 60_000);
    if (attempts.length >= 8) return fail(res, 429, '尝试次数过多，请 10 分钟后再试');
    const user = auth.users.find(item => item.email === email);
    if (!user || !await passwordMatches(password, user.passwordHash)) {
      attempts.push(Date.now()); loginAttempts.set(key, attempts);
      return fail(res, 401, '邮箱或密码不正确');
    }
    loginAttempts.delete(key); setSession(res, user, req);
    return send(res, 200, { user: publicUser(user) });
  }
  if (parts[2] === 'logout' && req.method === 'POST') {
    const token = sessionToken(req);
    const user = currentUser(req);
    auth.sessions = auth.sessions.filter(item => item.hash !== sessionHash(token)); saveAuth();
    if (user) for (const trip of Object.values(state.trips)) {
      const member = memberForUser(trip, user);
      if (member && presence.get(trip.id)?.delete(member.id)) publish(trip.id, 'presence', { online: online(trip.id) });
    }
    res.setHeader('set-cookie', 'travel_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  return fail(res, 404, '接口不存在');
}
let state = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : demo();
let migrated = false;
for (const trip of Object.values(state.trips || {})) {
  if (!trip.dayHotels || typeof trip.dayHotels !== 'object') { trip.dayHotels = {}; migrated = true; }
  if (!trip.legModes || typeof trip.legModes !== 'object') { trip.legModes = {}; migrated = true; }
  if (!Number.isInteger(trip.dayCount)) { trip.dayCount = 3; migrated = true; }
  if (trip.startDate === undefined) {
    trip.startDate = trip.places.map(p => p.day).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort()[0] || '';
    migrated = true;
  }
  if (trip.endDate === undefined) {
    trip.endDate = Number.isFinite(dayNumber(trip.startDate)) ? new Date((dayNumber(trip.startDate) + trip.dayCount - 1) * 86_400_000).toISOString().slice(0, 10) : '';
    migrated = true;
  }
  for (const p of trip.places) {
    if (p.dayIndex === undefined) {
      const offset = p.day && trip.startDate ? Math.round((Date.parse(`${p.day}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86_400_000) : -1;
      p.dayIndex = offset >= 0 ? Math.min(offset + 1, trip.dayCount) : null;
      if (p.status === 'scheduled' && !p.dayIndex) p.status = 'selected';
      migrated = true;
    }
    if (p.category === '住宿') { p.category = '酒店'; migrated = true; }
    if (p.routeOrder === undefined) { p.routeOrder = p.dayIndex ? trip.places.filter(other => other.dayIndex === p.dayIndex && other !== p).length : null; migrated = true; }
    for (const field of ['address', 'openingHours', 'costNote']) if (p[field] === undefined) { p[field] = ''; migrated = true; }
    if (trip.id === 'demo-kyoto') {
      const example = {
        'demo-p1': ['京都市东山区清水 1-294', '请出行前确认', ''],
        'demo-p2': ['京都市鸭川沿岸', '全天开放', '免费'],
        'demo-p3': ['京都市中京区锦小路通', '各店铺营业时间不同', '']
      }[p.id];
      if (example) ['address', 'openingHours', 'costNote'].forEach((field, index) => { if (!p[field] && example[index]) { p[field] = example[index]; migrated = true; } });
    }
  }
  if (migrated) {
    for (let day = 1; day <= trip.dayCount; day++) {
      trip.places.filter(p => p.dayIndex === day).sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0)).forEach((p, index) => { p.routeOrder = index; });
    }
  }
}
function save() {
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, dataFile);
}
if (!fs.existsSync(dataFile) || migrated) save();

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
function fail(res, code, error) { send(res, code, { error }); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error('请求内容过长');
  }
  return JSON.parse(raw || '{}');
}
function trimmed(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / 86_400_000 : NaN;
}
function publicUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } }
function isPlatformArtwork(value, site) {
  try {
    const url = new URL(value);
    return site === '小红书' && url.hostname === 'picasso-static.xiaohongshu.com' && url.pathname.startsWith('/fe-platform/');
  } catch { return false; }
}
function sourceSite(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'xhslink.com' || host.endsWith('.xhslink.com') || host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) return '小红书';
  if (host === 'dianping.com' || host.endsWith('.dianping.com')) return '大众点评';
  return '';
}
function decodeEntities(value = '') {
  return String(value).replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (entity[0] === '#') { const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10); return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match; }
    return names[entity.toLowerCase()] || match;
  }).replace(/\s+/g, ' ').trim();
}
function metaValue(html, keys) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(([, key, , value]) => [key.toLowerCase(), decodeEntities(value)]));
    if (keys.includes(attrs.property || attrs.name || '')) return attrs.content || '';
  }
  return '';
}
function structuredPlace(html) {
  for (const [, raw] of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(raw);
      const candidates = [parsed, ...(Array.isArray(parsed) ? parsed : []), ...(parsed['@graph'] || [])];
      const item = candidates.find(value => value && /Restaurant|Hotel|LodgingBusiness|LocalBusiness|TouristAttraction/i.test([value['@type']].flat().join(' ')));
      if (item) return item;
    } catch { /* The page may not expose usable structured data. */ }
  }
  return {};
}
function xhsPostImage(html, pageUrl) {
  // The public mobile page renders note photos as image tags. Desktop metadata
  // usually exposes only Xiaohongshu's generic platform artwork.
  for (const [, tag] of html.matchAll(/(<img\b[^>]*>)/gi)) {
    if (!/\b(?:data-xhs-img|class=["'][^"']*\blive-img\b)/i.test(tag)) continue;
    const raw = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!raw) continue;
    try {
      const url = new URL(decodeEntities(raw), pageUrl);
      if (['http:', 'https:'].includes(url.protocol) && /(^|\.)xhscdn\.com$/.test(url.hostname)) {
        url.protocol = 'https:';
        return url.href;
      }
    } catch { /* Try another image. */ }
  }
  return '';
}
function isPrivateAddress(address) {
  const a = address.toLowerCase();
  return a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80:') || a.startsWith('127.') || a.startsWith('10.') || a.startsWith('192.168.') || a.startsWith('169.254.') || a === '0.0.0.0' || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
}
async function fetchSourcePreview(value) {
  let current = publicUrl(value);
  if (!current || !sourceSite(new URL(current).hostname)) throw new Error('请粘贴小红书或大众点评链接');
  const original = current, unavailable = () => ({ url: original, site: sourceSite(new URL(original).hostname), title: '', description: '', image: '', address: '', openingHours: '', costNote: '', available: false });
  for (let redirect = 0; redirect < 5; redirect++) {
    const url = new URL(current);
    if (!sourceSite(url.hostname)) throw new Error('链接跳转到了不支持的网站');
    if (/\/(?:website-login|login|captcha|verify|security)(?:\/|$)/i.test(url.pathname)) return unavailable();
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) throw new Error('链接地址不可访问');
    const site = sourceSite(url.hostname);
    const headers = site === '小红书'
      ? { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'zh-CN,zh;q=0.9', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }
      : { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; TravelMapPreview/1.0)' };
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers });
    if ([301, 302, 303, 307, 308].includes(response.status)) { current = publicUrl(new URL(response.headers.get('location') || '', current).href); continue; }
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('原站没有开放可读取的帖子资料');
    let html = '';
    for await (const chunk of response.body) { html += Buffer.from(chunk).toString('utf8'); if (html.length > 700_000) break; }
    const structured = structuredPlace(html);
    const rawTitle = metaValue(html, ['og:title', 'twitter:title']) || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    if (/验证码|安全验证|登录|访问受限|captcha/i.test(rawTitle)) return unavailable();
    const title = /^小红书(?:\s*[-|｜]\s*你的生活兴趣社区)?\s*$/i.test(rawTitle) ? '' : trimmed(rawTitle.replace(/\s*[-|｜]\s*(小红书|大众点评).*$/i, ''), 100);
    const description = trimmed(metaValue(html, ['og:description', 'twitter:description', 'description']), 600);
    const imageCandidates = [site === '小红书' ? xhsPostImage(html, current) : '', metaValue(html, ['og:image']), metaValue(html, ['twitter:image']), ...[structured.image].flat().map(item => typeof item === 'string' ? item : item?.url || item?.contentUrl || '')];
    const image = imageCandidates.filter(Boolean).map(value => { try { return publicUrl(new URL(value, current).href); } catch { return ''; } }).find(value => value && !isPlatformArtwork(value, sourceSite(url.hostname))) || '';
    const address = structured.address || {};
    const addressText = typeof address === 'string' ? address : [address.streetAddress, address.addressLocality, address.addressRegion].filter(Boolean).join(' · ');
    const hours = typeof structured.openingHours === 'string' ? structured.openingHours : '';
    const price = typeof structured.priceRange === 'string' ? structured.priceRange : '';
    return { url: current, site: sourceSite(url.hostname), title, description, image, address: trimmed(addressText, 120), openingHours: trimmed(hours, 100), costNote: trimmed(price, 100), available: Boolean(title || description || image) };
  }
  throw new Error('链接跳转次数过多');
}
async function uploadImage(req, res, trip) {
  const user = authRequired(req, res); if (!user) return;
  if (!memberForUser(trip, user)) return fail(res, 403, '请先加入旅行');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 3_000_000) return fail(res, 413, '图片请小于 3 MB'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const ext = jpg ? 'jpg' : png ? 'png' : webp ? 'webp' : '';
  if (!ext) return fail(res, 400, '只支持 JPG、PNG 或 WebP 图片');
  const folder = path.join(dataDir, 'uploads'); fs.mkdirSync(folder, { recursive: true });
  const name = `${id()}.${ext}`; fs.writeFileSync(path.join(folder, name), bytes);
  return send(res, 201, { url: `/uploads/${name}` });
}
function coverValue(value) {
  const cover = trimmed(value, 800);
  if (!cover) return '';
  if (/^\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(cover)) return cover;
  return publicUrl(cover);
}
function sourceFields(input) {
  return { coverImage: coverValue(input.coverImage), sourceImage: publicUrl(trimmed(input.sourceImage, 800)), sourceTitle: trimmed(input.sourceTitle, 100), sourceDescription: trimmed(input.sourceDescription, 600), sourceSite: trimmed(input.sourceSite, 20) };
}
function place(trip, placeId) { return trip.places.find(p => p.id === placeId); }
function record(trip, actorId, text) {
  trip.activity.unshift({ id: id(), authorId: actorId, text, createdAt: now() });
  trip.activity = trip.activity.slice(0, 100);
}
function publish(tripId, event, payload = {}) {
  const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients.get(tripId) || []) client.write(line);
}
function changed(trip) {
  trip.revision += 1;
  save();
  publish(trip.id, 'change', { revision: trip.revision });
}
function online(tripId) {
  const active = presence.get(tripId) || new Map();
  const cutoff = Date.now() - 45_000;
  for (const [memberId, seen] of active) if (seen < cutoff) active.delete(memberId);
  return [...active.keys()];
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[1] === 'auth') return handleAuth(req, res, parts);
  if (parts[1] === 'maps' && parts[2] === 'config' && parts.length === 3 && req.method === 'GET') {
    return send(res, 200, { provider: amapKey && amapSecurityCode ? 'amap' : 'osm', key: amapKey });
  }
  if (parts[1] === 'trips' && parts.length === 2 && req.method === 'POST') {
    const user = authRequired(req, res); if (!user) return;
    const input = await body(req);
    const title = trimmed(input.title, 80);
    const destination = trimmed(input.destination, 100);
    if (!title) return fail(res, 400, '请填写旅行名称');
    const center = Array.isArray(input.center) && input.center.length === 2 ? input.center.map(Number) : [];
    if (center.length !== 2 || !center.every(Number.isFinite) || Math.abs(center[0]) > 90 || Math.abs(center[1]) > 180) return fail(res, 400, '请搜索并选择地图起点');
    const startDate = trimmed(input.startDate, 10);
    const endDate = trimmed(input.endDate, 10);
    const dayCount = dayNumber(endDate) - dayNumber(startDate) + 1;
    if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 30) return fail(res, 400, '请选择有效的开始和结束日期，旅行最长 30 天');
    const trip = { id: id(), title, destination, center, zoom: 12, startDate, endDate, dayCount, dayHotels: {}, legModes: {}, createdAt: now(), revision: 1, members: [{ id: id(), userId: user.id, name: user.name, color: '#e4936d', joinedAt: now() }], places: [], messages: [], activity: [] };
    state.trips[trip.id] = trip;
    save();
    return send(res, 201, { trip });
  }
  const tripId = parts[2];
  const trip = state.trips[tripId];
  if (!trip) return fail(res, 404, '找不到这趟旅行');
  if (parts[3] === 'link-preview' && req.method === 'GET') {
    try { return send(res, 200, await fetchSourcePreview(url.searchParams.get('url') || '')); }
    catch (error) { return fail(res, 422, error.message || '无法读取链接资料'); }
  }
  if (parts[3] === 'images' && req.method === 'POST') return uploadImage(req, res, trip);
  if (parts[3] === 'maps' && parts[4] === 'config' && req.method === 'GET') return send(res, 200, { provider: amapKey && amapSecurityCode ? 'amap' : 'osm', key: amapKey });
  if (parts.length === 3 && req.method === 'GET') return send(res, 200, { trip });
  if (parts[3] === 'events' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`event: ready\ndata: ${JSON.stringify({ revision: trip.revision, online: online(tripId) })}\n\n`);
    if (!clients.has(tripId)) clients.set(tripId, new Set());
    clients.get(tripId).add(res);
    const keepalive = setInterval(() => res.write(': heartbeat\n\n'), 20_000);
    req.on('close', () => { clearInterval(keepalive); clients.get(tripId)?.delete(res); });
    return;
  }
  if (parts[3] === 'join' && req.method === 'POST') {
    const user = authRequired(req, res); if (!user) return;
    const existing = memberForUser(trip, user);
    if (existing) return send(res, 200, { member: existing });
    const colors = ['#e4936d', '#769b89', '#9a8bc3', '#d6a253', '#6e9eb7', '#d78399'];
    const newMember = { id: id(), userId: user.id, name: user.name, color: colors[trip.members.length % colors.length], joinedAt: now() };
    trip.members.push(newMember);
    record(trip, newMember.id, '加入了这趟旅行');
    changed(trip);
    return send(res, 201, { member: newMember });
  }
  if (parts[3] === 'presence' && req.method === 'POST') {
    const user = authRequired(req, res); if (!user) return;
    const actor = memberForUser(trip, user);
    if (!actor) return fail(res, 403, '请先加入旅行');
    if (!presence.has(tripId)) presence.set(tripId, new Map());
    presence.get(tripId).set(actor.id, Date.now());
    publish(tripId, 'presence', { online: online(tripId) });
    return send(res, 200, { online: online(tripId) });
  }
  if (parts[3] === 'actions' && req.method === 'POST') {
    const user = authRequired(req, res); if (!user) return;
    const input = await body(req);
    const actor = memberForUser(trip, user);
    if (!actor) return fail(res, 403, '请先加入旅行');
    const action = input.action;
    const p = place(trip, input.placeId);
    if (action === 'update-trip-dates') {
      const startDate = trimmed(input.startDate, 10), endDate = trimmed(input.endDate, 10);
      const dayCount = dayNumber(endDate) - dayNumber(startDate) + 1;
      if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 30) return fail(res, 400, '请选择有效的开始和结束日期，旅行最长 30 天');
      const latestPlaceDay = Math.max(0, ...trip.places.map(item => Number(item.dayIndex) || 0));
      const latestHotelDay = Math.max(0, ...Object.entries(trip.dayHotels).filter(([, hotels]) => hotels.start || hotels.end).map(([day]) => Number(day) || 0));
      if (dayCount < Math.max(latestPlaceDay, latestHotelDay)) return fail(res, 400, `Day ${Math.max(latestPlaceDay, latestHotelDay)} 已有行程，请先调整这些地点或延长结束日期`);
      trip.startDate = startDate; trip.endDate = endDate; trip.dayCount = dayCount;
      record(trip, actor.id, `设置了 ${startDate} 至 ${endDate} 的旅行日期`);
      changed(trip);
      return send(res, 200, { ok: true, dayCount });
    }
    if (action === 'reorder-day') {
      const dayIndex = Number(input.dayIndex);
      if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > trip.dayCount || !Array.isArray(input.placeIds)) return fail(res, 400, '路线顺序无效');
      const scheduled = trip.places.filter(item => item.dayIndex === dayIndex && item.status !== 'archived');
      const ids = input.placeIds;
      if (ids.length !== scheduled.length || new Set(ids).size !== ids.length || ids.some(id => !scheduled.some(item => item.id === id))) return fail(res, 400, '路线已变化，请重新预览');
      ids.forEach((id, order) => { scheduled.find(item => item.id === id).routeOrder = order; });
      record(trip, actor.id, `顺路调整了 Day ${dayIndex} 的地点顺序`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'day-hotel') {
      const dayIndex = Number(input.dayIndex);
      const role = input.role;
      const hotelId = trimmed(input.hotelId, 100);
      if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > trip.dayCount || !['start', 'end'].includes(role)) return fail(res, 400, '酒店安排无效');
      const hotel = hotelId ? place(trip, hotelId) : null;
      if (hotelId && (!hotel || hotel.category !== '酒店' || hotel.status === 'archived')) return fail(res, 400, '请选择有效酒店');
      trip.dayHotels[dayIndex] ||= { start: '', end: '' };
      trip.dayHotels[dayIndex][role] = hotelId;
      record(trip, actor.id, `${hotel ? `将「${hotel.name}」设为` : '清除了'} Day ${dayIndex} ${role === 'start' ? '出发' : '结束'}酒店`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'confirm-hotel-day') {
      const dayIndex = Number(input.dayIndex);
      const hotel = p;
      if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > trip.dayCount || !hotel || hotel.category !== '酒店' || hotel.status === 'archived') return fail(res, 400, '酒店安排无效');
      const assignment = trip.dayHotels[dayIndex] ||= { start: '', end: '' };
      if (input.confirmed === false) {
        if (assignment.start === hotel.id) assignment.start = '';
        if (assignment.end === hotel.id) assignment.end = '';
      } else {
        assignment.start = hotel.id;
        assignment.end = hotel.id;
      }
      record(trip, actor.id, `${input.confirmed === false ? '取消了' : '确认了'}「${hotel.name}」在 Day ${dayIndex} 的住宿安排`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'set-leg-mode') {
      const dayIndex = Number(input.dayIndex), fromId = trimmed(input.fromId, 100), toId = trimmed(input.toId, 100), mode = input.mode;
      if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > trip.dayCount || !['drive', 'walk', 'transit'].includes(mode)) return fail(res, 400, '交通方式无效');
      const stops = trip.places.filter(item => item.dayIndex === dayIndex && item.status !== 'archived').sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
      const hotels = trip.dayHotels[dayIndex] || {};
      const start = place(trip, hotels.start), end = place(trip, hotels.end);
      const nodes = [...(start?.category === '酒店' && start.status !== 'archived' ? [start] : []), ...stops, ...(end?.category === '酒店' && end.status !== 'archived' ? [end] : [])];
      if (!nodes.some((node, index) => node.id === fromId && nodes[index + 1]?.id === toId)) return fail(res, 409, '路线已变化，请重新选择');
      trip.legModes[`${dayIndex}:${fromId}:${toId}`] = mode;
      record(trip, actor.id, `将 Day ${dayIndex}「${nodes.find(node => node.id === fromId).name} → ${nodes.find(node => node.id === toId).name}」设为${{ drive: '驾车', walk: '步行', transit: '公交' }[mode]}`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'add-place') {
      const name = trimmed(input.name, 80);
      const lat = Number(input.lat), lng = Number(input.lng);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail(res, 400, '请填写地点名称并在地图上选择位置');
      const sourceUrl = trimmed(input.sourceUrl, 500);
      if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return fail(res, 400, '参考链接需要以 http 或 https 开头');
      const newPlace = { id: id(), name, lat, lng, category: trimmed(input.category, 20) || '其他', address: trimmed(input.address, 120), openingHours: trimmed(input.openingHours, 100), costNote: trimmed(input.costNote, 100), reason: trimmed(input.reason, 500), sourceUrl, ...sourceFields(input), authorId: actor.id, status: 'idea', dayIndex: null, routeOrder: null, createdAt: now(), votes: {}, comments: [] };
      trip.places.push(newPlace);
      record(trip, actor.id, `提出了「${name}」`);
      changed(trip);
      return send(res, 201, { place: newPlace });
    }
    if (action === 'message') {
      const text = trimmed(input.text, 1000);
      if (!text) return fail(res, 400, '消息不能为空');
      if (input.placeId && !p) return fail(res, 404, '关联地点不存在');
      trip.messages.push({ id: id(), authorId: actor.id, text, placeId: p?.id || '', createdAt: now() });
      changed(trip);
      return send(res, 201, { ok: true });
    }
    if (!p) return fail(res, 404, '地点不存在');
    if (action === 'refresh-comment-source-photo') {
      const comment = p.comments.find(item => item.id === input.commentId);
      const source = publicUrl(comment?.sourceUrl);
      if (!source || sourceSite(new URL(source).hostname) !== '小红书') return fail(res, 400, '评论没有小红书帖子');
      const preview = await fetchSourcePreview(source);
      if (!preview.image || !/(^|\.)xhscdn\.com$/.test(new URL(preview.image).hostname)) return send(res, 200, { updated: false });
      comment.sourceImage = preview.image;
      if (!comment.sourceTitle && preview.title) comment.sourceTitle = preview.title;
      if (!comment.sourceDescription && preview.description) comment.sourceDescription = preview.description;
      changed(trip);
      return send(res, 200, { updated: true });
    }
    if (action === 'refresh-source-photo') {
      const source = publicUrl(p.sourceUrl);
      if (!source || sourceSite(new URL(source).hostname) !== '小红书') return fail(res, 400, '地点没有小红书来源');
      const preview = await fetchSourcePreview(source);
      if (!preview.image || !/(^|\.)xhscdn\.com$/.test(new URL(preview.image).hostname)) return send(res, 200, { updated: false });
      const oldSourceImage = p.sourceImage;
      p.sourceImage = preview.image;
      if (!p.coverImage || p.coverImage === oldSourceImage || isPlatformArtwork(p.coverImage, '小红书')) p.coverImage = preview.image;
      p.sourceSite = '小红书';
      changed(trip);
      return send(res, 200, { updated: true });
    }
    if (action === 'set-cover') {
      const cover = trimmed(input.coverImage, 800);
      if (!/^\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(cover)) return fail(res, 400, '请先上传 JPG、PNG 或 WebP 照片');
      p.coverImage = cover;
      record(trip, actor.id, `更新了「${p.name}」的封面照片`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'comment') {
      const text = trimmed(input.text, 1000);
      const sourceUrl = publicUrl(trimmed(input.sourceUrl, 800));
      if (!text && !sourceUrl) return fail(res, 400, '写一点想法或添加一篇帖子');
      if (sourceUrl && !sourceSite(new URL(sourceUrl).hostname)) return fail(res, 400, '帖子链接仅支持小红书或大众点评');
      if (input.sourceUrl && !sourceUrl) return fail(res, 400, '帖子链接无效');
      p.comments.push({ id: id(), authorId: actor.id, text, createdAt: now(), sourceUrl, sourceTitle: sourceUrl ? trimmed(input.sourceTitle, 100) : '', sourceDescription: sourceUrl ? trimmed(input.sourceDescription, 600) : '', sourceImage: sourceUrl ? publicUrl(trimmed(input.sourceImage, 800)) : '', sourceSite: sourceUrl ? sourceSite(new URL(sourceUrl).hostname) : '' });
      changed(trip);
      return send(res, 201, { ok: true });
    }
    if (action === 'vote') {
      if (!['want', 'maybe', 'pass', ''].includes(input.value)) return fail(res, 400, '表态无效');
      if (input.value) p.votes[actor.id] = input.value;
      else delete p.votes[actor.id];
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'status') {
      if (!['idea', 'selected', 'scheduled', 'visited', 'archived'].includes(input.status)) return fail(res, 400, '状态无效');
      if (p.category === '酒店' && input.status === 'scheduled') return fail(res, 400, '酒店请在每日路线中安排');
      if (input.status === 'scheduled' && !p.dayIndex) return fail(res, 400, '请先选择 Day');
      const previousDay = p.dayIndex;
      p.status = input.status;
      if (p.category === '酒店' && p.status === 'archived') for (const hotel of Object.values(trip.dayHotels)) for (const role of ['start', 'end']) if (hotel[role] === p.id) hotel[role] = '';
      if (p.status !== 'scheduled' && p.status !== 'visited') { p.dayIndex = null; p.routeOrder = null; }
      if (previousDay && !p.dayIndex) trip.places.filter(item => item.dayIndex === previousDay).sort((a, b) => a.routeOrder - b.routeOrder).forEach((item, index) => { item.routeOrder = index; });
      record(trip, actor.id, `将「${p.name}」设为${{ idea: '提议', selected: '已选', scheduled: '已安排', visited: '已去过', archived: '已归档' }[p.status]}`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'day') {
      if (p.category === '酒店') return fail(res, 400, '酒店请在每天的起终点中安排');
      const dayIndex = input.dayIndex === null || input.dayIndex === '' ? null : Number(input.dayIndex);
      if (dayIndex !== null && (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > trip.dayCount)) return fail(res, 400, 'Day 无效');
      const previousDay = p.dayIndex;
      const remaining = dayIndex === null ? [] : trip.places.filter(other => other.id !== p.id && other.dayIndex === dayIndex).sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
      const insertion = Number.isInteger(Number(input.insertAt)) ? Math.max(0, Math.min(remaining.length, Number(input.insertAt))) : remaining.length;
      p.dayIndex = dayIndex;
      if (dayIndex === null) p.routeOrder = null;
      else { remaining.splice(insertion, 0, p); remaining.forEach((item, order) => { item.routeOrder = order; }); }
      if (previousDay && previousDay !== dayIndex) trip.places.filter(item => item.dayIndex === previousDay).sort((a, b) => a.routeOrder - b.routeOrder).forEach((item, index) => { item.routeOrder = index; });
      p.status = p.status === 'visited' ? 'visited' : (dayIndex ? 'scheduled' : 'selected');
      record(trip, actor.id, dayIndex ? `将「${p.name}」安排进 Day ${dayIndex}` : `将「${p.name}」移出行程`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'reorder') {
      if (!p.dayIndex || !['up', 'down'].includes(input.direction)) return fail(res, 400, '无法调整顺序');
      const sameDay = trip.places.filter(item => item.dayIndex === p.dayIndex).sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
      const index = sameDay.findIndex(item => item.id === p.id);
      const next = input.direction === 'up' ? index - 1 : index + 1;
      if (next < 0 || next >= sameDay.length) return send(res, 200, { ok: true });
      [sameDay[index], sameDay[next]] = [sameDay[next], sameDay[index]];
      sameDay.forEach((item, order) => { item.routeOrder = order; });
      record(trip, actor.id, `调整了 Day ${p.dayIndex} 中「${p.name}」的顺序`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    if (action === 'update-place') {
      const name = trimmed(input.name, 80);
      const sourceUrl = trimmed(input.sourceUrl, 500);
      if (!name) return fail(res, 400, '地点名称不能为空');
      if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return fail(res, 400, '参考链接需要以 http 或 https 开头');
      const category = trimmed(input.category, 20) || '其他';
      if (p.category === '酒店' && category !== '酒店' && Object.values(trip.dayHotels).some(h => h.start === p.id || h.end === p.id)) return fail(res, 400, '请先从每日路线移除这家酒店');
      if (category === '酒店' && p.dayIndex) return fail(res, 400, '请先将地点移出 Day 再改为酒店');
      Object.assign(p, { name, category, address: trimmed(input.address, 120), openingHours: trimmed(input.openingHours, 100), costNote: trimmed(input.costNote, 100), reason: trimmed(input.reason, 500), sourceUrl, ...sourceFields(input) });
      record(trip, actor.id, `补充了「${p.name}」的地点信息`);
      changed(trip);
      return send(res, 200, { ok: true });
    }
    return fail(res, 400, '未知操作');
  }
  return fail(res, 404, '接口不存在');
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
async function proxyAmap(req, res, url) {
  if (req.method !== 'GET' || !amapSecurityCode) return fail(res, 404, '地图服务不可用');
  const suffix = url.pathname.slice('/_AMapService/'.length);
  if (!/^(v3\/(direction|place|geocode)\/|v4\/(direction|map\/styles)|v5\/direction\/)/.test(suffix)) return fail(res, 404, '地图服务不可用');
  const target = new URL(`https://restapi.amap.com/${suffix}`);
  for (const [key, value] of url.searchParams) if (key !== 'jscode') target.searchParams.append(key, value);
  target.searchParams.set('jscode', amapSecurityCode);
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(12_000) });
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { fail(res, 502, '高德服务暂时不可用'); }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) return fail(res, 403, '请求来源无效');
    }
    if (url.pathname.startsWith('/_AMapService/')) return await proxyAmap(req, res, url);
    if (req.method === 'GET' && /^\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(url.pathname)) {
      const file = path.join(dataDir, url.pathname.slice(1));
      if (!fs.existsSync(file)) return fail(res, 404, '图片不存在');
      res.writeHead(200, { 'content-type': mime[path.extname(file)], 'cache-control': 'public, max-age=86400' });
      return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(publicDir, relative);
    if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, '页面不存在');
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    fail(res, 400, error.message || '请求失败');
  }
});
server.listen(port, host, () => console.log(`旅伴地图已启动：http://${host}:${port}`));

setInterval(() => {
  for (const tripId of presence.keys()) publish(tripId, 'presence', { online: online(tripId) });
}, 20_000);
