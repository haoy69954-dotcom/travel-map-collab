const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const routeColors = ['#d66c4c', '#398b78', '#7967b3', '#bd8540', '#3e84b6', '#ad5e91', '#7b9a35', '#b85e69', '#588eac', '#946f3a', '#4c9b9a', '#986caa', '#ae744a', '#617fc0'];
function dayColor(day) { return routeColors[day - 1] || `hsl(${Math.round((day * 137.508) % 360)} 53% 46%)`; }
const categories = { 景点: '⛩️', 美食: '🍜', 咖啡: '☕', 散步: '🌿', 购物: '🛍️', 酒店: '🛏️', 其他: '📍' };
const categoryKinds = { 美食: 'eat', 咖啡: 'eat', 景点: 'play', 散步: 'play', 购物: 'play', 酒店: 'hotel' };
function placeKind(p) { return categoryKinds[p.category] || 'other'; }
function savedPanelWidth(key, fallback) { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value > 0 ? value : fallback; }
const cities = {
  京都: [35.0105, 135.7798], 东京: [35.6762, 139.6503], 大阪: [34.6937, 135.5023], 上海: [31.2304, 121.4737], 北京: [39.9042, 116.4074],
  首尔: [37.5665, 126.9780], 台北: [25.0330, 121.5654], 香港: [22.3193, 114.1694], 曼谷: [13.7563, 100.5018], 巴黎: [48.8566, 2.3522], 伦敦: [51.5072, -0.1276]
};
const state = {
  tripId: new URLSearchParams(location.search).get('trip') || '', trip: null, user: null, memberId: '', pendingAuthAction: '', selectedPlaceId: '',
  sideView: 'places', rightMode: 'group', openPlaceIds: [], placeDrafts: new Map(), leftCollapsed: false, rightCollapsed: false, leftWidth: savedPanelWidth('travel-left-width', 310), rightWidth: savedPanelWidth('travel-right-width', 366), scheduleOpen: false, unreadCount: 0, filter: 'all', search: '', online: [], map: null, markers: null, routes: null,
  mapDay: 'all', routePreview: null, eventSource: null, connection: 'connecting', drafts: { group: '', place: '', placeLink: '' }, mobile: 'map', toastTimer: null,
  provider: 'osm', mapConfig: null, addMode: '', markerOverlays: [], routeOverlays: [], routeCache: new Map(), legCache: new Map(), cityCache: new Map(), poiResults: [], addPoiResults: [], tripOriginResults: [], photoRefreshAttempted: new Map(), commentPhotoRefreshAttempted: new Map()
};

function currentMember() { return state.trip?.members.find(m => m.id === state.memberId); }
function memberById(id) { return state.trip?.members.find(m => m.id === id) || { id, name: '旅行伙伴', color: '#9aa99c' }; }
function selectedPlace() { return state.trip?.places.find(p => p.id === state.selectedPlaceId); }
function placeDraft(id) { if (!state.placeDrafts.has(id)) state.placeDrafts.set(id, { text: '', link: '' }); return state.placeDrafts.get(id); }
function isPhone() { return navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
function groupVisible() { return !$('#appShell').hidden && !state.scheduleOpen && $('#modalRoot').hidden && state.rightMode === 'group' && (window.innerWidth <= 900 ? state.mobile === 'chat' : !state.rightCollapsed) && document.visibilityState === 'visible'; }
function unreadKey() { return `travel-group-read:${state.tripId}:${state.memberId}`; }
function updateUnread() {
  if (!state.trip || !state.memberId) return;
  const messages = state.trip.messages || [], key = unreadKey(), latest = messages.at(-1)?.id || '';
  let marker = localStorage.getItem(key);
  if (marker === null || groupVisible()) { marker = latest; localStorage.setItem(key, marker); }
  const lastIndex = messages.findIndex(message => message.id === marker);
  state.unreadCount = messages.slice(lastIndex + 1).filter(message => message.authorId !== state.memberId).length;
  const label = state.unreadCount > 99 ? '99+' : String(state.unreadCount);
  for (const id of ['discussionToggleUnread', 'mobileChatUnread', 'groupTabUnread']) {
    const badge = document.getElementById(id); if (!badge) continue;
    badge.hidden = !state.unreadCount; badge.textContent = label;
  }
  $('#toggleDiscussionButton').setAttribute('aria-label', state.unreadCount ? `讨论面板，${state.unreadCount} 条未读消息` : state.rightCollapsed ? '展开讨论面板' : '收起讨论面板');
  document.title = `${state.unreadCount ? `(${label}) ` : ''}旅伴地图 · 一起把旅行聊出来`;
}
let openUiSelect = null;
function closeUiSelect() {
  if (!openUiSelect) return;
  openUiSelect.trigger.setAttribute('aria-expanded', 'false');
  openUiSelect.menu.remove(); openUiSelect = null;
}
function syncUiSelect(select) {
  const trigger = select.parentElement?.querySelector('[data-ui-select-trigger]');
  if (!trigger) return;
  const value = select.selectedOptions?.[0]?.textContent?.trim() || '请选择';
  trigger.querySelector('.ui-select-value').textContent = value;
  trigger.title = value;
}
function enhanceSelects(root = document) {
  if (openUiSelect && !openUiSelect.select.isConnected) closeUiSelect();
  root.querySelectorAll('select:not([data-ui-enhanced])').forEach(select => {
    if (select.multiple) return;
    select.dataset.uiEnhanced = 'true'; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const wrap = document.createElement('span'); wrap.className = 'ui-select';
    if (select.style.width) wrap.style.width = select.style.width;
    select.before(wrap); wrap.append(select);
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'ui-select-trigger'; trigger.dataset.uiSelectTrigger = 'true'; trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    const label = select.getAttribute('aria-label') || select.closest('label')?.firstChild?.textContent?.trim() || (select.id === 'messagePlace' ? '关联地点' : '选择选项');
    trigger.setAttribute('aria-label', label);
    trigger.innerHTML = '<span class="ui-select-value"></span><span class="ui-select-chevron" aria-hidden="true">⌄</span>';
    wrap.append(trigger); syncUiSelect(select);
  });
}
function showUiSelect(trigger) {
  const select = trigger.parentElement.querySelector('select');
  if (openUiSelect?.trigger === trigger) { closeUiSelect(); return; }
  closeUiSelect();
  const menu = document.createElement('div'); menu.className = 'ui-select-menu'; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
  [...select.options].forEach((option, index) => {
    const item = document.createElement('button'); item.type = 'button'; item.className = `ui-select-option${option.selected ? ' selected' : ''}`; item.dataset.uiOption = String(index); item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(option.selected)); item.disabled = option.disabled; item.textContent = option.textContent.trim(); menu.append(item);
  });
  document.body.append(menu);
  const rect = trigger.getBoundingClientRect(), width = Math.min(window.innerWidth - 24, Math.max(rect.width, 230));
  menu.style.width = `${width}px`; menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
  menu.style.top = `${rect.bottom + 5}px`;
  if (menu.getBoundingClientRect().bottom > window.innerHeight - 12 && rect.top > window.innerHeight - rect.bottom) menu.style.top = `${Math.max(12, rect.top - menu.offsetHeight - 5)}px`;
  trigger.setAttribute('aria-expanded', 'true'); openUiSelect = { select, trigger, menu };
  menu.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
}
function avatar(member, extra = '') {
  return `<span class="avatar ${extra} ${state.online.includes(member.id) ? 'online' : ''}" style="background:${escapeHtml(member.color)}" title="${escapeHtml(member.name)}">${escapeHtml(member.name.slice(0, 1))}</span>`;
}
function timeText(value) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }).format(new Date(value)); }
function dateText(value) { if (!value) return ''; const date = new Date(`${value}T12:00:00+08:00`); return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Shanghai' }).format(date); }
function dayDate(index) {
  if (!state.trip?.startDate) return '';
  const date = new Date(`${state.trip.startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index - 1);
  return date.toISOString().slice(0, 10);
}
function dayLabel(index) { return `Day ${index}${dayDate(index) ? ` · ${dateText(dayDate(index))}` : ''}`; }
function tripDayCount(start, end) { const first = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`); return start && end && Number.isFinite(first) && Number.isFinite(last) ? Math.round((last - first) / 86_400_000) + 1 : 0; }
function assignedHotelDays(p) { return Object.entries(state.trip?.dayHotels || {}).filter(([, hotels]) => hotels.start === p.id || hotels.end === p.id).map(([day]) => Number(day)).sort((a, b) => a - b); }
function planningLabel(p) { const days = p.category === '酒店' ? assignedHotelDays(p) : p.dayIndex ? [p.dayIndex] : []; return days.length ? days.map(day => `Day ${day}`).join(' · ') : '待定'; }
function dayPlaces(index) { return state.trip.places.filter(p => p.dayIndex === index && p.status !== 'archived').sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0)); }
function dayHotel(index, role) { return state.trip.places.find(p => p.id === state.trip.dayHotels?.[index]?.[role] && p.category === '酒店' && p.status !== 'archived'); }
function dayRoute(index, places = dayPlaces(index)) {
  const start = dayHotel(index, 'start'), end = dayHotel(index, 'end');
  return [...(start ? [start] : []), ...places, ...(end ? [end] : [])];
}
function dayLegs(day) {
  const nodes = dayRoute(day);
  return nodes.slice(1).map((to, index) => ({ from: nodes[index], to, day })).filter(({ from, to }) => from.id !== to.id);
}
function legMode(day, from, to) { return state.trip.legModes?.[`${day}:${from.id}:${to.id}`] || 'drive'; }
const modeLabels = { drive: '驾车', walk: '步行', transit: '公交' };
function legKey(leg) { return `${leg.from.id}:${leg.from.lat}:${leg.from.lng}>${leg.to.id}:${leg.to.lat}:${leg.to.lng}:${legMode(leg.day, leg.from, leg.to)}`; }
function kmBetween(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function routeKm(places) { return places.slice(1).reduce((sum, p, i) => sum + kmBetween(places[i], p), 0); }
function formatKm(km) { return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`; }
function routeNames(places) { return places.length ? places.map(p => p.name).join(' → ') : '暂无地点'; }
function bestInsertion(places, candidate, day) {
  let best = { index: 0, places: [candidate, ...places], km: Infinity };
  for (let index = 0; index <= places.length; index++) {
    const next = [...places.slice(0, index), candidate, ...places.slice(index)];
    const km = routeKm(day ? dayRoute(day, next) : next);
    if (km < best.km) best = { index, places: next, km };
  }
  return best;
}
function recommendedDay(p) {
  const candidates = Array.from({ length: state.trip.dayCount || 3 }, (_, i) => i + 1).map(day => {
    const existing = dayPlaces(day).filter(item => item.id !== p.id);
    const anchors = dayRoute(day, existing);
    return { day, anchored: anchors.length > 0, delta: bestInsertion(existing, p, day).km - routeKm(anchors) };
  });
  const anchored = candidates.filter(item => item.anchored && item.day !== p.dayIndex);
  return (anchored.length ? anchored : candidates).sort((a, b) => a.delta - b.delta || a.day - b.day)[0];
}
function optimizedDayPlaces(day) {
  const current = dayPlaces(day);
  if (current.length < 2) return current;
  const starts = dayHotel(day, 'start') ? [null] : current;
  let best = current, bestKm = routeKm(dayRoute(day, current));
  for (const start of starts) {
    const remaining = current.filter(p => p !== start), order = start ? [start] : [];
    while (remaining.length) {
      const last = order.at(-1) || dayHotel(day, 'start');
      const next = last ? remaining.reduce((a, b) => kmBetween(last, a) <= kmBetween(last, b) ? a : b) : remaining[0];
      order.push(next); remaining.splice(remaining.indexOf(next), 1);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
        const proposal = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (routeKm(dayRoute(day, proposal)) + 1e-6 < routeKm(dayRoute(day, order))) { order.splice(0, order.length, ...proposal); changed = true; }
      }
    }
    const km = routeKm(dayRoute(day, order));
    if (km + 1e-6 < bestKm) { best = order; bestKm = km; }
  }
  return best;
}
function safeUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function isPlatformArtwork(value) { try { const url = new URL(value); return url.hostname === 'picasso-static.xiaohongshu.com' && url.pathname.startsWith('/fe-platform/'); } catch { return false; } }
function safeImage(value) { return /^\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(value || '') ? value : isPlatformArtwork(value) ? '' : safeUrl(value); }
function needsSourcePhotoRefresh(p) {
  if (sourceSite(p.sourceUrl) !== '小红书' || /^\/uploads\//.test(p.coverImage || '')) return false;
  if (safeImage(p.coverImage) && p.coverImage !== p.sourceImage) return false;
  if (!safeImage(p.sourceImage)) return true;
  try {
    const url = new URL(p.sourceImage);
    if (!/(^|\.)xhscdn\.com$/.test(url.hostname)) return true;
    const stamp = url.pathname.match(/^\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\//);
    if (!stamp) return false;
    const issued = Date.parse(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:00+08:00`);
    return Number.isFinite(issued) && Date.now() - issued > 15 * 60_000;
  } catch { return true; }
}
function sourceSite(value) { try { const host = new URL(value).hostname; return /(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/.test(host) ? '小红书' : /(^|\.)dianping\.com$/.test(host) ? '大众点评' : '参考来源'; } catch { return '参考来源'; } }
function sourceLink(value) { return (String(value || '').match(/https?:\/\/[^\s<>"']+/i)?.[0] || '').replace(/[，。！）】\])]+$/, ''); }
function photoMarkup(p, size = 'small') {
  const image = safeImage(p.coverImage) || safeImage(p.sourceImage);
  return `<div class="place-photo ${size} kind-${placeKind(p)}"><span class="photo-symbol">${categories[p.category] || '📍'}</span>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(p.name)}的图片" loading="lazy" ${p.id ? `data-place-photo="${escapeHtml(p.id)}"` : ''} onerror="this.remove()">` : ''}</div>`;
}
function sourcePreviewMarkup(data) {
  const url = safeUrl(data.sourceUrl || data.url), image = safeImage(data.sourceImage || data.image);
  if (!url) return '';
  const site = data.sourceSite || data.site || sourceSite(url);
  return `<div class="source-post"><div class="source-post-image"><span>${site === '小红书' ? '📕' : '📍'}</span>${image ? `<img src="${escapeHtml(image)}" alt="来源帖子封面" loading="lazy" ${data.commentId ? `data-comment-photo="${escapeHtml(data.commentId)}" data-comment-place="${escapeHtml(data.commentPlaceId)}"` : ''} onerror="this.remove()">` : ''}</div><div class="source-post-copy"><small>${escapeHtml(site)} · 帖子预览</small><strong>${escapeHtml(data.sourceTitle || data.title || `${site}参考链接`)}</strong><p>${escapeHtml(data.sourceDescription || data.description || '原站暂未开放摘要，点击查看原帖。')}</p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a></div></div>`;
}
function mediaFields(p = {}) {
  return `<div class="source-paste"><label for="placeSource">小红书 / 大众点评链接</label><div class="source-input-row"><input class="field" id="placeSource" name="sourceUrl" type="text" value="${escapeHtml(p.sourceUrl || '')}" data-source-input placeholder="粘贴分享链接，自动读取公开资料"><button type="button" data-preview-source>读取</button></div><small>能读取的标题、封面、地址、时间和价格会带入，缺失时可自行补填。</small><div class="source-import-status" data-source-status></div><div class="source-import-preview" data-source-preview>${p.sourceUrl ? sourcePreviewMarkup(p) : ''}</div><details class="source-manual"><summary>补充帖子标题与重点</summary><input class="field" name="sourceTitle" value="${escapeHtml(p.sourceTitle || '')}" maxlength="100" placeholder="帖子标题（可选）"><textarea class="field" name="sourceDescription" maxlength="600" placeholder="原站无法读取时，可写下想和伙伴讨论的重点">${escapeHtml(p.sourceDescription || '')}</textarea></details></div><input type="hidden" name="coverImage" value="${escapeHtml(p.coverImage || '')}"><input type="hidden" name="sourceImage" value="${escapeHtml(p.sourceImage || '')}"><input type="hidden" name="sourceSite" value="${escapeHtml(p.sourceSite || '')}"><label for="placeCover">地点照片</label><div class="form-photo-preview" data-cover-preview>${photoMarkup(p, 'form')}</div><input class="field file-field" id="placeCover" type="file" accept="image/jpeg,image/png,image/webp" data-cover-upload><small class="form-help">可上传 JPG、PNG 或 WebP，最多 3 MB。没有照片时显示插画占位。</small>`;
}
function quickSourceFields() {
  return `<div class="quick-source"><label for="placeSource">攻略或点评链接</label><div class="source-input-row"><input class="field" id="placeSource" name="sourceUrl" type="text" data-source-input placeholder="粘贴小红书 / 大众点评链接"><button type="button" data-preview-source>读取</button></div><small>标题、图片和实用信息能读取时会自动带入；之后可在详情补充。</small><div class="source-import-status" data-source-status></div><div class="source-import-preview" data-source-preview></div></div><input type="hidden" name="address"><input type="hidden" name="openingHours"><input type="hidden" name="costNote"><input type="hidden" name="coverImage"><input type="hidden" name="sourceImage"><input type="hidden" name="sourceTitle"><input type="hidden" name="sourceDescription"><input type="hidden" name="sourceSite">`;
}
function revealQuickName(form) {
  const details = form.querySelector('[data-quick-name]');
  if (details) { details.open = true; form.elements.namedItem('name').focus(); }
}
function clearQuickImport(form) {
  if (form.id !== 'addPlaceForm') return;
  const oldImage = form.elements.namedItem('sourceImage').value;
  if (oldImage && form.elements.namedItem('coverImage').value === oldImage) form.elements.namedItem('coverImage').value = '';
  if (form.dataset.autoName && form.elements.namedItem('name').value === form.dataset.autoName) form.elements.namedItem('name').value = '';
  delete form.dataset.autoName;
  for (const field of ['address', 'openingHours', 'costNote', 'sourceImage', 'sourceTitle', 'sourceDescription', 'sourceSite']) form.elements.namedItem(field).value = '';
}
async function loadSourcePreview(input) {
  const form = input.closest('form'), raw = sourceLink(input.value), status = form.querySelector('[data-source-status]');
  if (!raw) { clearQuickImport(form); form.dataset.previewUrl = ''; status.textContent = ''; form.querySelector('[data-source-preview]').innerHTML = ''; return; }
  if (!['小红书', '大众点评'].includes(sourceSite(raw))) { if (form.dataset.previewUrl && form.dataset.previewUrl !== raw) { clearQuickImport(form); form.querySelector('[data-source-preview]').innerHTML = ''; form.dataset.previewUrl = ''; } status.textContent = '目前支持小红书和大众点评链接'; return; }
  const previous = form.dataset.previewUrl || sourceLink(input.defaultValue);
  if (previous && previous !== raw) {
    if (form.id === 'addPlaceForm') clearQuickImport(form);
    else {
      const oldImage = form.elements.namedItem('sourceImage').value;
      if (oldImage && form.elements.namedItem('coverImage').value === oldImage) form.elements.namedItem('coverImage').value = '';
      for (const field of ['sourceImage', 'sourceTitle', 'sourceDescription', 'sourceSite']) form.elements.namedItem(field).value = '';
    }
    form.querySelector('[data-source-preview]').innerHTML = '';
  }
  form.dataset.previewUrl = raw;
  status.textContent = '正在读取公开资料…';
  try {
    const data = await api(`/api/trips/${encodeURIComponent(state.tripId)}/link-preview?url=${encodeURIComponent(raw)}`);
    if (!form.isConnected || sourceLink(input.value) !== raw) return;
    input.value = data.url; form.dataset.previewUrl = sourceLink(data.url);
    if (!data.available && previous === raw && form.elements.namedItem('sourceTitle').value) { status.textContent = '原站暂时无法读取，已保留之前保存的帖子预览。'; return; }
    for (const [field, value] of [['name', data.title], ['address', data.address], ['openingHours', data.openingHours], ['costNote', data.costNote]]) {
      const target = form.elements.namedItem(field); if (target && !target.value.trim() && value) { target.value = value; if (field === 'name' && form.id === 'addPlaceForm') form.dataset.autoName = value; }
    }
    for (const [field, value] of [['sourceTitle', data.title], ['sourceDescription', data.description], ['sourceSite', data.site], ['sourceImage', data.image]]) if (value && !form.elements.namedItem(field).value) form.elements.namedItem(field).value = value;
    if (data.image && !safeImage(form.elements.namedItem('coverImage').value)) { form.elements.namedItem('coverImage').value = data.image; const coverPreview = form.querySelector('[data-cover-preview]'); if (coverPreview) coverPreview.innerHTML = photoMarkup({ category: form.elements.namedItem('category').value, name: form.elements.namedItem('name').value || '地点', coverImage: data.image }, 'form'); }
    form.querySelector('[data-source-preview]').innerHTML = sourcePreviewMarkup({ ...data, sourceTitle: form.elements.namedItem('sourceTitle').value, sourceDescription: form.elements.namedItem('sourceDescription').value });
    if (form.id === 'addPlaceForm' && data.title && !form.elements.namedItem('lat').value) {
      const locationInput = form.querySelector('[data-add-location-search]');
      locationInput.value = data.title;
      searchAddLocation(locationInput);
    }
    status.textContent = data.available ? '已带入可读取的资料。' : form.id === 'addPlaceForm' ? '链接已保存；暂时读不到帖子资料，请补一个地点名称。' : '链接可以保存；原站未开放可读取的帖子内容，可在下方补充重点。';
    if (!data.available) { const manual = form.querySelector('.source-manual'); if (manual) manual.open = true; if (form.id === 'addPlaceForm' && !form.elements.namedItem('name').value.trim()) revealQuickName(form); }
  } catch (error) { if (form.isConnected && sourceLink(input.value) === raw) { input.value = raw; status.textContent = form.id === 'addPlaceForm' ? '链接暂时无法读取，请补一个地点名称。' : `${error.message}。链接仍可保存，其他资料可手动补填。`; if (form.id === 'addPlaceForm' && !form.elements.namedItem('name').value.trim()) revealQuickName(form); } }
}
async function loadCommentPreview(input) {
  const form = input.closest('form'), raw = sourceLink(input.value), status = form.querySelector('[data-comment-source-status]'), card = form.querySelector('[data-comment-source-preview]');
  if (!raw) { form._commentPreview = null; status.textContent = ''; card.innerHTML = ''; return null; }
  if (!['小红书', '大众点评'].includes(sourceSite(raw))) { form._commentPreview = null; status.textContent = '支持小红书或大众点评链接'; card.innerHTML = ''; return null; }
  if (form._commentPreview?.url === raw) return form._commentPreview;
  status.textContent = '正在读取帖子…';
  try {
    const data = await api(`/api/trips/${encodeURIComponent(state.tripId)}/link-preview?url=${encodeURIComponent(raw)}`);
    if (!form.isConnected || sourceLink(input.value) !== raw) return null;
    form._commentPreview = data;
    card.innerHTML = sourcePreviewMarkup(data);
    status.textContent = data.available ? '帖子已附上，发送评论后伙伴都能查看。' : '已附上链接，原站暂时没有开放预览。';
    return data;
  } catch {
    if (form.isConnected && sourceLink(input.value) === raw) { form._commentPreview = { url: raw, site: sourceSite(raw) }; card.innerHTML = sourcePreviewMarkup(form._commentPreview); status.textContent = '预览暂时不可用，仍可发送链接。'; }
    return form._commentPreview;
  }
}
async function uploadCover(input) {
  const file = input.files?.[0], form = input.closest('form'); if (!file) return;
  if (file.size > 3_000_000) return toast('图片请小于 3 MB');
  const status = form.querySelector('[data-source-status]'); status.textContent = '正在上传地点照片…';
  try {
    const response = await fetch(`/api/trips/${encodeURIComponent(state.tripId)}/images`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '图片上传失败');
    if (!form.isConnected) return;
    form.elements.namedItem('coverImage').value = result.url;
    form.querySelector('[data-cover-preview]').innerHTML = photoMarkup({ category: form.elements.namedItem('category').value, name: form.elements.namedItem('name').value || '地点', coverImage: result.url }, 'form');
    status.textContent = '照片已上传，保存地点后会对所有伙伴显示。';
  } catch (error) { status.textContent = error.message; }
}
async function uploadDetailCover(input) {
  const file = input.files?.[0], placeId = input.dataset.placeId;
  if (!file) return;
  if (file.size > 3_000_000) { input.value = ''; return toast('图片请小于 3 MB'); }
  const button = input.closest('.hero-photo-wrap')?.querySelector('[data-pick-cover]');
  if (button) { button.disabled = true; button.textContent = '上传中…'; }
  try {
    const response = await fetch(`/api/trips/${encodeURIComponent(state.tripId)}/images`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '图片上传失败');
    await action({ action: 'set-cover', placeId, coverImage: result.url });
    toast('封面已更新，地图列表与伙伴详情都会显示');
  } catch (error) { toast(error.message); }
  finally { input.value = ''; if (button?.isConnected) { button.disabled = false; button.textContent = '上传封面照片'; } }
}
async function finishPlaceMedia(form) {
  clearTimeout(form._sourceTimer);
  const input = form.querySelector('[data-source-input]'), raw = sourceLink(input.value);
  if (raw && ['小红书', '大众点评'].includes(sourceSite(raw)) && form.dataset.previewUrl !== raw && raw !== sourceLink(input.defaultValue)) form._sourcePromise = loadSourcePreview(input);
  if (form._sourcePromise) await form._sourcePromise;
  if (form._coverPromise) await form._coverPromise;
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || '操作失败，请稍后重试');
  return payload;
}
async function action(payload) {
  if (!state.memberId) return showJoin();
  try {
    const result = await api(`/api/trips/${encodeURIComponent(state.tripId)}/actions`, { method: 'POST', body: JSON.stringify(payload) });
    await refreshTrip();
    return result;
  } catch (error) { toast(error.message); throw error; }
}
function toast(message) {
  const element = $('#toast'); element.textContent = message; element.hidden = false;
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { element.hidden = true; }, 3200);
}
function showModal(html) { closeUiSelect(); const root = $('#modalRoot'); root.innerHTML = html; root.hidden = false; enhanceSelects(root); root.querySelector('input:not([type=hidden]),textarea,.ui-select-trigger')?.focus(); }
function closeModal() { closeUiSelect(); $('#modalRoot').hidden = true; $('#modalRoot').innerHTML = ''; updateUnread(); }
function modalHeader(eyebrow, title, closable = true) { return `<div class="modal-head"><div><small>${eyebrow}</small><h2>${title}</h2></div>${closable ? '<button type="button" data-close-modal aria-label="关闭">×</button>' : ''}</div>`; }
function renderAccountButton() {
  const button = $('#accountButton');
  button.textContent = state.user ? state.user.name.slice(0, 4) : '登录';
  button.title = state.user ? `${state.user.name} · 查看账号` : '登录或注册';
}
let authReadyPromise = null;
let splashFinished = false;
function showEntry() {
  state.eventSource?.close();
  $('#appShell').hidden = true;
  $('#entryScreen').hidden = false;
  $('#splashScreen').hidden = true;
  $('#welcomeScreen').hidden = false;
  document.title = '旅伴地图 · 一起出发';
}
function beginSplash() {
  $('#entryScreen').hidden = false;
  $('#appShell').hidden = true;
  $('#welcomeScreen').hidden = true;
  $('#splashScreen').hidden = false;
}
async function finishSplash() {
  if (splashFinished) return;
  splashFinished = true;
  await authReadyPromise;
  if (state.user) await showHome(); else showAuth();
}
function showAuth(mode = 'login') {
  const register = mode === 'register';
  closeModal(); showEntry();
  $('#entryContent').innerHTML = `<div class="entry-eyebrow">TRAVEL TOGETHER</div><h2>${register ? '创建你的账号' : '欢迎回来'}</h2><p class="entry-lede">${register ? '注册后，和旅伴一起在地图上留下每个想法。' : '登录后，继续你们聊到一半的旅程。'}</p><div class="auth-switch"><button type="button" data-auth-mode="login" class="${register ? '' : 'active'}">登录</button><button type="button" data-auth-mode="register" class="${register ? 'active' : ''}">注册</button></div><form id="authForm"><input type="hidden" name="mode" value="${mode}">${register ? '<label for="authName">你的昵称</label><input class="field" id="authName" name="name" autocomplete="nickname" maxlength="24" minlength="2" placeholder="旅行伙伴看到的名字" required>' : ''}<label for="authEmail">邮箱</label><input class="field" id="authEmail" name="email" type="email" autocomplete="email" maxlength="254" placeholder="name@example.com" required><label for="authPassword">密码</label><input class="field" id="authPassword" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="${register ? 10 : 1}" maxlength="128" placeholder="${register ? '至少 10 个字符' : '输入密码'}" required>${register ? '<p class="auth-hint">邮箱只用来登录，目前不会发送验证邮件。</p>' : ''}<button type="submit" class="primary-button auth-submit">${register ? '注册并进入' : '登录并进入'} →</button></form><div class="home-footer-actions"><button type="button" data-show-home>🏠 项目首页</button></div>`;
  $('#entryContent').querySelector('input:not([type=hidden])')?.focus();
}
async function showHome() {
  closeModal(); showEntry();
  const content = $('#entryContent');
  if (!state.user) {
    content.innerHTML = `<div class="entry-eyebrow">YOUR TRAVEL SPACE</div><h2>项目首页</h2><p class="entry-lede">登录后查看和伙伴一起创建的旅行项目。</p><button type="button" class="home-create-card" data-start-new-trip><span class="home-project-icon">🧳</span><span class="home-project-main"><strong>创建新旅行</strong><small>登录或注册后，搜索起点并设定旅行日期</small></span><span class="home-project-arrow">↗</span></button><div class="home-empty">登录后，这里会显示你创建和加入的项目。</div><div class="home-footer-actions"><button type="button" data-auth-mode="login">登录</button><button type="button" data-auth-mode="register">注册</button></div>`;
    return;
  }
  content.innerHTML = '<div class="entry-eyebrow">YOUR TRAVEL SPACE</div><h2>正在整理你的旅行…</h2>';
  try {
    const { trips } = await api('/api/auth/trips');
    const invitedId = state.tripId && !trips.some(trip => trip.id === state.tripId) ? state.tripId : '';
    let invite = null;
    if (invitedId) try { invite = (await api(`/api/trips/${encodeURIComponent(invitedId)}`)).trip; } catch { /* 邀请链接可能已失效。 */ }
    const cards = trips.map(trip => `<button type="button" class="home-project-card" data-open-trip="${escapeHtml(trip.id)}"><span class="home-project-icon">🗺️</span><span class="home-project-main"><strong>${escapeHtml(trip.title)}</strong><small>${escapeHtml(trip.destination || '目的地待定')} · ${trip.dayCount} 天${trip.startDate ? ` · ${escapeHtml(trip.startDate)}` : ''}</small></span><span class="home-project-arrow">↗</span></button>`).join('');
    content.innerHTML = `<div class="entry-home-top"><div class="entry-eyebrow">YOUR TRAVEL SPACE</div><button type="button" class="entry-user" data-home-account><span class="entry-user-avatar">${escapeHtml(state.user.name.slice(0, 1))}</span>${escapeHtml(state.user.name)}</button></div><h2>下一趟，去哪里？</h2><p class="entry-lede">从一个想法开始，邀请伙伴一起把行程聊出来。</p><button type="button" class="home-create-card" data-start-new-trip><span class="home-project-icon">🧳</span><span class="home-project-main"><strong>创建新旅行</strong><small>定下日期和目的地，开始一张共享地图</small></span><span class="home-project-arrow">↗</span></button>${invite ? `<div class="home-section-title">收到的邀请</div><button type="button" class="home-project-card home-invite" data-open-trip="${escapeHtml(invite.id)}"><span class="home-project-icon">✉️</span><span class="home-project-main"><strong>${escapeHtml(invite.title)}</strong><small>${escapeHtml(invite.destination || '一起决定目的地')} · ${invite.dayCount} 天 · 点击查看并加入</small></span><span class="home-project-arrow">↗</span></button>` : ''}<div class="home-section-title">我的旅行 · ${trips.length}</div><div class="home-projects">${cards || '<div class="home-empty">还没有旅行项目。点击上方创建，或打开伙伴发来的邀请链接。</div>'}</div>${!trips.length && !invite ? '<div class="home-footer-actions"><button type="button" data-open-trip="demo-kyoto">先看看示例旅行 →</button></div>' : ''}<div class="home-footer-actions"><button type="button" data-home-logout>退出登录</button></div>`;
  } catch (error) { content.innerHTML = `<div class="entry-eyebrow">YOUR TRAVEL SPACE</div><h2>暂时无法读取项目</h2><p class="entry-lede">${escapeHtml(error.message)}</p><button type="button" class="primary-button" data-retry-home>重试</button>`; }
}
function openTrip(tripId) {
  sessionStorage.setItem('travel-next-view', 'trip');
  location.href = `${location.pathname}?trip=${encodeURIComponent(tripId)}`;
}
function navigateHome() {
  history.replaceState({ view: 'home' }, '', location.pathname);
  showHome();
}
function showJoin() {
  if (!state.user) return showAuth();
  if (state.memberId) return;
  showModal(`<div class="modal">${modalHeader('一起开始', '加入这趟旅行')}<p>以 <strong>${escapeHtml(state.user.name)}</strong> 的身份加入「${escapeHtml(state.trip.title)}」，就能和伙伴一起在地图上讨论。</p><form id="joinForm"><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>先看看地图</button><button class="primary-button" type="submit">加入旅行 →</button></div></form></div>`);
}
async function showAccount() {
  if (!state.user) return showAuth();
  try {
    const { trips } = await api('/api/auth/trips');
    showModal(`<div class="modal auth-modal">${modalHeader('你的账号', escapeHtml(state.user.name))}<p>${escapeHtml(state.user.email)}</p><div class="account-trip-heading">我的旅行 · ${trips.length}</div><div class="account-trip-list">${trips.length ? trips.map(trip => `<button type="button" data-open-trip="${escapeHtml(trip.id)}" class="account-trip ${trip.id === state.tripId ? 'current' : ''}"><strong>${escapeHtml(trip.title)}</strong><span>${escapeHtml(trip.destination || '目的地待定')} · ${trip.dayCount} 天</span></button>`).join('') : '<p>还没有加入旅行。创建一趟旅行，或打开伙伴发来的邀请链接。</p>'}</div><div class="modal-actions"><button type="button" class="secondary-button" data-logout>退出登录</button><button type="button" class="primary-button" data-close-modal>完成</button></div></div>`);
  } catch (error) { toast(error.message); }
}
function showNewTrip() {
  if (!state.user) { state.pendingAuthAction = 'newTrip'; return showAuth(); }
  showModal(`<div class="modal">${modalHeader('新的旅程', '创建旅行空间')}<p>选择国内的城市、车站或详细地址作为地图起点，再设定日期。</p><form id="newTripForm"><label for="tripTitle">旅行名称</label><input class="field" id="tripTitle" name="title" placeholder="比如：周末去杭州" maxlength="80" required><label for="tripDestination">目的地</label><input class="field" id="tripDestination" name="destination" placeholder="比如：浙江 · 杭州" maxlength="100"><label for="tripOriginSearch">地图起点</label><div class="source-input-row"><input class="field" id="tripOriginSearch" data-trip-origin-search placeholder="搜索城市、车站或地址，例如杭州东站" autocomplete="off" required><button type="button" data-search-trip-origin>搜索</button></div><input type="hidden" name="centerLat"><input type="hidden" name="centerLng"><div class="location-results" data-trip-origin-results></div><div class="location-selection" data-trip-origin-selection>输入地点后，从搜索结果中选一个准确位置</div><div class="form-pair"><div><label for="tripStartDate">开始日期</label><input class="field" id="tripStartDate" name="startDate" type="date" required></div><div><label for="tripEndDate">结束日期</label><input class="field" id="tripEndDate" name="endDate" type="date" required></div></div><div class="trip-date-summary" id="tripDateSummary">选择日期后自动计算旅行天数</div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>取消</button><button class="primary-button" type="submit">创建旅行</button></div></form></div>`);
  $('#tripOriginSearch').focus();
}
async function searchTripOrigin(input) {
  const form = input.closest('form'), query = input.value.trim(), results = form.querySelector('[data-trip-origin-results]');
  if (!query) { results.innerHTML = ''; return; }
  const request = (form._originRequest || 0) + 1; form._originRequest = request;
  results.textContent = '正在搜索高德地点…';
  if (!await ensureAmapSdk() || !form.isConnected || form._originRequest !== request) {
    if (form.isConnected && form._originRequest === request) results.innerHTML = '<div class="location-empty">地图搜索暂时不可用，请检查高德 Key 配置或网络。</div>';
    return;
  }
  AMap.plugin('AMap.PlaceSearch', () => {
    new AMap.PlaceSearch({ pageSize: 8, extensions: 'base', citylimit: false }).search(query, (status, result) => {
      if (!form.isConnected || form._originRequest !== request) return;
      const pois = status === 'complete' ? (result?.poiList?.pois || []).filter(poi => inChina(poiPoint(poi))) : [];
      const render = matches => {
        state.tripOriginResults = matches;
        results.innerHTML = matches.length ? matches.map((poi, index) => `<button type="button" data-select-trip-origin="${index}"><strong>${escapeHtml(poi.name)}</strong><small>${escapeHtml([poi.cityname, poi.adname, poi.address].filter(Boolean).join(' · ') || '高德地点')}</small></button>`).join('') : '<div class="location-empty">没有找到国内地点，试试更完整的城市名、车站名或街道地址。</div>';
      };
      if (pois.length) return render(pois);
      AMap.plugin('AMap.Geocoder', () => {
        new AMap.Geocoder().getLocation(query, (geocodeStatus, geocodeResult) => {
          if (!form.isConnected || form._originRequest !== request) return;
          const matches = geocodeStatus === 'complete' ? (geocodeResult?.geocodes || []).filter(item => inChina(poiPoint(item))).map(item => ({ name: item.formattedAddress || query, location: item.location, cityname: item.addressComponent?.city || '', adname: item.addressComponent?.district || '', address: '' })) : [];
          render(matches);
        });
      });
    });
  });
}
function selectTripOrigin(index) {
  const poi = state.tripOriginResults[index], form = $('#newTripForm'); if (!poi || !form) return;
  clearTimeout(form._originTimer); form._originRequest = (form._originRequest || 0) + 1;
  const point = poiPoint(poi), [dx, dy] = gcjDelta(point.lng, point.lat);
  form.elements.namedItem('centerLat').value = (point.lat - dy).toFixed(6);
  form.elements.namedItem('centerLng').value = (point.lng - dx).toFixed(6);
  form.querySelector('[data-trip-origin-search]').value = poi.name;
  form.querySelector('[data-trip-origin-results]').innerHTML = '';
  form.querySelector('[data-trip-origin-selection]').textContent = `✓ 已选择：${poi.name} · ${[poi.cityname, poi.adname, poi.address].filter(Boolean).join(' · ')}`;
  if (!form.elements.namedItem('destination').value.trim() && poi.cityname) form.elements.namedItem('destination').value = poi.cityname;
}
function showTripDates() {
  const trip = state.trip;
  showModal(`<div class="modal">${modalHeader('旅行日期', '设置开始与结束日期')}<p>日期决定 Day 的数量；每天可以分别选择酒店并规划路线。</p><form id="tripDatesForm"><div class="form-pair"><div><label for="tripStartDate">开始日期</label><input class="field" id="tripStartDate" name="startDate" type="date" value="${escapeHtml(trip.startDate || '')}" required></div><div><label for="tripEndDate">结束日期</label><input class="field" id="tripEndDate" name="endDate" type="date" value="${escapeHtml(trip.endDate || '')}" required></div></div><div class="trip-date-summary" id="tripDateSummary"></div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>取消</button><button class="primary-button" type="submit">保存日期</button></div></form></div>`);
  updateTripDateSummary();
}
function updateTripDateSummary() {
  const form = $('#newTripForm') || $('#tripDatesForm'); if (!form) return;
  const start = form.elements.namedItem('startDate').value, endInput = form.elements.namedItem('endDate');
  endInput.min = start;
  const days = tripDayCount(start, endInput.value);
  $('#tripDateSummary').textContent = !start || !endInput.value ? '选择日期后自动计算旅行天数' : days < 1 ? '结束日期要晚于或等于开始日期' : days > 30 ? '旅行最长可安排 30 天' : `共 ${days} 天 · Day 1—Day ${days}`;
}
function showAddPlace(lat = '', lng = '', kind = 'place') {
  const hasPoint = lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const near = hasPoint ? state.trip.places.filter(p => Math.abs(p.lat - lat) < .0015 && Math.abs(p.lng - lng) < .0015) : [];
  const defaultCategory = kind === 'hotel' || state.sideView === 'hotels' ? '酒店' : state.sideView === 'eat' ? '美食' : '景点';
  showModal(`<div class="modal quick-add-modal">${modalHeader('地图上的新提议', '想去哪里？')}<p>先搜索店名或地址，选中准确位置。要不要去、哪天去，进入详情后一起讨论。</p>${near.length ? `<p>附近已有：${near.map(p => escapeHtml(p.name)).join('、')}。同一地点可直接继续讨论。</p>` : ''}<form id="addPlaceForm"><input type="hidden" name="lat" value="${hasPoint ? lat : ''}"><input type="hidden" name="lng" value="${hasPoint ? lng : ''}"><div class="quick-category-label">这是一个…</div><div class="quick-categories">${[['美食', '🍜', '吃的'], ['景点', '⛩️', '玩的'], ['酒店', '🛏️', '住的']].map(([value, icon, label]) => `<label class="quick-category"><input type="radio" name="category" value="${value}" ${value === defaultCategory ? 'checked' : ''}><span><i>${icon}</i>${label}</span></label>`).join('')}</div><label for="addLocationSearch">搜索准确地点</label><div class="source-input-row"><input class="field" id="addLocationSearch" data-add-location-search placeholder="输入店名、酒店或街道地址" autocomplete="off"><button type="button" data-search-location>搜索</button></div><div class="location-results" data-location-results></div><div class="location-selection" data-location-selection>${hasPoint ? '已使用地图上选择的位置；也可搜索更准确的地点' : '先搜索并选择一个地点'}</div>${quickSourceFields()}<label for="placeReason">为什么想去？</label><textarea class="field" id="placeReason" name="reason" maxlength="500" placeholder="例如：看到这家店的夜景很好，想和大家一起去"></textarea><details class="quick-name" data-quick-name><summary>没有链接，或没读到名称？补一个地点名</summary><label for="placeName">地点名称</label><input class="field" id="placeName" name="name" placeholder="例如：外滩附近的餐厅" maxlength="80"></details><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>取消</button><button class="primary-button" type="submit">放到地图上 →</button></div></form></div>`);
  $('#addLocationSearch').focus();
}
function searchAddLocation(input) {
  const form = input.closest('form'), query = input.value.trim(), results = form.querySelector('[data-location-results]');
  if (!query) { results.innerHTML = ''; return; }
  if (state.provider !== 'amap' || !window.AMap?.plugin) { results.textContent = '高德地图加载后可搜索准确地点'; return; }
  const request = (form._locationRequest || 0) + 1; form._locationRequest = request;
  results.textContent = '正在搜索高德地点…';
  AMap.plugin('AMap.PlaceSearch', () => {
    new AMap.PlaceSearch({ pageSize: 8, extensions: 'base', citylimit: false }).search(query, (status, result) => {
      if (!form.isConnected || form._locationRequest !== request) return;
      const pois = status === 'complete' ? (result?.poiList?.pois || []).filter(poi => Number.isFinite(poiPoint(poi).lat) && Number.isFinite(poiPoint(poi).lng)) : [];
      state.addPoiResults = pois;
      results.innerHTML = pois.length ? pois.map((poi, index) => `<button type="button" data-select-add-poi="${index}"><strong>${escapeHtml(poi.name)}</strong><small>${escapeHtml([poi.cityname, poi.adname, poi.address].filter(Boolean).join(' · ') || poi.type || '高德地点')}</small></button>`).join('') : '<div class="location-empty">没有找到结果，试试完整店名或街道地址。</div>';
    });
  });
}
function selectAddLocation(index) {
  const poi = state.addPoiResults[index], form = $('#addPlaceForm'); if (!poi || !form) return;
  const point = poiPoint(poi), stored = storedCoord(point.lng, point.lat);
  form.elements.namedItem('lat').value = stored.lat.toFixed(6);
  form.elements.namedItem('lng').value = stored.lng.toFixed(6);
  if (!form.elements.namedItem('name').value.trim()) form.elements.namedItem('name').value = poi.name;
  form.elements.namedItem('address').value = [poi.cityname, poi.adname, poi.address].filter(Boolean).join(' · ').slice(0, 120);
  form.querySelector('[data-location-selection]').textContent = `✓ 已定位：${poi.name} · ${form.elements.namedItem('address').value || '高德地点'}`;
  form.querySelector('[data-location-results]').innerHTML = '';
  form.querySelector('[data-add-location-search]').value = poi.name;
  if (state.provider === 'amap') state.map.setZoomAndCenter(Math.max(state.map.getZoom(), 15), [point.lng, point.lat]);
}
function showEditPlace(p) {
  showModal(`<div class="modal modal-wide">${modalHeader('地点资料', '编辑地点')}<p>贴入链接可带入公开资料，也可以上传自己的照片、补充价格等信息。</p><form id="editPlaceForm"><input type="hidden" name="placeId" value="${p.id}">${mediaFields(p)}<label for="editName">地点名称</label><input class="field" id="editName" name="name" value="${escapeHtml(p.name)}" maxlength="80" required><div class="form-pair"><div><label for="editCategory">类别</label><select class="field" id="editCategory" name="category">${Object.keys(categories).map(category => `<option ${p.category === category ? 'selected' : ''}>${category}</option>`).join('')}</select></div><div><label for="editAddress">地址或区域（可补填）</label><input class="field" id="editAddress" name="address" value="${escapeHtml(p.address || '')}" maxlength="120"></div></div><div class="form-pair"><div><label for="editHours">营业 / 入住时间（可补填）</label><input class="field" id="editHours" name="openingHours" value="${escapeHtml(p.openingHours || '')}" maxlength="100"></div><div><label for="editCost">价格或费用（可补填）</label><input class="field" id="editCost" name="costNote" value="${escapeHtml(p.costNote || '')}" maxlength="100"></div></div><label for="editReason">想去的理由 / 备注</label><textarea class="field" id="editReason" name="reason" maxlength="500">${escapeHtml(p.reason || '')}</textarea><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>取消</button><button class="primary-button" type="submit">保存资料</button></div></form></div>`);
}
function showMapInfo() {
  const amap = state.provider === 'amap';
  showModal(`<div class="modal">${modalHeader('地图来源', '这张地图来自哪里？')}<p>当前底图由 ${amap ? '高德地图 JS API' : 'OpenStreetMap / Leaflet'} 提供。地图上的旅行标记、评论、酒店与行程由旅伴地图保存。</p><p>点标记可打开地点详情；点地图空白处可收起详情。${amap ? '国内路线会尝试使用高德道路规划，服务不支持时保留直线示意。' : '当前路线是直线示意，暂不提供实际道路里程。'}</p><p>高德官方导航链接最多支持一个驾车途经点；更多地点需要按顺序打开后续路段。</p><div class="modal-actions"><button type="button" class="primary-button" data-close-modal>知道了</button></div></div>`);
}
function poiPoint(poi) { return { lng: Number(poi.location?.lng ?? poi.location?.getLng?.()), lat: Number(poi.location?.lat ?? poi.location?.getLat?.()) }; }
function showNearbyPois(lng, lat) {
  if (state.provider !== 'amap') return;
  toast('正在查找点击位置附近的地点…');
  AMap.plugin('AMap.Geocoder', () => {
    const geocoder = new AMap.Geocoder({ radius: 180, extensions: 'all' });
    geocoder.getAddress([lng, lat], (status, result) => {
      const pois = status === 'complete' ? (result?.regeocode?.pois || []).filter(poi => poi.id && Number.isFinite(poiPoint(poi).lng)).slice(0, 8) : [];
      if (!pois.length) return toast('附近暂时没有可查看的高德地点');
      state.poiResults = pois;
      showModal(`<div class="modal modal-wide">${modalHeader('高德地点', '附近有什么？')}<p>选择地点查看高德资料，再决定是否加入这趟旅行。</p><div class="poi-list">${pois.map((poi, index) => `<button data-poi-index="${index}"><strong>${escapeHtml(poi.name)}</strong><small>${escapeHtml(poi.address || poi.type || '附近地点')}</small></button>`).join('')}</div></div>`);
    });
  });
}
function showPoiDetail(index) {
  const poi = state.poiResults[index]; if (!poi) return;
  AMap.plugin('AMap.PlaceSearch', () => {
    new AMap.PlaceSearch({ extensions: 'all' }).getDetails(poi.id, (status, result) => {
      const detail = status === 'complete' ? result?.poiList?.pois?.[0] || poi : poi;
      const point = poiPoint(detail);
      const stored = storedCoord(point.lng, point.lat);
      const url = `https://uri.amap.com/marker?position=${point.lng},${point.lat}&name=${encodeURIComponent(detail.name)}`;
      state.poiResults[index] = detail;
      showModal(`<div class="modal modal-wide">${modalHeader('高德地点资料', escapeHtml(detail.name))}<div class="poi-facts"><div>地址 <strong>${escapeHtml(detail.address || '暂无地址')}</strong></div><div>类别 <strong>${escapeHtml(detail.type || '地点')}</strong></div>${detail.tel ? `<div>电话 <strong>${escapeHtml(detail.tel)}</strong></div>` : ''}</div><p>资料来自高德；加入后伙伴可以在这趟旅行里继续讨论。</p><div class="modal-actions"><a class="secondary-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">在高德查看</a><button class="primary-button" data-poi-add="${index}" data-poi-lat="${stored.lat}" data-poi-lng="${stored.lng}">＋ 加入旅行地图</button></div></div>`);
    });
  });
}
function amapNavigationUrl(points, mode = 'drive') {
  const params = new URLSearchParams();
  const pointText = p => `${mapCoord(p).map(value => value.toFixed(6)).join(',')},${p.name}`;
  params.set('from', pointText(points[0])); params.set('to', pointText(points.at(-1)));
  if (points.length === 3 && mode === 'drive') params.set('via', pointText(points[1]));
  params.set('mode', { drive: 'car', walk: 'walk', transit: 'bus' }[mode] || 'car'); params.set('src', 'travel-companion'); params.set('callnative', '1');
  return `https://uri.amap.com/navigation?${params}`;
}
function appNavigationUrl(points, mode, platform) {
  const start = mapCoord(points[0]), end = mapCoord(points.at(-1));
  const params = new URLSearchParams({ sourceApplication: 'travel-companion', slat: start[1].toFixed(6), slon: start[0].toFixed(6), sname: points[0].name, dlat: end[1].toFixed(6), dlon: end[0].toFixed(6), dname: points.at(-1).name, dev: '0', t: String({ drive: 0, transit: 1, walk: 2 }[mode] ?? 0) });
  if (mode === 'drive' && points.length > 2) {
    const vias = points.slice(1, -1).map(mapCoord);
    params.set('vian', String(vias.length));
    params.set('vialons', vias.map(point => point[0].toFixed(6)).join('|'));
    params.set('vialats', vias.map(point => point[1].toFixed(6)).join('|'));
    params.set('vianames', points.slice(1, -1).map(point => point.name).join('|'));
  }
  return `${platform === 'ios' ? 'iosamap://path' : 'amapuri://route/plan/'}?${params}`;
}
function phonePlatform() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android'; }
function navigationSegments(day) {
  const groups = [];
  for (const leg of dayLegs(day)) {
    const mode = legMode(day, leg.from, leg.to), previous = groups.at(-1);
    if (mode === 'drive' && previous?.mode === 'drive' && previous.points.length < 3 && previous.points.at(-1).id === leg.from.id) previous.points.push(leg.to);
    else groups.push({ points: [leg.from, leg.to], mode });
  }
  return groups.map(group => ({ ...group, url: amapNavigationUrl(group.points, group.mode), iosUrl: appNavigationUrl(group.points, group.mode, 'ios'), androidUrl: appNavigationUrl(group.points, group.mode, 'android') }));
}
function dayExportButton(day, className, label) {
  const first = navigationSegments(day)[0];
  return `<button class="${className}" ${first ? `data-export-day="${day}"` : 'disabled'}>${label}</button>`;
}
function tripExportButton() {
  const first = Array.from({ length: state.trip.dayCount }, (_, i) => navigationSegments(i + 1)[0]).find(Boolean);
  const label = isPhone() ? '↗ 在高德 App 选择路线' : '⌁ 发到手机高德 · 按天打开';
  return `<button class="export-trip-button" ${first ? 'data-export-trip' : 'disabled'}>${label}</button>`;
}
function routeExportModal(title, groups, note) {
  state.routeExportSegments = groups.flatMap(group => group.segments);
  state.routePlatform = isPhone() ? phonePlatform() : 'ios';
  const phoneGuide = isPhone() ? '<div class="app-open-note">直接打开 App 需要手机已安装高德，浏览器允许打开外部应用。若没有反应，请用每段下方的“打开网页版”。</div>' : `<div class="route-platforms"><button data-qr-platform="ios" class="active">iPhone App</button><button data-qr-platform="android">Android App</button></div><div class="route-phone-guide"><div class="route-qr" id="routeQr" aria-label="高德 App 路线二维码"></div><div><strong id="routeQrTitle">扫描二维码打开高德 App</strong><p>选手机系统，再选择下方路段。扫码能否直接唤起 App 由手机相机和浏览器决定，无法保证。</p><button type="button" data-copy-route>复制 App 链接</button><a id="routeWebFallback" target="_blank" rel="noopener noreferrer">打开网页版备选</a></div></div>`;
  let segmentIndex = 0;
  const sections = groups.map(group => `<strong class="export-day-heading">Day ${group.day} · ${group.nodes.map(p => escapeHtml(p.name)).join(' → ')}</strong>${group.segments.map((segment, index) => { const current = segmentIndex++; return `<div class="export-segment-card"><button type="button" class="route-segment-select ${current === 0 ? 'active' : ''}" data-select-route="${current}">第 ${index + 1} 段 · ${modeLabels[segment.mode]}<small>${escapeHtml(segment.points.map(p => p.name).join(' → '))}</small></button>${isPhone() ? `<div class="route-segment-actions"><a class="primary-button" href="${escapeHtml(segment[phonePlatform() === 'ios' ? 'iosUrl' : 'androidUrl'])}">直接打开高德 App</a><a href="${escapeHtml(segment.url)}">打开网页版备选</a></div>` : ''}</div>`; }).join('')}`).join('');
  showModal(`<div class="modal modal-wide">${modalHeader('高德路线', title)}<p>${note}</p>${phoneGuide}<div class="export-segments">${sections}</div><div class="modal-actions"><button class="primary-button" data-close-modal>完成</button></div></div>`);
  if (!isPhone()) setRouteQr(0);
}
function setRouteQr(index) {
  const segment = state.routeExportSegments?.[index]; if (!segment) return;
  state.routeSelection = index;
  const url = segment[state.routePlatform === 'ios' ? 'iosUrl' : 'androidUrl'];
  const box = $('#routeQr'); if (!box) return;
  box.replaceChildren();
  if (window.QRCode) new QRCode(box, { text: url, width: 192, height: 192, colorDark: '#253e33', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  else box.innerHTML = '<span style="font-size:11px;color:#718476;text-align:center">二维码加载失败，请复制手机链接</span>';
  $('#routeQrTitle').textContent = `${segment.points.map(p => p.name).join(' → ')}`;
  $('#modalRoot').querySelector('[data-copy-route]').dataset.copyRoute = url;
  $('#routeWebFallback').href = segment.url;
  $('#modalRoot').querySelectorAll('[data-select-route]').forEach(button => button.classList.toggle('active', Number(button.dataset.selectRoute) === index));
  $('#modalRoot').querySelectorAll('[data-qr-platform]').forEach(button => button.classList.toggle('active', button.dataset.qrPlatform === state.routePlatform));
}
function exportDay(day) {
  const nodes = dayRoute(day);
  if (!dayLegs(day).length) return toast('请先为这一天安排路线地点');
  const segments = navigationSegments(day);
  routeExportModal(`Day ${day} · ${nodes.length} 站`, [{ day, nodes, segments }], segments.length > 1 ? '已按交通方式和路段拆开；选择路段后尝试直接打开高德 App。' : '这一段已填好起点、终点和可用的途经点。');
}
function exportTrip() {
  const days = Array.from({ length: state.trip.dayCount }, (_, i) => i + 1).map(day => ({ day, nodes: dayRoute(day) })).filter(item => dayLegs(item.day).length);
  if (!days.length) return toast('请先安排至少一天的路线');
  const groups = days.map(item => ({ ...item, segments: navigationSegments(item.day) }));
  routeExportModal(`${escapeHtml(state.trip.title)} · ${groups.length} 天`, groups, '按天选择路线，尝试直接打开高德 App；每段都保留网页版备选。');
}
async function captureTripBasemap(sections, width, height) {
  if (state.provider !== 'amap' || !state.map || !window.AMap?.Map) return null;
  const points = sections.flatMap(section => section.nodes.map(mapCoord)).filter(point => point.every(Number.isFinite));
  if (!points.length) return null;
  const map = state.map, originalCenter = map.getCenter(), originalZoom = map.getZoom();
  const viewportWidth = map.getContainer().clientWidth, viewportHeight = map.getContainer().clientHeight;
  const cropHeight = Math.min(viewportHeight, viewportWidth * height / width), cropTop = (viewportHeight - cropHeight) / 2;
  const restore = () => map.setZoomAndCenter(originalZoom, originalCenter, true);
  try {
    if (points.length > 1) {
      const west = Math.min(...points.map(point => point[0])), east = Math.max(...points.map(point => point[0]));
      const south = Math.min(...points.map(point => point[1])), north = Math.max(...points.map(point => point[1]));
      const verticalPadding = Math.max(35, Math.floor(cropTop) + 35);
      map.setBounds(new AMap.Bounds([west, south], [east, north]), true, [verticalPadding, verticalPadding, 42, 42]);
      if (map.getZoom() > 15) map.setZoom(15, true);
    } else map.setZoomAndCenter(14, points[0], true);
    await new Promise(resolve => { const timer = setTimeout(resolve, 1200); map.once('moveend', () => { clearTimeout(timer); resolve(); }); });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const source = map.getContainer().querySelector('canvas'); if (!source) throw new Error('地图画面尚未就绪');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'), pixelRatio = source.width / viewportWidth;
    context.drawImage(source, 0, cropTop * pixelRatio, source.width, cropHeight * pixelRatio, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let hasMapPixels = false;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) { hasMapPixels = true; break; }
    if (!hasMapPixels) throw new Error('地图画面为空');
    const pointScale = width / viewportWidth;
    return { canvas, project: point => { const pixel = map.lngLatToContainer(point); return [pixel.x * pointScale, (pixel.y - cropTop) * pointScale]; }, dispose: restore };
  } catch (error) {
    console.warn('行程地图底图生成失败', error);
    restore(); return null;
  }
}
function drawTripRouteMap(ctx, sections, x, y, width, height, basemap = null) {
  const active = sections.filter(section => section.legs.length || section.nodes.some(place => place.category !== '酒店')), paths = active.flatMap(section => section.legs.map(leg => {
    const result = legResult(leg);
    return { day: section.day, status: result.status, points: result.path?.length >= 2 ? result.path : [mapCoord(leg.from), mapCoord(leg.to)] };
  }));
  const coordinates = [...active.flatMap(section => section.nodes.map(mapCoord)), ...paths.flatMap(path => path.points)].filter(point => point?.length === 2 && point.every(Number.isFinite));
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(x, y, width, height, 20); ctx.fill();
  ctx.fillStyle = '#294b3a'; ctx.font = '700 20px system-ui, sans-serif'; ctx.fillText('行程路线地图', x + 28, y + 43);
  ctx.fillStyle = '#819489'; ctx.font = '13px system-ui, sans-serif'; ctx.fillText(`${basemap ? '高德地图底图' : '按真实地点位置绘制'} · 每天一种颜色`, x + 186, y + 42);
  const plot = { x: x + 19, y: y + 60, width: width - 38, height: height - 133 - Math.max(0, Math.ceil(active.length / 7) - 1) * 27 };
  ctx.fillStyle = '#edf3ec'; ctx.beginPath(); ctx.roundRect(plot.x, plot.y, plot.width, plot.height, 15); ctx.fill();
  if (basemap) { ctx.save(); ctx.beginPath(); ctx.roundRect(plot.x, plot.y, plot.width, plot.height, 15); ctx.clip(); ctx.drawImage(basemap.canvas, plot.x, plot.y, plot.width, plot.height); ctx.restore(); }
  if (!coordinates.length) {
    ctx.fillStyle = '#78917e'; ctx.font = '16px system-ui, sans-serif'; ctx.fillText('安排地点后，这里会出现每天的路线地图', plot.x + 30, plot.y + plot.height / 2);
    return;
  }
  const mercatorY = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
  const xs = coordinates.map(point => point[0]), ys = coordinates.map(point => mercatorY(point[1]));
  const minX = xs.reduce((value, item) => Math.min(value, item), Infinity), maxX = xs.reduce((value, item) => Math.max(value, item), -Infinity);
  const minY = ys.reduce((value, item) => Math.min(value, item), Infinity), maxY = ys.reduce((value, item) => Math.max(value, item), -Infinity);
  const pad = 55, rangeX = Math.max(maxX - minX, .004), rangeY = Math.max(maxY - minY, .004 * Math.PI / 180);
  const scale = Math.min((plot.width - pad * 2) / rangeX, (plot.height - pad * 2) / rangeY);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const project = basemap ? point => { const [px, py] = basemap.project(point); return [plot.x + px, plot.y + py]; } : point => [plot.x + plot.width / 2 + (point[0] - centerX) * scale, plot.y + plot.height / 2 - (mercatorY(point[1]) - centerY) * scale];
  ctx.save(); ctx.beginPath(); ctx.roundRect(plot.x, plot.y, plot.width, plot.height, 15); ctx.clip();
  if (!basemap) { ctx.strokeStyle = '#d9e6d9'; ctx.lineWidth = 1; ctx.setLineDash([3, 7]); for (let i = 1; i < 7; i++) { const gx = plot.x + plot.width * i / 7, gy = plot.y + plot.height * i / 7; ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.height); ctx.moveTo(plot.x, gy); ctx.lineTo(plot.x + plot.width, gy); ctx.stroke(); } ctx.setLineDash([]); }
  for (const path of paths) {
    const points = path.points.filter(point => point?.length === 2 && point.every(Number.isFinite)); if (points.length < 2) continue;
    const draw = () => { ctx.beginPath(); points.forEach((point, index) => { const [px, py] = project(point); if (index) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(path.status === 'complete' ? [] : [8, 6]);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 9; draw();
    ctx.strokeStyle = dayColor(path.day); ctx.lineWidth = 5; draw();
  }
  ctx.setLineDash([]);
  const seen = new Set(), markers = active.flatMap(section => section.nodes.map((place, index) => ({ place, day: section.day, index }))).filter(item => { if (seen.has(item.place.id)) return false; seen.add(item.place.id); return true; });
  const occupied = [];
  markers.forEach(item => {
    const [px, py] = project(mapCoord(item.place)), hotel = placeKind(item.place) === 'hotel', color = hotel ? '#596f60' : dayColor(item.day);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(hotel ? 'H' : String(item.index + 1), px, py + 4); ctx.textAlign = 'left';
    if (markers.length > 14) return;
    const name = [...item.place.name].slice(0, 13).join('') + (item.place.name.length > 13 ? '…' : '');
    ctx.font = '700 12px system-ui, sans-serif'; const boxWidth = Math.min(184, ctx.measureText(name).width + 18);
    const bx = Math.min(plot.x + plot.width - boxWidth - 6, Math.max(plot.x + 6, px + 15));
    let by = Math.min(plot.y + plot.height - 27, Math.max(plot.y + 6, py - 13));
    for (let attempt = 0; attempt < 5 && occupied.some(box => bx < box.x + box.width && bx + boxWidth > box.x && by < box.y + 25 && by + 25 > box.y); attempt++) by = Math.min(plot.y + plot.height - 27, by + 27);
    occupied.push({ x: bx, y: by, width: boxWidth });
    ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.beginPath(); ctx.roundRect(bx, by, boxWidth, 25, 7); ctx.fill();
    ctx.fillStyle = '#3d5944'; ctx.fillText(name, bx + 9, by + 17, boxWidth - 17);
  });
  ctx.restore();
  ctx.fillStyle = '#718879'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText('N ↑', x + width - 62, y + 40);
  const legendY = plot.y + plot.height + 30;
  active.forEach((section, index) => { const lx = x + 31 + (index % 7) * 112, ly = legendY + Math.floor(index / 7) * 27; ctx.fillStyle = dayColor(section.day); ctx.beginPath(); ctx.arc(lx, ly - 4, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#516a57'; ctx.font = '700 12px system-ui, sans-serif'; ctx.fillText(`Day ${section.day}`, lx + 12, ly); });
  ctx.fillStyle = '#94a399'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(`${basemap ? '© 高德地图 · ' : ''}实线为已获取道路路线，虚线为地点连线示意`, x + 29, y + height - 17);
}
async function exportTripImage() {
  const trip = state.trip, days = Array.from({ length: trip.dayCount || 3 }, (_, index) => index + 1);
  const width = 900, sections = days.map(day => ({ day, nodes: dayRoute(day), legs: dayLegs(day) }));
  const sectionHeight = section => 96 + Math.max(1, section.nodes.length) * 76 + 36;
  const activeDays = sections.filter(section => section.legs.length || section.nodes.some(place => place.category !== '酒店')).length, mapHeight = 420 + Math.max(0, Math.ceil(activeDays / 7) - 1) * 27;
  const height = 240 + mapHeight + 20 + sections.reduce((sum, section) => sum + sectionHeight(section) + 20, 0) + 76;
  if (height > 30000) return toast('行程太长，暂时无法生成单张图片');
  const canvas = document.createElement('canvas'), scale = height > 15000 ? 1 : 2;
  canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext('2d'); if (!ctx) return toast('此浏览器暂不支持图片导出');
  ctx.scale(scale, scale);
  const rounded = (x, y, w, h, radius, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); };
  const label = (value, x, y, font, color, maxWidth) => { ctx.fillStyle = color; ctx.font = font; ctx.fillText(String(value), x, y, maxWidth); };
  const compact = (value, limit = 28) => { const chars = [...String(value || '')]; return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : chars.join(''); };
  ctx.fillStyle = '#f4f7f1'; ctx.fillRect(0, 0, width, height);
  rounded(0, 0, width, 218, 0, '#294b3a');
  label('旅伴地图  /  OUR TRIP', 48, 59, '700 16px system-ui, sans-serif', '#acd6b6');
  label(compact(trip.title, 26), 48, 116, '700 42px system-ui, sans-serif', '#ffffff', 800);
  label(`${trip.destination || '旅行目的地'}  ·  ${trip.startDate && trip.endDate ? `${trip.startDate} — ${trip.endDate}` : '日期待定'}  ·  ${days.length} 天`, 48, 161, '17px system-ui, sans-serif', '#d7ebdb', 800);
  const mapPlotHeight = mapHeight - 133 - Math.max(0, Math.ceil(activeDays / 7) - 1) * 27;
  const basemap = await captureTripBasemap(sections.filter(section => section.legs.length || section.nodes.some(place => place.category !== '酒店')), width - 94, mapPlotHeight);
  try { drawTripRouteMap(ctx, sections, 28, 239, width - 56, mapHeight, basemap); } finally { basemap?.dispose(); }
  let y = 239 + mapHeight + 20;
  for (const section of sections) {
    const cardHeight = sectionHeight(section), color = dayColor(section.day);
    rounded(28, y, width - 56, cardHeight, 20, '#ffffff');
    rounded(28, y, 9, cardHeight, 4, color);
    label(`DAY ${section.day}`, 54, y + 42, '700 23px system-ui, sans-serif', color);
    label(`${dayDate(section.day) ? dateText(dayDate(section.day)) : '日期待定'}  ·  ${dayPlaces(section.day).length} 个地点`, 184, y + 40, '15px system-ui, sans-serif', '#708174');
    let rowY = y + 82;
    if (!section.nodes.length) label('这一天还没有安排地点', 68, rowY + 15, '16px system-ui, sans-serif', '#94a397');
    section.nodes.forEach((place, index) => {
      const kind = placeKind(place), icon = kind === 'hotel' ? '住' : kind === 'eat' ? '吃' : '玩';
      rounded(56, rowY - 24, 38, 38, 11, kind === 'hotel' ? '#e9e9f6' : kind === 'eat' ? '#fff0df' : '#e6f1e7');
      label(icon, 66, rowY + 1, '700 17px system-ui, sans-serif', kind === 'hotel' ? '#696aa2' : kind === 'eat' ? '#b8763f' : '#4d8861');
      label(compact(place.name, 36), 108, rowY + 2, '700 18px system-ui, sans-serif', '#304b39', 600);
      const leg = section.legs.find(item => item.from.id === place.id && item.to.id === section.nodes[index + 1]?.id);
      if (leg) {
        const result = legResult(leg), mode = modeLabels[legMode(section.day, leg.from, leg.to)];
        const duration = result.status === 'complete' || result.status === 'estimate' ? `约 ${timeLabel(result.time)}${result.status === 'estimate' ? '（直线估算）' : ''}` : '时间待计算';
        label(`${mode}  ·  ${duration}`, 109, rowY + 37, '13px system-ui, sans-serif', '#859788');
      }
      rowY += 76;
    });
    label(dayDistanceLabel(section.day), 56, y + cardHeight - 19, '13px system-ui, sans-serif', '#809185', 760);
    y += cardHeight + 20;
  }
  label('由旅伴地图生成  ·  路线时间与地图连线仅供参考', 34, height - 29, '13px system-ui, sans-serif', '#819588');
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return toast('图片生成失败，请重试');
  if (state.exportImageUrl) URL.revokeObjectURL(state.exportImageUrl);
  state.exportImageUrl = URL.createObjectURL(blob);
  const filename = `${(trip.title || '旅行行程').replace(/[\\/:*?"<>|]/g, '_')}-行程.png`;
  showModal(`<div class="modal modal-wide itinerary-image-modal">${modalHeader('行程长图', '行程图片已生成')}<p>已附路线地图、每天的酒店与地点顺序，以及交通方式和预计时间。可以先预览，再保存图片。</p><div class="itinerary-image-preview"><img src="${state.exportImageUrl}" alt="${escapeHtml(trip.title)}的行程长图"></div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>关闭</button><a class="primary-button" href="${state.exportImageUrl}" download="${escapeHtml(filename)}">↓ 保存 PNG 图片</a></div></div>`);
}
function renderSummary() {
  const trip = state.trip;
  $('#tripSummary').innerHTML = `<div class="trip-eyebrow">OUR NEXT JOURNEY</div><h1>${escapeHtml(trip.title)}</h1><div class="trip-destination">📍 ${escapeHtml(trip.destination || '一起决定目的地')} · ${trip.startDate && trip.endDate ? `${dateText(trip.startDate)}—${dateText(trip.endDate)} · ` : '日期待定 · '}${trip.dayCount || 3} 天</div><button type="button" class="trip-date-button" data-edit-trip-dates>${trip.startDate && trip.endDate ? '调整日期 ↗' : '设置旅行日期 ↗'}</button>`;
  $('#mapTitle').textContent = `${trip.title} · 共享地图`;
  $('#placeCount').textContent = trip.places.filter(p => p.status !== 'archived').length;
}
function renderMembers() {
  const trip = state.trip;
  const online = trip.members.filter(member => state.online.includes(member.id));
  $('#membersBlock').innerHTML = `<div class="members-head"><span>旅行伙伴 · ${trip.members.length} 人 <em class="online-count">${online.length} 人在线</em></span><button data-share>邀请加入 ↗</button></div><div class="member-list">${trip.members.map(member => `<div class="member-chip ${state.online.includes(member.id) ? 'is-online' : ''}">${avatar(member)}<span>${escapeHtml(member.name)}</span><small>${state.online.includes(member.id) ? '在线' : '离线'}</small></div>`).join('')}</div>`;
}
function renderFilters() {
  const filters = [['all', '全部'], ['pending', '待定'], ['planned', '已安排']];
  $('#filterChips').innerHTML = filters.map(([value, label]) => `<button class="filter-chip ${state.filter === value ? 'active' : ''}" data-filter="${value}">${label}</button>`).join('');
}
function filteredPlaces(view = state.sideView) {
  const filter = view === 'places' ? state.filter : 'all';
  return state.trip.places.filter(p => p.status !== 'archived' && (view !== 'eat' && view !== 'play' || placeKind(p) === view) && (filter === 'all' || (filter === 'pending' ? planningLabel(p) === '待定' : planningLabel(p) !== '待定')) && (!state.search || `${p.name} ${p.reason} ${p.category}`.toLocaleLowerCase().includes(state.search.toLocaleLowerCase())));
}
function visibleMapPlaces() {
  if (state.sideView === 'eat' || state.sideView === 'play') return filteredPlaces();
  if (state.sideView === 'hotels') return state.trip.places.filter(p => p.status !== 'archived' && placeKind(p) === 'hotel');
  if (state.sideView === 'places') return filteredPlaces();
  return state.trip.places.filter(p => p.status !== 'archived');
}
function commenterMembers(p) { return [...new Set((p.comments || []).map(comment => comment.authorId))].map(memberById); }
function placeCard(p) {
  const author = memberById(p.authorId);
  const voters = Object.entries(p.votes).filter(([, vote]) => vote === 'want').map(([id]) => memberById(id));
  const commenters = commenterMembers(p);
  const price = ['eat', 'hotel'].includes(placeKind(p)) ? `<span class="card-price">${p.costNote ? escapeHtml(p.costNote) : '价格待补充'}</span>` : '';
  return `<article class="place-card kind-${placeKind(p)} ${state.selectedPlaceId === p.id ? 'selected' : ''}" data-place-id="${p.id}"><div class="place-card-top">${photoMarkup(p)}<div class="place-card-title"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(author.name)}提出 · ${escapeHtml(p.category)}</small>${price}</div><span class="status-dot ${p.dayIndex || assignedHotelDays(p).length ? 'scheduled' : 'pending'}">${planningLabel(p)}</span></div>${p.reason ? `<p>${escapeHtml(p.reason)}</p>` : ''}<div class="place-card-bottom"><div class="mini-avatars">${voters.slice(0, 3).map(m => avatar(m)).join('')}</div><span>${voters.length ? `${voters.length} 人想去` : '等待伙伴表态'}</span><span class="spacer"></span><span class="comment-participants">${commenters.slice(0, 2).map(m => `<i style="background:${escapeHtml(m.color)}" title="${escapeHtml(m.name)}">${escapeHtml(m.name.slice(0, 1))}</i>`).join('')}<b>◌ ${p.comments.length}</b></span></div></article>`;
}
function planningCard(p) {
  const suggested = recommendedDay(p);
  const options = [`<option value="" ${!p.dayIndex ? 'selected' : ''}>待定</option>`, ...Array.from({ length: state.trip.dayCount || 3 }, (_, i) => `<option value="${i + 1}" ${p.dayIndex === i + 1 ? 'selected' : ''}>Day ${i + 1}${dayDate(i + 1) ? ` · ${dateText(dayDate(i + 1))}` : ''}</option>`)];
  return `<div class="planning-card">${placeCard(p)}<div class="planning-controls"><label>安排在哪天<select data-quick-day="${p.id}">${options.join('')}</select></label>${suggested && suggested.day !== p.dayIndex ? `<button data-suggest-day="${p.id}" data-suggest-target="${suggested.day}" title="按现有路线的直线距离估算">↗ 建议 Day ${suggested.day}<small>约 +${formatKm(suggested.delta)}</small></button>` : ''}</div></div>`;
}
function hotelSelect(day, role) {
  const selected = state.trip.dayHotels?.[day]?.[role] || '';
  const hotels = state.trip.places.filter(p => p.category === '酒店' && p.status !== 'archived');
  return `<label class="hotel-route-field">${role === 'start' ? '出发酒店' : '结束酒店'}<select class="status-select" data-day-hotel="${day}" data-hotel-role="${role}"><option value="">不设置</option>${hotels.map(p => `<option value="${p.id}" ${selected === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>`;
}
function hotelDayControls(p) {
  return `<div class="hotel-day-list">${Array.from({ length: state.trip.dayCount || 3 }, (_, i) => i + 1).map(day => {
    const assignment = state.trip.dayHotels?.[day] || {}, start = assignment.start === p.id, end = assignment.end === p.id;
    const confirmed = start && end;
    return `<div class="hotel-day-row"><span><strong>${dayLabel(day)}</strong><small>${confirmed ? '已确定 · 出发和结束都从这里' : start || end ? `已安排为${start ? '出发' : '结束'}酒店` : '待定'}</small></span><button class="${confirmed ? 'confirmed' : ''}" data-confirm-hotel-day="${day}" data-confirm-hotel-id="${p.id}" data-confirmed="${confirmed ? 'false' : 'true'}">${confirmed ? '改回待定' : '确定这天'}</button></div>`;
  }).join('')}</div>`;
}
function estimatedLeg(leg) {
  const km = kmBetween(leg.from, leg.to), mode = legMode(leg.day, leg.from, leg.to);
  const minutes = Math.max(1, Math.round((km / { walk: 4.5, drive: 25, transit: 18 }[mode]) * 60 + (mode === 'transit' ? 8 : 0)));
  return { status: 'estimate', distance: km * 1000, time: minutes * 60, path: [mapCoord(leg.from), mapCoord(leg.to)] };
}
function legResult(leg) { return state.legCache.get(legKey(leg)) || (state.provider === 'amap' && [leg.from, leg.to].every(inChina) ? { status: 'pending' } : estimatedLeg(leg)); }
function timeLabel(seconds) { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60 ? `${minutes % 60} 分钟` : ''}`.trim() : `${minutes} 分钟`; }
function dayDistanceLabel(day) {
  const legs = dayLegs(day);
  if (!legs.length) return '暂无路线';
  const results = legs.map(legResult);
  if (results.some(item => item.status === 'pending')) return `逐段规划中 · ${legs.length} 段`;
  const available = results.filter(item => ['complete', 'estimate'].includes(item.status));
  if (available.length !== legs.length) return `${available.length}/${legs.length} 段有路线时间`;
  return `${formatKm(available.reduce((sum, item) => sum + item.distance, 0) / 1000)} · 预计 ${timeLabel(available.reduce((sum, item) => sum + item.time, 0))}${results.some(item => item.status === 'estimate') ? ' · 含直线估算' : ''}`;
}
function renderLegs(day) {
  const legs = dayLegs(day);
  if (!legs.length) return '<p class="leg-empty">确认酒店并安排地点后，显示逐段时间和交通方式。</p>';
  return `<div class="leg-list"><strong>逐段交通</strong>${legs.map(leg => {
    const mode = legMode(day, leg.from, leg.to), result = legResult(leg);
    const description = result.status === 'complete' || result.status === 'estimate' ? `约 ${timeLabel(result.time)} · ${formatKm(result.distance / 1000)}${result.status === 'estimate' ? ' · 直线估算' : ''}` : result.status === 'pending' ? '正在计算预计时间…' : '暂无路线，请在高德查看';
    return `<div class="route-leg"><div class="route-leg-names"><span>${escapeHtml(leg.from.name)} → ${escapeHtml(leg.to.name)}</span><small>${description}</small></div><div class="route-leg-modes">${[['walk', '🚶 步行'], ['transit', '🚌 公交'], ['drive', '🚗 驾车']].map(([value, label]) => `<button data-leg-mode="${value}" data-leg-day="${day}" data-leg-from="${leg.from.id}" data-leg-to="${leg.to.id}" class="${mode === value ? 'active' : ''}" aria-pressed="${mode === value}">${label}</button>`).join('')}</div></div>`;
  }).join('')}</div>`;
}
function scheduleDayMarkup(day) {
  const places = dayPlaces(day);
  return `<section class="schedule-section" style="--day-color:${dayColor(day)}"><div class="schedule-section-head"><div><strong><i class="day-color-dot" style="background:${dayColor(day)}"></i>Day ${day}</strong><span>${dayDate(day) ? dateText(dayDate(day)) : '日期待定'} · ${places.length} 个地点</span></div><div class="schedule-head-actions"><button data-optimize-day="${day}" ${places.length < 2 ? 'disabled' : ''} title="按地点直线距离寻找更顺路的顺序">顺路排</button><button data-map-day="${day}">看地图 ↗</button></div></div><div class="hotel-route-fields">${hotelSelect(day, 'start')}${hotelSelect(day, 'end')}</div>${places.length ? places.map((p, index) => `<div class="schedule-stop"><span class="stop-number">${index + 1}</span><div class="schedule-card">${placeCard(p)}<div class="reorder-buttons"><button data-reorder="up" data-reorder-place="${p.id}" ${index === 0 ? 'disabled' : ''} title="向前一站">↑</button><button data-reorder="down" data-reorder-place="${p.id}" ${index === places.length - 1 ? 'disabled' : ''} title="向后一站">↓</button></div></div></div>`).join('') : '<div class="schedule-empty">还没有地点。从地点详情加入这一天。</div>'}${renderLegs(day)}<div class="schedule-distance">${dayDistanceLabel(day)}</div>${dayExportButton(day, 'export-day-button', isPhone() ? `↗ 在手机高德打开 Day ${day}` : `⌁ 发 Day ${day} 路线到手机高德`)}</section>`;
}
function renderSchedulePage() {
  const overlay = $('#scheduleOverlay'); overlay.hidden = !state.scheduleOpen;
  if (!state.scheduleOpen || !state.trip) return;
  const area = $('#schedulePageContent'), position = area.scrollTop;
  $('#schedulePageSubtitle').textContent = `${state.trip.title} · ${state.trip.startDate && state.trip.endDate ? `${dateText(state.trip.startDate)}—${dateText(state.trip.endDate)}` : '日期待定'} · 共 ${state.trip.dayCount || 3} 天`;
  area.innerHTML = `<div class="schedule-page-top"><p>逐日安排酒店、地点顺序和交通方式；点击“看地图”查看当天路线。</p><div class="schedule-export-actions"><button type="button" class="export-image-button" data-export-trip-image>↓ 导出行程长图</button>${tripExportButton()}</div></div><div class="schedule-grid">${Array.from({ length: state.trip.dayCount || 3 }, (_, i) => scheduleDayMarkup(i + 1)).join('')}</div>`;
  enhanceSelects(area);
  area.scrollTop = position;
}
function openSchedule() { state.scheduleOpen = true; renderSchedulePage(); renderSidebarContent(); }
function closeSchedule() { if (!state.scheduleOpen) return; state.scheduleOpen = false; $('#scheduleOverlay').hidden = true; renderSidebarContent(); updateUnread(); }
function renderSidebarContent() {
  const area = $('#sidebarContent');
  $('#listControls').hidden = !['places', 'eat', 'play'].includes(state.sideView);
  $('#filterChips').hidden = state.sideView !== 'places';
  $('#addPlaceButton').hidden = ['schedule', 'activity'].includes(state.sideView);
  $('#addPlaceButton').innerHTML = `<span>📍</span> 添加${state.sideView === 'eat' ? '吃饭地点' : state.sideView === 'play' ? '游玩地点' : state.sideView === 'hotels' ? '酒店' : '地点'}`;
  $('#viewSwitch').querySelectorAll('button').forEach(button => button.classList.toggle('active', !state.scheduleOpen && button.dataset.view === state.sideView));
  $('#tripNav').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.view === 'schedule' ? state.scheduleOpen : button.dataset.view === state.sideView));
  if (state.sideView === 'places') {
    const places = filteredPlaces();
    area.innerHTML = places.length ? places.map(placeCard).join('') : `<div class="empty-state"><span class="empty-icon">📍</span>${state.trip.places.length ? '还没有符合条件的地点' : '地图上还没有地点。点击左下角加号标记第一个地点。'}</div>`;
  } else if (state.sideView === 'eat' || state.sideView === 'play') {
    const eating = state.sideView === 'eat', places = filteredPlaces();
    area.innerHTML = `<div class="category-intro ${eating ? 'eat' : 'play'}"><strong>${eating ? '🍜 吃什么' : '⛩️ 玩什么'}</strong><span>地图只显示${eating ? '美食和咖啡' : '景点、散步和购物'}。选一天先看路线变化，再确认安排。</span></div>` + (places.length ? places.map(planningCard).join('') : `<div class="empty-state"><span class="empty-icon">${eating ? '🍜' : '⛩️'}</span>还没有符合条件的${eating ? '吃饭' : '游玩'}地点。可以在地图上提议。</div>`);
  } else if (state.sideView === 'hotels') {
    const hotels = state.trip.places.filter(p => p.category === '酒店' && p.status !== 'archived');
    area.innerHTML = `<div class="hotel-intro">酒店可作为每天路线的出发地或结束地；选择后会进入路线规划。</div>${hotels.length ? hotels.map(placeCard).join('') : '<div class="empty-state"><span class="empty-icon">🛏️</span>还没有酒店，点击下方“标记酒店”。</div>'}`;
  } else {
    area.innerHTML = state.trip.activity.length ? state.trip.activity.map(item => { const m = memberById(item.authorId); return `<div class="activity-row">${avatar(m)}<div><p><strong>${escapeHtml(m.name)}</strong> ${escapeHtml(item.text)}</p><small>${timeText(item.createdAt)}</small></div></div>`; }).join('') : '<div class="empty-state">新的讨论与决定会出现在这里。</div>';
  }
  enhanceSelects(area);
}
function renderGroup() {
  const messages = state.trip.messages;
  return `<div class="discussion-header"><div class="discussion-eyebrow">TRAVEL ROOM</div><h2>旅行群聊</h2><p>所有想法都从这里开始，也可以直接在地图地点下讨论</p></div><div class="chat-scroll" id="chatScroll"><div class="chat-intro">你们的旅行讨论从这里开始</div>${messages.map(message => { const m = memberById(message.authorId); const linked = message.placeId && state.trip.places.find(p => p.id === message.placeId); return `<div class="message-row ${message.authorId === state.memberId ? 'mine' : ''}">${avatar(m)}<div class="message-body"><div class="message-meta">${escapeHtml(m.name)} · ${timeText(message.createdAt)}</div><div class="message-bubble">${escapeHtml(message.text)}${linked ? `<button class="linked-place" data-place-id="${linked.id}">📍 查看地图上的 ${escapeHtml(linked.name)} →</button>` : ''}</div></div></div>`; }).join('')}</div><form class="composer" id="groupForm"><textarea id="groupInput" placeholder="和伙伴聊聊这趟旅行…" maxlength="1000">${escapeHtml(state.drafts.group)}</textarea><div class="composer-bottom"><select id="messagePlace" class="status-select" style="width:155px;padding:6px 7px"><option value="">不关联地点</option>${state.trip.places.filter(p => p.status !== 'archived').map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select><button class="send-button" type="submit">发送 ↗</button></div></form>`;
}
function renderPlace() {
  const p = selectedPlace(); if (!p) { state.rightMode = 'group'; return renderGroup(); }
  const author = memberById(p.authorId);
  const votes = { want: 0, maybe: 0, pass: 0 }; Object.values(p.votes).forEach(value => { if (votes[value] !== undefined) votes[value]++; });
  const myVote = p.votes[state.memberId] || '';
  const source = safeUrl(p.sourceUrl);
  const mapUrl = state.provider === 'amap' ? `https://uri.amap.com/marker?position=${mapCoord(p).join(',')}&name=${encodeURIComponent(p.name)}` : `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;
  const commenters = commenterMembers(p);
  const priceFocus = ['eat', 'hotel'].includes(placeKind(p));
  const hasPhoto = Boolean(safeImage(p.coverImage) || safeImage(p.sourceImage));
  const missingPostCover = source && sourceSite(source) === '小红书' && !hasPhoto;
  const infoRows = [p.address ? `<div><span>位置</span><strong>${escapeHtml(p.address)}</strong></div>` : '', p.openingHours ? `<div><span>${placeKind(p) === 'hotel' ? '入住时间' : '营业时间'}</span><strong>${escapeHtml(p.openingHours)}</strong></div>` : '', !priceFocus && p.costNote ? `<div><span>参考费用</span><strong>${escapeHtml(p.costNote)}</strong></div>` : ''].filter(Boolean).join('');
  return `<div class="discussion-header"><div class="discussion-eyebrow">PLACE DISCUSSION</div><h2>${p.category === '酒店' ? '酒店详情' : '地点详情'}</h2><p>在这里一起决定要不要去、什么时候去</p></div>
    <div class="place-detail-scroll">
      <div class="detail-main">
        <div class="hero-photo-wrap">${photoMarkup(p, 'hero')}<button type="button" class="hero-cover-button" data-pick-cover>${hasPhoto ? '更换封面照片' : '上传封面照片'}</button><input type="file" accept="image/jpeg,image/png,image/webp" data-detail-cover-upload data-place-id="${p.id}" hidden></div>
        ${missingPostCover ? '<p class="cover-help">这篇笔记只返回了小红书平台图。上传真实照片后，这里和地图列表都会显示它。</p>' : ''}
        <div class="detail-topline"><span class="detail-category">${categories[p.category] || '📍'} ${escapeHtml(p.category)}</span><span class="status-dot ${p.dayIndex || assignedHotelDays(p).length ? 'scheduled' : 'pending'}">${planningLabel(p)}</span></div>
        <h2>${escapeHtml(p.name)}</h2>
        <div class="detail-author">${avatar(author)}<span>${escapeHtml(author.name)}提出${p.dayIndex ? ` · Day ${p.dayIndex} 第 ${dayPlaces(p.dayIndex).findIndex(item => item.id === p.id) + 1} 站` : ''}</span></div>
        ${priceFocus ? `<div class="detail-price"><small>${placeKind(p) === 'hotel' ? '参考房价' : '参考人均'}</small><strong>${escapeHtml(p.costNote || '价格待补充')}</strong><span>价格会变化，预订或到店前请核对</span></div>` : ''}
        ${infoRows ? `<div class="detail-info">${infoRows}</div>` : ''}
        ${p.reason ? `<div class="reason-box">${escapeHtml(p.reason)}</div>` : ''}
        <div class="detail-links"><a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">↗ 在${state.provider === 'amap' ? '高德地图' : 'OpenStreetMap'}看位置</a><button data-edit-place="${p.id}">✎ 编辑资料与照片</button></div>
        ${source ? `<div class="detail-source-heading">参考帖子</div>${sourcePreviewMarkup(p)}` : ''}
      </div>
      <section class="detail-section"><h3>要不要去？</h3><div class="vote-row">${[['want', '♡ 想去'], ['maybe', '◇ 可以'], ['pass', '— 暂不去']].map(([value, label]) => `<button class="vote-button ${myVote === value ? 'active' : ''}" data-vote="${value}">${label}</button>`).join('')}</div><div class="vote-summary">${votes.want} 人想去 · ${votes.maybe} 人可以 · ${votes.pass} 人暂不去</div></section>
      <section class="detail-section">${p.category === '酒店' ? `<h3>住宿安排</h3><p class="day-help">确定某天后，路线会从这家酒店出发，并连回这里。可在“行程”分别调整出发和结束酒店。</p>${hotelDayControls(p)}<button class="text-link" data-view="schedule">打开行程安排 ↗</button>` : `<h3>讨论进程</h3><select class="status-select" id="placeDay" data-place-day="${p.id}"><option value="" ${!p.dayIndex ? 'selected' : ''}>待定</option>${Array.from({ length: state.trip.dayCount || 3 }, (_, i) => `<option value="${i + 1}" ${p.dayIndex === i + 1 ? 'selected' : ''}>${dayLabel(i + 1)}</option>`).join('')}</select><p class="day-help">选 Day 后先预览路线变化，确认后才加入当天；选“待定”会从路线移出，地图图标变淡。</p>${p.dayIndex ? `<button class="text-link" data-map-day="${p.dayIndex}">在地图上看 Day ${p.dayIndex} 路线 ↗</button>` : ''}`}</section>
      <section class="detail-section"><div class="detail-comment-head"><h3>地点讨论 · ${p.comments.length}</h3><button data-chat-about="${p.id}">在群聊提起 ↗</button></div>${commenters.length ? `<div class="commenter-line">${commenters.map(m => avatar(m)).join('')}<span>${commenters.map(m => escapeHtml(m.name)).join('、')}参与了讨论</span></div>` : ''}${p.comments.length ? p.comments.map(comment => { const m = memberById(comment.authorId); return `<div class="comment-item">${avatar(m)}<div class="comment-copy"><div class="comment-meta">${escapeHtml(m.name)}<span>${timeText(comment.createdAt)}</span></div>${comment.text ? `<p>${escapeHtml(comment.text)}</p>` : ''}${comment.sourceUrl ? sourcePreviewMarkup({ ...comment, commentId: comment.id, commentPlaceId: p.id }) : ''}</div></div>`; }).join('') : '<p style="font-size:11px;color:#a1a9a1">还没有回复，先说说你的想法。</p>'}</section>
    </div><form class="composer" id="placeForm"><textarea id="placeInput" placeholder="关于这个地点，你有什么想法？" maxlength="1000">${escapeHtml(placeDraft(p.id).text)}</textarea><input class="comment-link-input" id="placeCommentLink" data-comment-source-input placeholder="＋ 附小红书或大众点评帖子（可选）" value="${escapeHtml(placeDraft(p.id).link)}"><div class="comment-source-status" data-comment-source-status></div><div class="comment-source-preview" data-comment-source-preview></div><div class="composer-bottom"><span>评论和帖子会一起留在这个地点下</span><button class="send-button" type="submit">回复 ↗</button></div></form>`;
}
function renderDiscussion() {
  const oldScroll = $('#chatScroll'); const shouldBottom = !oldScroll || oldScroll.scrollHeight - oldScroll.scrollTop - oldScroll.clientHeight < 60;
  const tabs = state.openPlaceIds.map(id => state.trip.places.find(p => p.id === id)).filter(p => p && p.status !== 'archived');
  $('#discussionContent').innerHTML = `<div class="detail-pane-bar"><strong>讨论与详情</strong><button data-close-discussion aria-label="收起讨论与详情" title="收起面板">×</button></div><div class="detail-tabs" role="tablist" aria-label="打开的讨论"><button class="detail-tab-group ${state.rightMode === 'group' ? 'active' : ''}" data-detail-group role="tab" aria-selected="${state.rightMode === 'group'}">💬 群聊<span class="unread-badge" id="groupTabUnread" hidden></span></button>${tabs.map(p => `<div class="detail-tab ${state.rightMode === 'place' && state.selectedPlaceId === p.id ? 'active' : ''}"><button data-detail-tab="${p.id}" role="tab" aria-selected="${state.rightMode === 'place' && state.selectedPlaceId === p.id}" title="${escapeHtml(p.name)}">${categories[p.category] || '📍'} ${escapeHtml(p.name)}</button><button class="detail-tab-close" data-close-detail="${p.id}" aria-label="关闭${escapeHtml(p.name)}的详情标签" title="关闭详情标签，不删除地点">×</button></div>`).join('')}</div>${state.rightMode === 'place' ? renderPlace() : renderGroup()}`;
  enhanceSelects($('#discussionContent'));
  const newScroll = $('#chatScroll'); if (newScroll && shouldBottom) newScroll.scrollTop = newScroll.scrollHeight;
  updateUnread();
}
function renderConnection() {
  const element = $('#connection'); const connected = state.connection === 'connected';
  element.classList.toggle('offline', !connected); element.innerHTML = `<i></i>${connected ? '实时同步中' : '正在重新连接'}`;
}
function renderMapDayBar() {
  const tabs = [['all', '全部'], ...Array.from({ length: state.trip.dayCount || 3 }, (_, i) => [String(i + 1), `Day ${i + 1}`])];
  const day = Number(state.mapDay);
  const places = state.mapDay === 'all' ? [] : dayPlaces(day);
  $('#mapDayBar').innerHTML = `<div class="day-tabs">${tabs.map(([value, label]) => `<button data-map-day="${value}" class="${String(state.mapDay) === value ? 'active' : ''}">${value === 'all' ? '' : `<i class="day-color-dot" style="background:${dayColor(Number(value))}"></i>`}${label}</button>`).join('')}</div><span class="day-route-caption">${state.mapDay === 'all' ? '每日路线按颜色区分' : `${places.length} 个地点${dayHotel(day, 'start') || dayHotel(day, 'end') ? ' · 含酒店' : ''} · ${dayDistanceLabel(day)}`}</span>${state.mapDay === 'all' ? '' : `${dayExportButton(day, 'map-export', '↗ 打开高德')}`}`;
}
function renderRoutePreview() {
  const box = $('#routePreview'); const preview = state.routePreview;
  $('#mapHint').hidden = Boolean(preview);
  if (!preview) { box.hidden = true; box.innerHTML = ''; return; }
  const p = preview.kind === 'optimize' ? null : state.trip.places.find(item => item.id === preview.placeId);
  if (preview.kind !== 'optimize' && !p) { state.routePreview = null; box.hidden = true; return; }
  const title = preview.kind === 'optimize' ? `预览：Day ${preview.dayIndex} 顺路排序` : preview.dayIndex ? `预览：${escapeHtml(p.name)}${preview.oldDayIndex ? '移到' : '加入'} Day ${preview.dayIndex}` : `预览：${escapeHtml(p.name)}移出 Day ${preview.oldDayIndex}`;
  box.hidden = false;
  const road = preview.road?.status === 'complete' ? preview.road : null;
  const oldTotal = road ? (road.before.distance + road.sourceBefore.distance) / 1000 : routeKm(dayRoute(preview.dayIndex || preview.oldDayIndex, preview.before)) + (preview.sourceBefore ? routeKm(dayRoute(preview.oldDayIndex, preview.sourceBefore)) : 0);
  const newTotal = road ? (road.after.distance + road.sourceAfter.distance) / 1000 : routeKm(dayRoute(preview.dayIndex || preview.oldDayIndex, preview.after)) + (preview.sourceAfter ? routeKm(dayRoute(preview.oldDayIndex, preview.sourceAfter)) : 0);
  const difference = newTotal - oldTotal;
  const signed = difference >= 0 ? `+${formatKm(difference)}` : `−${formatKm(-difference)}`;
  const note = road ? `预计驾车时间 ${Math.round((road.before.time + road.sourceBefore.time) / 60)} → ${Math.round((road.after.time + road.sourceAfter.time) / 60)} 分钟。` : preview.road?.status === 'pending' ? '高德道路路线计算中，当前显示直线估算。' : '按直线距离建议插入位置；实际道路可能不同。';
  box.innerHTML = `<div class="preview-eyebrow">ROUTE PREVIEW · ${road ? '高德道路路线' : '地点连线示意'}</div><h3>${title}</h3><div class="preview-route"><small>当前</small><span>${escapeHtml(routeNames(dayRoute(preview.dayIndex || preview.oldDayIndex, preview.before)))}</span></div><div class="preview-route proposed"><small>调整后</small><span>${escapeHtml(routeNames(dayRoute(preview.dayIndex || preview.oldDayIndex, preview.after)))}</span></div>${preview.sourceBefore ? `<div class="preview-route"><small>原 Day ${preview.oldDayIndex}</small><span>${escapeHtml(routeNames(dayRoute(preview.oldDayIndex, preview.sourceBefore)))} → ${escapeHtml(routeNames(dayRoute(preview.oldDayIndex, preview.sourceAfter)))}</span></div>` : ''}<div class="preview-delta">${road ? '道路距离' : '直线距离'} ${formatKm(oldTotal)} → ${formatKm(newTotal)} <strong>${signed}</strong></div><p>${note}</p><div class="preview-actions"><button data-cancel-preview>取消</button><button data-confirm-preview>确认调整</button></div>`;
}
function inChina(p) { return p.lng >= 73 && p.lng <= 135 && p.lat >= 18 && p.lat <= 54; }
function gcjDelta(lng, lat) {
  if (lng < 73.66 || lng > 135.05 || lat < 3.86 || lat > 53.55) return [0, 0];
  const x = lng - 105, y = lat - 35;
  const common = 20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI);
  let dLat = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x)) + (common + 20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3 + (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  let dLng = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x)) + (common + 20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3 + (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  const radLat = lat / 180 * Math.PI, magic = 1 - .006693421622965943 * Math.sin(radLat) ** 2;
  dLat = dLat * 180 / ((6335552.717 / (magic * Math.sqrt(magic))) * Math.PI);
  dLng = dLng * 180 / ((6378245 / Math.sqrt(magic) * Math.cos(radLat)) * Math.PI);
  return [dLng, dLat];
}
function mapCoord(p) { const [dx, dy] = state.provider === 'amap' ? gcjDelta(p.lng, p.lat) : [0, 0]; return [p.lng + dx, p.lat + dy]; }
function storedCoord(lng, lat) { const [dx, dy] = state.provider === 'amap' ? gcjDelta(lng, lat) : [0, 0]; return { lng: lng - dx, lat: lat - dy }; }
function clearRoutes() {
  if (state.provider === 'amap') { state.map?.remove(state.routeOverlays); state.routeOverlays = []; }
  else state.routes?.clearLayers();
}
function drawRoutePath(path, color, options = {}) {
  if (path.length < 2) return;
  if (state.provider === 'amap') {
    const line = new AMap.Polyline({ path, strokeColor: color, strokeWeight: options.weight || 5, strokeOpacity: options.opacity || .85, strokeStyle: options.dashArray ? 'dashed' : 'solid', lineJoin: 'round', showDir: false });
    state.map.add(line); state.routeOverlays.push(line);
  } else L.polyline(path.map(point => [point[1], point[0]]), { color, weight: options.weight || 5, opacity: options.opacity || .85, dashArray: options.dashArray || null, lineJoin: 'round' }).addTo(state.routes);
}
async function queryRoadNodes(nodes) {
  if (nodes.length < 2) return { distance: 0, time: 0, path: [] };
  if (state.provider !== 'amap' || !window.AMap?.Driving || !nodes.every(inChina)) return null;
  const chunks = [];
  for (let start = 0; start < nodes.length - 1; start += 17) chunks.push(nodes.slice(start, Math.min(start + 18, nodes.length)));
  const parts = await Promise.all(chunks.map(chunk => new Promise(resolve => {
    const driving = new AMap.Driving({ policy: 0, extensions: 'base' });
    const points = chunk.map(mapCoord);
    driving.search(points[0], points.at(-1), { waypoints: points.slice(1, -1) }, (status, result) => {
      const route = status === 'complete' ? result?.routes?.[0] : null;
      if (!route) return resolve(null);
      resolve({ distance: Number(route.distance) || 0, time: Number(route.time) || 0, path: (route.steps || []).flatMap(step => (step.path || []).map(point => [point.lng ?? point.getLng?.(), point.lat ?? point.getLat?.()]).filter(coords => coords.every(Number.isFinite))) });
    });
  })));
  return parts.every(Boolean) ? { distance: parts.reduce((sum, part) => sum + part.distance, 0), time: parts.reduce((sum, part) => sum + part.time, 0), path: parts.flatMap(part => part.path) } : null;
}
function amapPath(points) {
  return (points || []).map(point => [point.lng ?? point.getLng?.(), point.lat ?? point.getLat?.()]).filter(coords => coords.every(Number.isFinite));
}
function transitCity(leg) {
  const key = `${leg.from.lat.toFixed(2)},${leg.from.lng.toFixed(2)}`;
  if (!state.cityCache.has(key)) state.cityCache.set(key, new Promise(resolve => {
    const fallback = Object.entries(cities).filter(([, center]) => inChina({ lat: center[0], lng: center[1] })).sort((a, b) => kmBetween(leg.from, { lat: a[1][0], lng: a[1][1] }) - kmBetween(leg.from, { lat: b[1][0], lng: b[1][1] }))[0]?.[0] || '上海';
    new AMap.Geocoder({}).getAddress(mapCoord(leg.from), (status, result) => {
      const component = status === 'complete' ? result?.regeocode?.addressComponent : null;
      resolve((typeof component?.city === 'string' && component.city) || component?.province || fallback);
    });
  }));
  return state.cityCache.get(key);
}
async function queryLeg(leg) {
  const mode = legMode(leg.day, leg.from, leg.to);
  const city = mode === 'transit' ? await transitCity(leg) : '';
  const planner = mode === 'walk' ? new AMap.Walking({}) : mode === 'transit' ? new AMap.Transfer({ city, policy: 0 }) : new AMap.Driving({ policy: 0, extensions: 'base' });
  return new Promise(resolve => {
    planner.search(mapCoord(leg.from), mapCoord(leg.to), (status, result) => {
      const route = status === 'complete' ? (mode === 'transit' ? result?.plans?.[0] : result?.routes?.[0]) : null;
      if (!route) return resolve(null);
      const path = mode === 'transit' ? (route.segments || []).flatMap(segment => amapPath(segment.transit?.path)) : (route.steps || []).flatMap(step => amapPath(step.path));
      resolve({ distance: Number(route.distance) || kmBetween(leg.from, leg.to) * 1000, time: Number(route.time) || 0, path: [mapCoord(leg.from), ...path, mapCoord(leg.to)] });
    });
  });
}
function requestLeg(leg) {
  if (state.provider !== 'amap' || !window.AMap || ![leg.from, leg.to].every(inChina)) return;
  const key = legKey(leg);
  if (state.legCache.has(key)) return;
  state.legCache.set(key, { status: 'pending' });
  queryLeg(leg).then(route => {
    state.legCache.set(key, route?.time ? { status: 'complete', ...route } : { status: 'unavailable' });
    renderRoutes(); renderMapDayBar(); if (state.scheduleOpen) renderSchedulePage();
  }).catch(() => {
    state.legCache.set(key, { status: 'unavailable' });
    renderRoutes(); renderMapDayBar(); if (state.scheduleOpen) renderSchedulePage();
  });
}
function requestPreviewRoads(preview) {
  if (state.provider !== 'amap') return;
  const day = preview.dayIndex || preview.oldDayIndex;
  const before = dayRoute(day, preview.before), after = dayRoute(day, preview.after);
  const sourceBefore = preview.sourceBefore ? dayRoute(preview.oldDayIndex, preview.sourceBefore) : [];
  const sourceAfter = preview.sourceAfter ? dayRoute(preview.oldDayIndex, preview.sourceAfter) : [];
  if (![...before, ...after, ...sourceBefore, ...sourceAfter].every(inChina)) return;
  preview.road = { status: 'pending' }; renderRoutePreview();
  Promise.all([queryRoadNodes(before), queryRoadNodes(after), queryRoadNodes(sourceBefore), queryRoadNodes(sourceAfter)]).then(([oldRoute, newRoute, oldSource, newSource]) => {
    if (state.routePreview !== preview) return;
    preview.road = oldRoute && newRoute && oldSource && newSource ? { status: 'complete', before: oldRoute, after: newRoute, sourceBefore: oldSource, sourceAfter: newSource } : { status: 'unavailable' };
    renderRoutePreview(); renderRoutes();
  }).catch(() => { if (state.routePreview === preview) { preview.road = { status: 'unavailable' }; renderRoutePreview(); } });
}
function renderRoutes() {
  if (!state.map || !state.trip) return;
  clearRoutes();
  if (!state.routePreview && ['eat', 'play'].includes(state.sideView)) return;
  const draw = (places, color, options = {}) => drawRoutePath(places.map(mapCoord), color, options);
  if (state.routePreview) {
    const day = state.routePreview.dayIndex || state.routePreview.oldDayIndex;
    const road = state.routePreview.road?.status === 'complete' ? state.routePreview.road : null;
    if (road?.before.path.length >= 2) drawRoutePath(road.before.path, '#8f9b93', { weight: 4, opacity: .65, dashArray: '7 8' });
    else draw(dayRoute(day, state.routePreview.before), '#8f9b93', { weight: 4, opacity: .65, dashArray: '7 8' });
    if (road?.after.path.length >= 2) drawRoutePath(road.after.path, dayColor(day), { weight: 6, opacity: .95 });
    else draw(dayRoute(day, state.routePreview.after), dayColor(day), { weight: 6, opacity: .95 });
    if (state.routePreview.sourceBefore) {
      if (road?.sourceBefore.path.length >= 2) drawRoutePath(road.sourceBefore.path, '#8f9b93', { weight: 3, opacity: .5, dashArray: '7 8' });
      else draw(dayRoute(state.routePreview.oldDayIndex, state.routePreview.sourceBefore), '#8f9b93', { weight: 3, opacity: .5, dashArray: '7 8' });
      if (road?.sourceAfter.path.length >= 2) drawRoutePath(road.sourceAfter.path, dayColor(state.routePreview.oldDayIndex), { weight: 5, opacity: .8 });
      else draw(dayRoute(state.routePreview.oldDayIndex, state.routePreview.sourceAfter), dayColor(state.routePreview.oldDayIndex), { weight: 5, opacity: .8 });
    }
  } else {
    const days = state.mapDay === 'all' ? Array.from({ length: state.trip.dayCount || 3 }, (_, i) => i + 1) : [Number(state.mapDay)];
    days.forEach(day => dayLegs(day).forEach(leg => {
      const result = legResult(leg);
      drawRoutePath(result.path?.length >= 2 ? result.path : [mapCoord(leg.from), mapCoord(leg.to)], dayColor(day), { dashArray: result.status !== 'complete' || legMode(day, leg.from, leg.to) === 'walk' ? '7 7' : null, opacity: result.status === 'complete' ? .9 : .55 });
      requestLeg(leg);
    }));
  }
}
function previewDayChange(p, dayIndex) {
  if ((p.dayIndex || null) === (dayIndex || null)) return;
  const focusDay = dayIndex || p.dayIndex || 1;
  const before = dayPlaces(focusDay).filter(item => dayIndex ? item.id !== p.id : true);
  const best = dayIndex ? bestInsertion(before, p, dayIndex) : { index: 0, places: before.filter(item => item.id !== p.id) };
  const sourceBefore = p.dayIndex && dayIndex && p.dayIndex !== dayIndex ? dayPlaces(p.dayIndex) : null;
  const sourceAfter = sourceBefore ? sourceBefore.filter(item => item.id !== p.id) : null;
  state.routePreview = { placeId: p.id, dayIndex, oldDayIndex: p.dayIndex || null, before, after: best.places, sourceBefore, sourceAfter, insertAt: best.index };
  state.mapDay = focusDay;
  renderMapDayBar(); renderRoutePreview(); renderRoutes(); renderMarkers();
  if (state.map && [...before, ...best.places].length > 1) {
    const points = [...before, ...best.places, ...(sourceBefore || [])].map(mapCoord);
    if (state.provider === 'amap') state.map.setFitView(state.routeOverlays, false, [70, 70, 70, 70], 14);
    else state.map.fitBounds(points.map(([lng, lat]) => [lat, lng]), { padding: [70, 70], maxZoom: 14, animate: true });
  }
  setMobile('map');
  requestPreviewRoads(state.routePreview);
}
function previewOptimizedDay(day) {
  const before = dayPlaces(day), after = optimizedDayPlaces(day);
  if (before.every((p, i) => p.id === after[i]?.id)) return toast('当前顺序已经比较顺路');
  state.routePreview = { kind: 'optimize', dayIndex: day, oldDayIndex: null, before, after, sourceBefore: null, sourceAfter: null };
  state.mapDay = day;
  renderMapDayBar(); renderRoutePreview(); renderRoutes(); renderMarkers(); setMobile('map');
  if (state.provider === 'amap') state.map?.setFitView(state.routeOverlays, false, [70, 70, 70, 70], 14);
  else if (state.map) state.map.fitBounds(dayRoute(day).map(p => [p.lat, p.lng]), { padding: [70, 70], maxZoom: 14, animate: true });
  requestPreviewRoads(state.routePreview);
}
function renderAll() { if (!state.trip) return; renderSummary(); renderMembers(); renderFilters(); renderSidebarContent(); renderSchedulePage(); renderDiscussion(); renderMapDayBar(); renderRoutePreview(); renderRoutes(); renderMarkers(); renderConnection(); }

let amapSdkPromise = null;
async function ensureAmapSdk() {
  if (window.AMap?.Map) return true;
  if (amapSdkPromise) return amapSdkPromise;
  amapSdkPromise = (async () => {
    try { state.mapConfig = await api('/api/maps/config'); } catch { return false; }
    if (state.mapConfig?.provider !== 'amap') return false;
    window._AMapSecurityConfig = { serviceHost: `${location.origin}/_AMapService` };
    return new Promise(resolve => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => { script.remove(); resolve(false); }, 9000);
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(state.mapConfig.key)}&plugin=AMap.Driving,AMap.Walking,AMap.Transfer,AMap.ToolBar,AMap.Geocoder,AMap.PlaceSearch`;
      script.onload = () => { clearTimeout(timeout); resolve(Boolean(window.AMap?.Map)); };
      script.onerror = () => { clearTimeout(timeout); resolve(false); };
      document.head.append(script);
    });
  })();
  const loaded = await amapSdkPromise;
  if (!loaded) amapSdkPromise = null;
  return loaded;
}
async function loadAmap() {
  try { state.mapConfig = await api(`/api/trips/${encodeURIComponent(state.tripId)}/maps/config`); } catch { return false; }
  const overseasCenters = ['京都', '东京', '大阪', '首尔', '台北', '香港', '曼谷', '巴黎', '伦敦'].map(name => cities[name]);
  const overseas = overseasCenters.some(([lat, lng]) => Math.abs(state.trip.center[0] - lat) < .01 && Math.abs(state.trip.center[1] - lng) < .01);
  if (state.mapConfig?.provider !== 'amap' || overseas || !inChina({ lat: state.trip.center[0], lng: state.trip.center[1] })) return false;
  return ensureAmapSdk();
}
function clearSelection() {
  state.routePreview = null; state.rightCollapsed = true;
  renderRoutePreview(); renderRoutes(); syncPanelLayout(); setMobile('map');
}
function onMapBlank(lat, lng) {
  if (state.addMode) {
    if (state.addMode === 'inspect') { state.addMode = ''; updateMapHint(); showNearbyPois(lng, lat); return; }
    if (!state.memberId) return showJoin();
    const kind = state.addMode; state.addMode = ''; updateMapHint();
    const point = storedCoord(lng, lat);
    showAddPlace(point.lat.toFixed(6), point.lng.toFixed(6), kind);
    return;
  }
  if (!state.rightCollapsed || state.routePreview || state.mobile === 'chat') clearSelection();
}
function updateMapHint() { $('#mapHint').textContent = state.addMode ? (state.addMode === 'inspect' ? '点击地图，查看附近的高德地点 · Esc 取消' : '点击地图，标记想去的地点 · Esc 取消') : '点地点打开详情 · 地图空白处收起详情'; }
function initMap() {
  if (state.map) return;
  if (window.AMap?.Map) {
    try {
      state.provider = 'amap';
      $('#mapPoiButton').hidden = false;
      state.map = new AMap.Map('map', { viewMode: '2D', zoom: state.trip.zoom || 13, center: mapCoord({ lat: state.trip.center[0], lng: state.trip.center[1] }), showOversea: true, resizeEnable: true, WebGLParams: { preserveDrawingBuffer: true } });
      state.map.addControl(new AMap.ToolBar({ position: 'RB' }));
      state.map.on('click', event => onMapBlank(event.lnglat.lat, event.lnglat.lng));
      state.map.on('zoomend', renderMarkers);
      return;
    } catch { state.map?.destroy?.(); state.map = null; state.provider = 'osm'; }
  }
  if (!window.L) { $('#mapFallback').hidden = false; return; }
  state.map = L.map('map', { zoomControl: false, preferCanvas: true }).setView(state.trip.center, state.trip.zoom || 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>' }).addTo(state.map);
  L.control.zoom({ position: 'topright' }).addTo(state.map);
  state.routes = L.layerGroup().addTo(state.map);
  state.markers = L.layerGroup().addTo(state.map);
  state.map.on('click', event => onMapBlank(event.latlng.lat, event.latlng.lng));
  state.map.on('zoomend', renderMarkers);
}
function addMarker(p, html, width, height, anchorX, onClick) {
  if (state.provider === 'amap') {
    const content = document.createElement('button');
    content.type = 'button'; content.className = 'custom-pin'; content.innerHTML = html;
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend']) content.addEventListener(type, event => event.stopPropagation());
    content.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); onClick(); });
    const marker = new AMap.Marker({ position: mapCoord(p), content, offset: new AMap.Pixel(-anchorX, -height), zIndex: p.id === state.selectedPlaceId ? 150 : 110, bubble: false, draggable: false });
    state.markerOverlays.push(marker); state.map.add(marker);
  } else {
    const icon = L.divIcon({ className: 'custom-pin', html, iconSize: [width, height], iconAnchor: [anchorX, height] });
    L.marker([p.lat, p.lng], { icon, bubblingMouseEvents: false, draggable: false }).addTo(state.markers).on('click', onClick);
  }
}
function renderMarkers() {
  if (!state.map || !state.trip) return;
  if (state.provider === 'amap') { state.map.remove(state.markerOverlays); state.markerOverlays = []; }
  else state.markers.clearLayers();
  const zoom = state.map.getZoom();
  const places = visibleMapPlaces();
  if (zoom < 11) {
    const groups = new Map();
    for (const p of places) {
      const pixel = state.provider === 'amap' ? state.map.lngLatToContainer(mapCoord(p)) : state.map.project([p.lat, p.lng], zoom);
      const key = `${Math.floor(pixel.x / 82)}:${Math.floor(pixel.y / 82)}`;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p);
    }
    for (const group of groups.values()) {
      if (group.length === 1) { addCompactMarker(group[0]); continue; }
      const lat = group.reduce((sum, p) => sum + p.lat, 0) / group.length;
      const lng = group.reduce((sum, p) => sum + p.lng, 0) / group.length;
      const count = group.reduce((sum, p) => sum + p.comments.length, 0);
      const kinds = [...new Set(group.map(placeKind))], kind = kinds.length === 1 ? kinds[0] : 'mixed';
      addMarker({ lat, lng }, `<div class="pin-cluster kind-${kind} ${group.every(p => planningLabel(p) === '待定') ? 'pending' : ''}"><b>${kinds.length === 1 ? { eat: '🍜', play: '⛩️', hotel: '🛏️' }[kind] || group.length : group.length}</b><small>${group.length} 处${count ? ` · ◌ ${count}` : ''}</small></div>`, 58, 58, 29, () => state.provider === 'amap' ? state.map.setZoomAndCenter(Math.min(zoom + 2, 14), mapCoord({ lat, lng })) : state.map.setView([lat, lng], Math.min(zoom + 2, 14)));
    }
    return;
  }
  if (zoom < 13) { places.forEach(addCompactMarker); return; }
  for (const p of places) {
    const commenters = commenterMembers(p);
    const muted = state.mapDay !== 'all' && p.dayIndex && p.dayIndex !== Number(state.mapDay);
    const html = `<div class="pin-body pin-detailed kind-${placeKind(p)} ${p.status} ${planningLabel(p) === '待定' ? 'pending' : ''} ${p.id === state.selectedPlaceId ? 'selected' : ''} ${muted ? 'muted' : ''}" data-marker-place="${p.id}"><span class="pin-icon">${categories[p.category] || '📍'}</span><b>${escapeHtml(p.name)}</b>${p.comments.length ? `<span class="pin-comment-count">◌ ${p.comments.length}</span><span class="pin-commenters">${commenters.slice(0, 2).map(m => `<i style="background:${escapeHtml(m.color)}" title="${escapeHtml(m.name)}">${escapeHtml(m.name.slice(0, 1))}</i>`).join('')}</span>` : ''}</div>`;
    addMarker(p, html, 220, 44, 22, () => selectPlace(p.id));
  }
}
function addCompactMarker(p) {
  const html = `<div class="pin-compact kind-${placeKind(p)} ${p.status} ${planningLabel(p) === '待定' ? 'pending' : ''} ${p.id === state.selectedPlaceId ? 'selected' : ''}" data-marker-place="${p.id}" title="${escapeHtml(p.name)} · ${p.comments.length} 条讨论"><span>${categories[p.category] || '📍'}</span>${p.comments.length ? `<b>${p.comments.length}</b>` : ''}</div>`;
  addMarker(p, html, 46, 46, 23, () => selectPlace(p.id));
}
function updateMarkerSelection() {
  document.querySelectorAll('[data-marker-place]').forEach(marker => marker.classList.toggle('selected', marker.dataset.markerPlace === state.selectedPlaceId));
  if (state.provider === 'amap') state.markerOverlays.forEach(marker => {
    const id = marker.getContent?.()?.querySelector?.('[data-marker-place]')?.dataset.markerPlace;
    if (id) marker.setzIndex?.(id === state.selectedPlaceId ? 150 : 110);
  });
}
function focusPlaceOnMap(p) {
  const map = state.map; if (!map) return;
  const container = $('#map'), width = container.clientWidth, height = container.clientHeight;
  const coveredWidth = window.innerWidth <= 900 ? Math.min(window.innerWidth, 430) : 0;
  const visibleWidth = width - coveredWidth;
  const targetX = visibleWidth >= 200 ? visibleWidth / 2 : width / 2;
  const targetY = (height - (window.innerWidth <= 900 ? 67 : 0)) / 2;
  if (state.provider === 'amap') {
    const point = map.lngLatToContainer(mapCoord(p));
    const center = map.containerToLngLat(new AMap.Pixel(point.x + width / 2 - targetX, point.y + height / 2 - targetY));
    map.setCenter(center);
  } else {
    const size = map.getSize(), zoom = map.getZoom();
    const point = map.project([p.lat, p.lng], zoom);
    map.panTo(map.unproject(point.add([size.x / 2 - targetX, size.y / 2 - targetY]), zoom), { animate: true, duration: .35 });
  }
}
function selectPlace(placeId) {
  const p = state.trip.places.find(item => item.id === placeId); if (!p) return;
  closeSchedule();
  if (!state.openPlaceIds.includes(placeId)) state.openPlaceIds.push(placeId);
  state.selectedPlaceId = placeId; state.rightMode = 'place'; state.rightCollapsed = false;
  syncPanelLayout();
  renderSidebarContent(); renderDiscussion(); updateMarkerSelection();
  setTimeout(() => { if (state.selectedPlaceId === placeId) focusPlaceOnMap(p); }, 0);
  if (window.innerWidth <= 900) setMobile('chat');
}
function closePlaceTab(placeId) {
  const index = state.openPlaceIds.indexOf(placeId);
  if (index < 0) return;
  state.openPlaceIds.splice(index, 1);
  state.placeDrafts.delete(placeId);
  if (state.selectedPlaceId === placeId) {
    state.selectedPlaceId = state.openPlaceIds[Math.min(index, state.openPlaceIds.length - 1)] || '';
    state.rightMode = state.selectedPlaceId ? 'place' : 'group';
  }
  renderSidebarContent(); renderDiscussion(); updateMarkerSelection();
}
function syncPanelLayout() {
  if (window.innerWidth > 900 && !state.leftCollapsed && !state.rightCollapsed) {
    const maxPanels = Math.max(520, window.innerWidth - 380);
    const excess = state.leftWidth + state.rightWidth - maxPanels;
    if (excess > 0) {
      const trimRight = Math.min(excess, state.rightWidth - 280);
      state.rightWidth -= trimRight;
      state.leftWidth = Math.max(240, state.leftWidth - (excess - trimRight));
    }
  }
  document.documentElement.style.setProperty('--left-panel-width', `${state.leftWidth}px`);
  document.documentElement.style.setProperty('--right-panel-width', `${state.rightWidth}px`);
  $('#leftResizer').setAttribute('aria-valuenow', state.leftWidth);
  $('#rightResizer').setAttribute('aria-valuenow', state.rightWidth);
  document.body.classList.toggle('sidebar-collapsed', state.leftCollapsed);
  document.body.classList.toggle('discussion-collapsed', state.rightCollapsed);
  const leftLabel = state.leftCollapsed ? '展开地点面板' : '收起地点面板';
  const rightLabel = state.rightCollapsed ? '展开讨论面板' : '收起讨论面板';
  $('#toggleSidebarButton').setAttribute('aria-label', leftLabel);
  $('#toggleSidebarButton').title = leftLabel;
  $('#toggleDiscussionButton').setAttribute('aria-label', rightLabel);
  $('#toggleDiscussionButton').title = rightLabel;
  updateUnread();
  setTimeout(() => state.provider === 'amap' ? state.map?.resize?.() : state.map?.invalidateSize?.(), 240);
}
function setPanelWidth(side, proposed) {
  const other = side === 'left' ? (state.rightCollapsed ? 0 : state.rightWidth) : (state.leftCollapsed ? 0 : state.leftWidth);
  const min = side === 'left' ? 240 : 280;
  const max = Math.max(min, Math.min(side === 'left' ? 580 : 620, window.innerWidth - other - 360));
  state[side === 'left' ? 'leftWidth' : 'rightWidth'] = Math.max(min, Math.min(max, proposed));
  document.documentElement.style.setProperty(side === 'left' ? '--left-panel-width' : '--right-panel-width', `${state[side === 'left' ? 'leftWidth' : 'rightWidth']}px`);
  document.getElementById(side === 'left' ? 'leftResizer' : 'rightResizer').setAttribute('aria-valuenow', state[side === 'left' ? 'leftWidth' : 'rightWidth']);
  if (!state.panelResizeFrame) state.panelResizeFrame = requestAnimationFrame(() => { state.panelResizeFrame = 0; state.provider === 'amap' ? state.map?.resize?.() : state.map?.invalidateSize?.(); });
}
function initPanelResizers() {
  for (const [id, side] of [['leftResizer', 'left'], ['rightResizer', 'right']]) {
    const handle = document.getElementById(id);
    handle.addEventListener('pointerdown', event => {
      if (window.innerWidth <= 900) return;
      event.preventDefault(); handle.setPointerCapture(event.pointerId);
      const startX = event.clientX, startWidth = side === 'left' ? state.leftWidth : state.rightWidth;
      document.body.classList.add('resizing-panels');
      const move = moveEvent => setPanelWidth(side, startWidth + (moveEvent.clientX - startX) * (side === 'left' ? 1 : -1));
      const finish = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', finish); handle.removeEventListener('pointercancel', finish); document.body.classList.remove('resizing-panels'); localStorage.setItem(`travel-${side}-width`, String(side === 'left' ? state.leftWidth : state.rightWidth)); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
    });
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || window.innerWidth <= 900) return;
      event.preventDefault(); setPanelWidth(side, (side === 'left' ? state.leftWidth : state.rightWidth) + (event.key === 'ArrowRight' ? 20 : -20) * (side === 'left' ? 1 : -1));
      localStorage.setItem(`travel-${side}-width`, String(side === 'left' ? state.leftWidth : state.rightWidth));
    });
  }
}
function setMobile(view) {
  state.mobile = view; document.body.classList.toggle('mobile-list', view === 'list'); document.body.classList.toggle('mobile-chat', view === 'chat');
  $('#mobileNav').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.mobile === view));
  updateUnread();
  if (view === 'map') setTimeout(() => state.provider === 'amap' ? state.map?.resize?.() : state.map?.invalidateSize?.(), 120);
}
async function refreshTrip() {
  const response = await api(`/api/trips/${encodeURIComponent(state.tripId)}`);
  state.trip = response.trip;
  state.memberId = state.user ? state.trip.members.find(member => member.userId === state.user.id)?.id || '' : '';
  state.openPlaceIds = state.openPlaceIds.filter(id => state.trip.places.some(p => p.id === id && p.status !== 'archived'));
  if (state.selectedPlaceId && !selectedPlace()) { state.selectedPlaceId = ''; state.rightMode = 'group'; }
  renderAll();
}
async function refreshPlacePhoto(p) {
  if (!state.memberId || !p?.id || Date.now() - (state.photoRefreshAttempted.get(p.id) || 0) < 60_000) return;
  state.photoRefreshAttempted.set(p.id, Date.now());
  try {
    const result = await api(`/api/trips/${encodeURIComponent(state.tripId)}/actions`, { method: 'POST', body: JSON.stringify({ action: 'refresh-source-photo', placeId: p.id }) });
    if (result.updated) await refreshTrip();
  } catch { /* The source can temporarily block access; keep the existing place. */ }
}
async function refreshCommentPhoto(p, comment) {
  if (!state.memberId || !comment?.id || Date.now() - (state.commentPhotoRefreshAttempted.get(comment.id) || 0) < 60_000) return;
  state.commentPhotoRefreshAttempted.set(comment.id, Date.now());
  try {
    const result = await api(`/api/trips/${encodeURIComponent(state.tripId)}/actions`, { method: 'POST', body: JSON.stringify({ action: 'refresh-comment-source-photo', placeId: p.id, commentId: comment.id }) });
    if (result.updated) await refreshTrip();
  } catch { /* Keep the linked post available when its preview cannot be read. */ }
}
async function refreshLinkedPhotos() {
  for (const p of state.trip.places.filter(needsSourcePhotoRefresh)) await refreshPlacePhoto(p);
  for (const p of state.trip.places) for (const comment of p.comments.filter(needsSourcePhotoRefresh)) await refreshCommentPhoto(p, comment);
}
function connectEvents() {
  state.eventSource?.close();
  const source = new EventSource(`/api/trips/${encodeURIComponent(state.tripId)}/events`);
  state.eventSource = source;
  source.addEventListener('ready', event => { state.connection = 'connected'; state.online = JSON.parse(event.data).online || []; renderMembers(); renderConnection(); });
  source.addEventListener('change', async event => { const revision = JSON.parse(event.data).revision; if (revision > (state.trip?.revision || 0)) { try { await refreshTrip(); } catch { state.connection = 'reconnecting'; renderConnection(); } } });
  source.addEventListener('presence', event => { state.online = JSON.parse(event.data).online || []; renderMembers(); });
  source.onerror = () => { state.connection = 'reconnecting'; renderConnection(); };
}
async function heartbeat() {
  if (!state.memberId) return;
  try { await api(`/api/trips/${encodeURIComponent(state.tripId)}/presence`, { method: 'POST', body: '{}' }); } catch { /* event stream will retry */ }
}
async function share() {
  const url = `${location.origin}${location.pathname}?trip=${encodeURIComponent(state.tripId)}`;
  try { await navigator.clipboard.writeText(url); toast('邀请链接已复制，发给旅行伙伴就能一起讨论'); }
  catch { showModal(`<div class="modal">${modalHeader('邀请伙伴', '分享这趟旅行')}<p>复制下面的链接，发给旅行伙伴。</p><input class="field" value="${escapeHtml(url)}" readonly onclick="this.select()"><div class="modal-actions"><button type="button" class="primary-button" data-close-modal>完成</button></div></div>`); }
}
async function enterTrip() {
  $('#entryScreen').hidden = true;
  $('#appShell').hidden = false;
  await refreshTrip();
  await loadAmap(); initMap(); renderMarkers(); renderRoutes(); renderMapDayBar(); connectEvents();
  if (!state.memberId) showJoin(); else { renderAll(); heartbeat(); refreshLinkedPhotos(); }
  setInterval(heartbeat, 20_000);
}
async function start() {
  try {
    initPanelResizers(); syncPanelLayout();
    const nextView = sessionStorage.getItem('travel-next-view');
    sessionStorage.removeItem('travel-next-view');
    if (nextView) $('#entryScreen').hidden = true;
    authReadyPromise = api('/api/auth/me').then(result => { state.user = result.user; renderAccountButton(); }).catch(error => { state.user = null; renderAccountButton(); toast(error.message); });
    if (nextView === 'trip' && state.tripId) {
      await authReadyPromise;
      if (state.user) return await enterTrip();
      return showAuth();
    }
    if (nextView === 'home') {
      await authReadyPromise;
      return await showHome();
    }
    beginSplash();
    await authReadyPromise;
  } catch (error) { toast(error.message); }
}

document.addEventListener('error', event => {
  const commentId = event.target?.dataset?.commentPhoto;
  if (commentId) {
    const p = state.trip?.places.find(item => item.id === event.target.dataset.commentPlace);
    const comment = p?.comments.find(item => item.id === commentId);
    if (p && comment && sourceSite(comment.sourceUrl) === '小红书') refreshCommentPhoto(p, comment);
    return;
  }
  const placeId = event.target?.dataset?.placePhoto;
  if (!placeId) return;
  const p = state.trip?.places.find(item => item.id === placeId);
  if (p && sourceSite(p.sourceUrl) === '小红书' && !/^\/uploads\//.test(p.coverImage || '')) refreshPlacePhoto(p);
}, true);

document.addEventListener('click', event => {
  const uiOption = event.target.closest('[data-ui-option]');
  if (uiOption && openUiSelect) {
    const select = openUiSelect.select;
    select.selectedIndex = Number(uiOption.dataset.uiOption);
    syncUiSelect(select); closeUiSelect();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const uiTrigger = event.target.closest('[data-ui-select-trigger]');
  if (uiTrigger) { showUiSelect(uiTrigger); return; }
  if (openUiSelect) closeUiSelect();
  if (event.target === $('#modalRoot') || event.target.closest('[data-close-modal]')) { if ($('#authForm')) state.pendingAuthAction = ''; return closeModal(); }
  if (event.target.closest('#skipIntroButton')) { finishSplash(); return; }
  const authMode = event.target.closest('[data-auth-mode]'); if (authMode) return showAuth(authMode.dataset.authMode);
  if (event.target.closest('[data-show-home]')) { navigateHome(); return; }
  const tripButton = event.target.closest('[data-open-trip]'); if (tripButton) { openTrip(tripButton.dataset.openTrip); return; }
  if (event.target.closest('#homeButton')) { navigateHome(); return; }
  if (event.target.closest('[data-start-new-trip]')) { showNewTrip(); return; }
  if (event.target.closest('[data-retry-home]')) { showHome(); return; }
  if (event.target.closest('[data-home-account]')) { showAccount(); return; }
  if (event.target.closest('#accountButton')) return showAccount();
  if (event.target.closest('[data-logout],[data-home-logout]')) {
    api('/api/auth/logout', { method: 'POST', body: '{}' }).then(() => { state.user = null; state.memberId = ''; state.pendingAuthAction = ''; renderAccountButton(); showAuth(); toast('已退出登录'); }).catch(error => toast(error.message));
    return;
  }
  if (event.target.closest('[data-close-schedule]')) { closeSchedule(); return; }
  if (event.target.closest('#toggleSidebarButton')) {
    if (window.innerWidth <= 900) setMobile(state.mobile === 'list' ? 'map' : 'list');
    else { state.leftCollapsed = !state.leftCollapsed; syncPanelLayout(); }
    return;
  }
  if (event.target.closest('#toggleDiscussionButton,[data-close-discussion]')) {
    if (window.innerWidth <= 900) setMobile(state.mobile === 'chat' ? 'map' : 'chat');
    else { state.rightCollapsed = !state.rightCollapsed; syncPanelLayout(); }
    return;
  }
  const closeTab = event.target.closest('[data-close-detail]'); if (closeTab) { closePlaceTab(closeTab.dataset.closeDetail); return; }
  const detailTab = event.target.closest('[data-detail-tab]'); if (detailTab) { selectPlace(detailTab.dataset.detailTab); return; }
  if (event.target.closest('[data-detail-group]')) { state.rightMode = 'group'; state.selectedPlaceId = ''; state.rightCollapsed = false; syncPanelLayout(); renderDiscussion(); updateMarkerSelection(); return; }
  if (event.target.closest('[data-pick-cover]')) { event.target.closest('.hero-photo-wrap')?.querySelector('[data-detail-cover-upload]')?.click(); return; }
  const locationSearch = event.target.closest('[data-search-location]'); if (locationSearch) return searchAddLocation(locationSearch.closest('form').querySelector('[data-add-location-search]'));
  const locationResult = event.target.closest('[data-select-add-poi]'); if (locationResult) return selectAddLocation(Number(locationResult.dataset.selectAddPoi));
  const tripOriginSearch = event.target.closest('[data-search-trip-origin]'); if (tripOriginSearch) return searchTripOrigin(tripOriginSearch.closest('form').querySelector('[data-trip-origin-search]'));
  const tripOriginResult = event.target.closest('[data-select-trip-origin]'); if (tripOriginResult) return selectTripOrigin(Number(tripOriginResult.dataset.selectTripOrigin));
  const poiIndex = event.target.closest('[data-poi-index]'); if (poiIndex) return showPoiDetail(Number(poiIndex.dataset.poiIndex));
  const poiAdd = event.target.closest('[data-poi-add]'); if (poiAdd) {
    const poi = state.poiResults[Number(poiAdd.dataset.poiAdd)];
    showAddPlace(poiAdd.dataset.poiLat, poiAdd.dataset.poiLng, /酒店|宾馆|住宿/.test(poi.type || '') ? 'hotel' : 'place');
    const form = $('#addPlaceForm'); form.elements.namedItem('name').value = poi.name || ''; form.elements.namedItem('address').value = poi.address || ''; form.querySelector('[data-location-selection]').textContent = `✓ 已定位：${poi.name}`; form.querySelector('[data-add-location-search]').value = poi.name || '';
    return;
  }
  const importButton = event.target.closest('[data-preview-source]');
  if (importButton) { const form = importButton.closest('form'); clearTimeout(form._sourceTimer); form._sourcePromise = loadSourcePreview(form.querySelector('[data-source-input]')); return; }
  const exportButton = event.target.closest('[data-export-day]'); if (exportButton) { exportDay(Number(exportButton.dataset.exportDay)); return; }
  if (event.target.closest('[data-export-trip]')) return exportTrip();
  if (event.target.closest('[data-export-trip-image]')) { exportTripImage().catch(error => { console.error('行程图片生成失败', error); toast('图片生成失败，请重试'); }); return; }
  const routeSelection = event.target.closest('[data-select-route]'); if (routeSelection) { if (!isPhone()) setRouteQr(Number(routeSelection.dataset.selectRoute)); return; }
  const routePlatform = event.target.closest('[data-qr-platform]'); if (routePlatform) { state.routePlatform = routePlatform.dataset.qrPlatform; setRouteQr(state.routeSelection || 0); return; }
  const copyRoute = event.target.closest('[data-copy-route]'); if (copyRoute) { navigator.clipboard.writeText(copyRoute.dataset.copyRoute).then(() => toast('高德 App 路线链接已复制')).catch(() => toast('复制失败，请用手机扫描二维码')); return; }
  if (event.target.closest('#newTripButton')) return showNewTrip();
  if (event.target.closest('[data-edit-trip-dates]')) return showTripDates();
  if (event.target.closest('#mapInfoButton')) return showMapInfo();
  if (event.target.closest('#mapPoiButton')) { state.addMode = 'inspect'; updateMapHint(); toast('点击地图，查看附近的高德地点'); return; }
  if (event.target.closest('#shareButton,[data-share]')) return share();
  if (event.target.closest('#addPlaceButton')) { if (!state.memberId) return showJoin(); return showAddPlace(); }
  if (event.target.closest('#mapAddButton')) { if (!state.memberId) return showJoin(); state.addMode = 'place'; updateMapHint(); toast('点击地图选择位置，也可以用左侧添加按钮搜索地点'); setMobile('map'); return; }
  if (event.target.closest('[data-cancel-preview]')) { state.routePreview = null; renderRoutePreview(); renderSidebarContent(); renderRoutes(); renderDiscussion(); return; }
  if (event.target.closest('[data-confirm-preview]')) {
    const preview = state.routePreview; if (!preview) return;
    const payload = preview.kind === 'optimize' ? { action: 'reorder-day', dayIndex: preview.dayIndex, placeIds: preview.after.map(p => p.id) } : { action: 'day', placeId: preview.placeId, dayIndex: preview.dayIndex, insertAt: preview.insertAt };
    action(payload).then(() => { state.routePreview = null; renderRoutePreview(); renderRoutes(); toast(preview.kind === 'optimize' ? `Day ${preview.dayIndex} 已顺路排序` : preview.dayIndex ? `已加入 Day ${preview.dayIndex}` : '已移出行程'); }).catch(() => {});
    return;
  }
  const optimize = event.target.closest('[data-optimize-day]'); if (optimize) { closeSchedule(); previewOptimizedDay(Number(optimize.dataset.optimizeDay)); return; }
  const hotelDay = event.target.closest('[data-confirm-hotel-day]');
  if (hotelDay) { action({ action: 'confirm-hotel-day', placeId: hotelDay.dataset.confirmHotelId, dayIndex: Number(hotelDay.dataset.confirmHotelDay), confirmed: hotelDay.dataset.confirmed === 'true' }).then(() => { state.mapDay = Number(hotelDay.dataset.confirmHotelDay); renderMapDayBar(); renderRoutes(); }).catch(() => {}); return; }
  const legButton = event.target.closest('[data-leg-mode]');
  if (legButton) { action({ action: 'set-leg-mode', dayIndex: Number(legButton.dataset.legDay), fromId: legButton.dataset.legFrom, toId: legButton.dataset.legTo, mode: legButton.dataset.legMode }).catch(() => {}); return; }
  const suggested = event.target.closest('[data-suggest-day]');
  if (suggested) { const p = state.trip.places.find(item => item.id === suggested.dataset.suggestDay); if (p) previewDayChange(p, Number(suggested.dataset.suggestTarget)); return; }
  const reorder = event.target.closest('[data-reorder]');
  if (reorder) { const p = state.trip.places.find(item => item.id === reorder.dataset.reorderPlace); if (p) { state.mapDay = p.dayIndex; action({ action: 'reorder', placeId: p.id, direction: reorder.dataset.reorder }).catch(() => {}); } return; }
  const mapDay = event.target.closest('[data-map-day]');
  if (mapDay) { closeSchedule(); state.routePreview = null; state.mapDay = mapDay.dataset.mapDay === 'all' ? 'all' : Number(mapDay.dataset.mapDay); renderMapDayBar(); renderRoutePreview(); renderRoutes(); renderMarkers(); setMobile('map'); return; }
  const edit = event.target.closest('[data-edit-place]');
  if (edit) { const p = state.trip.places.find(item => item.id === edit.dataset.editPlace); if (p) showEditPlace(p); return; }
  const placeElement = event.target.closest('[data-place-id]'); if (placeElement) return selectPlace(placeElement.dataset.placeId);
  const view = event.target.closest('[data-view]'); if (view) { if (view.dataset.view === 'schedule') { openSchedule(); return; } closeSchedule(); state.sideView = view.dataset.view; state.routePreview = null; state.leftCollapsed = false; syncPanelLayout(); renderRoutePreview(); renderSidebarContent(); renderMarkers(); renderRoutes(); if (window.innerWidth <= 900) setMobile('list'); return; }
  const filter = event.target.closest('[data-filter]'); if (filter) { state.filter = filter.dataset.filter; renderFilters(); renderSidebarContent(); renderMarkers(); return; }
  const mobile = event.target.closest('[data-mobile]'); if (mobile) { setMobile(mobile.dataset.mobile); return; }
  const vote = event.target.closest('[data-vote]'); if (vote) { const p = selectedPlace(); if (p) action({ action: 'vote', placeId: p.id, value: p.votes[state.memberId] === vote.dataset.vote ? '' : vote.dataset.vote }).catch(() => {}); return; }
  const about = event.target.closest('[data-chat-about]'); if (about) { state.rightMode = 'group'; state.selectedPlaceId = ''; renderDiscussion(); updateMarkerSelection(); $('#messagePlace').value = about.dataset.chatAbout; syncUiSelect($('#messagePlace')); $('#groupInput').focus(); return; }
});
document.addEventListener('input', event => {
  if (event.target.matches('[data-source-input]')) { const form = event.target.closest('form'); clearTimeout(form._sourceTimer); form._sourceTimer = setTimeout(() => { form._sourcePromise = loadSourcePreview(event.target); }, 650); }
  if (event.target.matches('[data-add-location-search]')) { const form = event.target.closest('form'); form.elements.namedItem('lat').value = ''; form.elements.namedItem('lng').value = ''; form.querySelector('[data-location-selection]').textContent = '选择搜索结果后才会确定地图位置'; clearTimeout(form._locationTimer); form._locationTimer = setTimeout(() => searchAddLocation(event.target), 350); }
  if (event.target.matches('[data-trip-origin-search]')) { const form = event.target.closest('form'); form._originRequest = (form._originRequest || 0) + 1; form.elements.namedItem('centerLat').value = ''; form.elements.namedItem('centerLng').value = ''; form.querySelector('[data-trip-origin-selection]').textContent = '选择搜索结果后才会确定地图起点'; clearTimeout(form._originTimer); form._originTimer = setTimeout(() => searchTripOrigin(event.target), 350); }
  if (event.target.matches('[data-comment-source-input]')) { const form = event.target.closest('form'); const p = selectedPlace(); if (p) placeDraft(p.id).link = event.target.value; clearTimeout(form._commentTimer); form._commentTimer = setTimeout(() => { form._commentPromise = loadCommentPreview(event.target); }, 550); }
  if (event.target.matches('#tripStartDate,#tripEndDate')) updateTripDateSummary();
  if (event.target.matches('[name="sourceTitle"],[name="sourceDescription"]')) { const form = event.target.closest('form'); const url = sourceLink(form.elements.namedItem('sourceUrl').value); if (url) form.querySelector('[data-source-preview]').innerHTML = sourcePreviewMarkup({ sourceUrl: url, sourceTitle: form.elements.namedItem('sourceTitle').value, sourceDescription: form.elements.namedItem('sourceDescription').value, sourceImage: form.elements.namedItem('sourceImage').value, sourceSite: form.elements.namedItem('sourceSite').value }); }
  if (event.target.id === 'placeSearch') { state.search = event.target.value; renderSidebarContent(); renderMarkers(); }
  if (event.target.id === 'groupInput') state.drafts.group = event.target.value;
  if (event.target.id === 'placeInput' && selectedPlace()) placeDraft(state.selectedPlaceId).text = event.target.value;
});
document.addEventListener('change', event => {
  if (event.target.matches('select[data-ui-enhanced]')) syncUiSelect(event.target);
  if (event.target.matches('[data-detail-cover-upload]')) { uploadDetailCover(event.target); return; }
  if (event.target.matches('[data-cover-upload]')) { const form = event.target.closest('form'); form._coverPromise = uploadCover(event.target); return; }
  if (event.target.matches('[data-day-hotel]')) { action({ action: 'day-hotel', dayIndex: Number(event.target.dataset.dayHotel), role: event.target.dataset.hotelRole, hotelId: event.target.value }).catch(() => {}); return; }
  if (event.target.matches('[data-quick-day]')) { const quickPlace = state.trip.places.find(item => item.id === event.target.dataset.quickDay); if (quickPlace) previewDayChange(quickPlace, event.target.value ? Number(event.target.value) : null); return; }
  const p = selectedPlace();
  if (event.target.matches('[data-place-status]') && p) {
    if (event.target.value === 'scheduled' && !p.dayIndex) { toast('先选择 Day，并预览路线变化'); renderDiscussion(); $('#placeDay')?.focus(); return; }
    action({ action: 'status', placeId: p.id, status: event.target.value }).catch(() => {});
  }
  if (event.target.matches('[data-place-day]') && p) previewDayChange(p, event.target.value ? Number(event.target.value) : null);
});
document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target;
  const submit = form.querySelector('[type=submit]'); if (submit) submit.disabled = true;
  try {
    if (form.id === 'authForm') {
      const data = Object.fromEntries(new FormData(form));
      const result = await api(`/api/auth/${data.mode}`, { method: 'POST', body: JSON.stringify(data) });
      state.user = result.user; renderAccountButton(); await showHome();
      if (state.pendingAuthAction === 'newTrip') { state.pendingAuthAction = ''; showNewTrip(); }
    } else if (form.id === 'joinForm') {
      const result = await api(`/api/trips/${encodeURIComponent(state.tripId)}/join`, { method: 'POST', body: '{}' });
      state.memberId = result.member.id;
      closeModal(); await refreshTrip(); await heartbeat(); refreshLinkedPhotos(); toast(`欢迎加入，${result.member.name}！`);
    } else if (form.id === 'newTripForm') {
      const data = Object.fromEntries(new FormData(form));
      const days = tripDayCount(data.startDate, data.endDate);
      if (days < 1 || days > 30) { updateTripDateSummary(); toast('请选择有效的开始和结束日期'); return; }
      if (!data.centerLat || !data.centerLng) { form.querySelector('[data-trip-origin-selection]').textContent = '请先搜索并选择一个准确的国内地点'; form.querySelector('[data-trip-origin-search]').focus(); toast('请先选择地图起点'); return; }
      const result = await api('/api/trips', { method: 'POST', body: JSON.stringify({ title: data.title, destination: data.destination, center: [Number(data.centerLat), Number(data.centerLng)], startDate: data.startDate, endDate: data.endDate }) });
      openTrip(result.trip.id);
    } else if (form.id === 'tripDatesForm') {
      const data = Object.fromEntries(new FormData(form));
      await action({ action: 'update-trip-dates', startDate: data.startDate, endDate: data.endDate });
      closeModal(); toast(`已设置 ${state.trip.dayCount} 天旅行，行程日期已更新`);
    } else if (form.id === 'addPlaceForm') {
      await finishPlaceMedia(form);
      if (!form.elements.namedItem('name').value.trim()) { revealQuickName(form); toast('请补一个地点名称，再放到地图上'); return; }
      if (!form.elements.namedItem('lat').value || !form.elements.namedItem('lng').value) { form.querySelector('[data-location-selection]').textContent = '请先从高德搜索结果中选一个准确地点'; form.querySelector('[data-add-location-search]').focus(); toast('请先选择地点位置'); return; }
      const data = Object.fromEntries(new FormData(form));
      data.sourceUrl = sourceLink(data.sourceUrl);
      const result = await action({ action: 'add-place', ...data });
      closeModal(); selectPlace(result.place.id); toast('地点已提出，伙伴们现在可以一起讨论');
    } else if (form.id === 'editPlaceForm') {
      await finishPlaceMedia(form);
      const data = Object.fromEntries(new FormData(form));
      data.sourceUrl = sourceLink(data.sourceUrl);
      await action({ action: 'update-place', ...data });
      closeModal(); toast('地点资料已更新');
    } else if (form.id === 'groupForm') {
      const text = state.drafts.group.trim(); if (!text) return;
      const placeId = $('#messagePlace').value;
      state.drafts.group = ''; await action({ action: 'message', text, placeId });
    } else if (form.id === 'placeForm') {
      const p = selectedPlace(), text = p ? placeDraft(p.id).text.trim() : '', link = sourceLink(form.querySelector('[data-comment-source-input]').value);
      if (!p || (!text && !link)) { toast('写一点想法或添加一篇帖子'); return; }
      clearTimeout(form._commentTimer);
      if (link && form._commentPreview?.url !== link) form._commentPromise = loadCommentPreview(form.querySelector('[data-comment-source-input]'));
      if (form._commentPromise) await form._commentPromise;
      const preview = form._commentPreview?.url === link ? form._commentPreview : null;
      await action({ action: 'comment', placeId: p.id, text, sourceUrl: link, sourceTitle: preview?.title || '', sourceDescription: preview?.description || '', sourceImage: preview?.image || '' });
      state.placeDrafts.delete(p.id);
      renderDiscussion();
      $('.place-detail-scroll').scrollTop = $('.place-detail-scroll').scrollHeight;
    }
  } catch (error) { toast(error.message); if (form.id === 'groupForm') state.drafts.group = form.querySelector('textarea')?.value || ''; if (form.id === 'placeForm' && selectedPlace()) placeDraft(state.selectedPlaceId).text = form.querySelector('textarea')?.value || ''; }
  finally { if (submit && submit.isConnected) submit.disabled = false; }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && openUiSelect) { event.preventDefault(); closeUiSelect(); return; }
  if (event.key === 'Escape' && !$('#modalRoot').hidden) { if ($('#authForm')) state.pendingAuthAction = ''; closeModal(); }
  else if (event.key === 'Escape' && state.scheduleOpen) closeSchedule();
  else if (event.key === 'Escape' && state.addMode) { state.addMode = ''; updateMapHint(); toast('已取消标记'); }
  else if (event.key === 'Escape' && state.selectedPlaceId) clearSelection();
  if (event.key === 'Enter' && !event.shiftKey && event.target.matches('#groupInput,#placeInput')) { event.preventDefault(); event.target.closest('form').requestSubmit(); }
});
window.addEventListener('resize', () => state.provider === 'amap' ? state.map?.resize?.() : state.map?.invalidateSize?.());
document.addEventListener('visibilitychange', updateUnread);
start();
