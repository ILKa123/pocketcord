'use strict';
/* Pocketcord UI. Сеть — в Rust (src-tauri), здесь только отрисовка. */

// ---------------- бэкенд ----------------
function tauriBackend() {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  return {
    restore: () => invoke('restore'),
    login: token => invoke('login', { token }),
    logout: () => invoke('logout'),
    guilds: () => invoke('guilds'),
    dms: () => invoke('dms'),
    channels: guildId => invoke('channels', { guildId }),
    messages: (channelId, o = {}) => invoke('messages', { channelId, before: o.before ?? null, around: o.around ?? null }),
    pins: channelId => invoke('pins', { channelId }),
    send: (channelId, content, replyTo, nonce) => invoke('send_message', { channelId, content, replyTo: replyTo ?? null, nonce: nonce ?? null }),
    edit: (channelId, messageId, content) => invoke('edit_message', { channelId, messageId, content }),
    del: (channelId, messageId) => invoke('delete_message', { channelId, messageId }),
    setPin: (channelId, messageId, pinned) => invoke('set_pin', { channelId, messageId, pinned }),
    react: (channelId, messageId, emoji, add) => invoke('react', { channelId, messageId, emoji, add }),
    typing: channelId => invoke('typing', { channelId }),
    upload: (channelId, content, replyTo, nonce, files) => invoke('upload', { channelId, content, replyTo: replyTo ?? null, nonce: nonce ?? null, files }),
    search: (scope, query, offset) => invoke('search', { guildId: scope.guildId ?? null, channelId: scope.channelId ?? null, query, offset: offset ?? null }),
    profile: (userId, guildId) => invoke('profile', { userId, guildId: guildId ?? null }),
    emojis: guildId => invoke('guild_emojis', { guildId }),
    gifs: query => invoke('gifs', { query: query || null }),
    gifCategories: () => invoke('gif_categories'),
    wake: () => invoke('gateway_wake'),
    requestMembers: (guildId, query) => invoke('request_members', { guildId, query, userIds: null }),
    requestMemberIds: (guildId, userIds) => invoke('request_members', { guildId, query: null, userIds }),
    api: (method, path, body) => invoke('api_request', { method, path, body: body ?? null }),    ack: (channelId, messageId) => invoke('ack', { channelId, messageId }),
    openUrl: url => invoke('plugin:opener|open_url', { url }),
    guildInfo: guildId => invoke('guild_info', { guildId }),
    guildMembers: guildId => invoke('guild_members', { guildId }),
    subscribeMembers: (guildId, channelId) => invoke('subscribe_members', { guildId, channelId }),
    setStatus: status => invoke('set_status', { status }),
    guildFolders: () => invoke('guild_folders'),
    saveFolders: folders => invoke('save_folders', { folders }),
    onEvent: cb => listen('discord', e => cb(e.payload)),
    onStatus: cb => listen('gateway_status', e => cb(e.payload)),
  };
}

let B = window.__TAURI__ ? tauriBackend() : null;
// В приложении отступы под статус-бар и клавиатуру уже делает Android-код (MainActivity.kt),
// поэтому CSS-отступы обнуляем, иначе сверху получается двойная пустая полоса.
if (window.__TAURI__) {
  document.documentElement.style.setProperty('--safe-top', '0px');
  document.documentElement.style.setProperty('--safe-bot', '0px');
}

// ---------------- утилиты ----------------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STAR_ICON = '<svg class="stroke" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/></svg>';
const store = {
  get(k, d) { try { const v = localStorage.getItem('pc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pc:' + k, JSON.stringify(v)); } catch {} },
};
const isTouch = matchMedia('(pointer: coarse)').matches;
const wide = () => innerWidth >= 900;

// ---- сжатие картинок: Discord сам отдаёт уменьшенную копию в WebP ----
// В чате — под размер экрана (картинка показывается максимум 400×320), на весь экран — до 2K (2048 px).
const IMG_MAX = 2048;
function sizedUrl(url, w, h, boxW, boxH) {
  if (!url || !/^https:\/\/(media\.discordapp\.net|images-ext-\d+\.discordapp\.net)\//.test(url)) return url;
  try {
    const u = new URL(url);
    if (w && h) {
      const k = Math.min(1, boxW / w, boxH / h, IMG_MAX / Math.max(w, h));
      u.searchParams.set('width', Math.max(1, Math.round(w * k)));
      u.searchParams.set('height', Math.max(1, Math.round(h * k)));
    }
    u.searchParams.set('format', 'webp'); // quality=lossy Discord не принимает — не добавляем
    return u.toString();
  } catch { return url; }
}
const DPR = Math.min(window.devicePixelRatio || 2, 3);
const imgThumb = (url, w, h) => sizedUrl(url, w, h, 400 * DPR, 320 * DPR);
const imgFull = (url, w, h) => sizedUrl(url, w, h, IMG_MAX, IMG_MAX);

function avatar(u) {
  if (!u) return '';
  if (u._c) { // демо
    const ch = esc((u.global_name || u.username || '?')[0].toUpperCase());
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${u._c}"/><text x="20" y="27" font-size="19" font-family="sans-serif" fill="#fff" text-anchor="middle">${ch}</text></svg>`);
  }
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=80`;
  let idx = 0;
  try { idx = u.discriminator && u.discriminator !== '0' ? (+u.discriminator) % 5 : Number((BigInt(u.id) >> 22n) % 6n); } catch {}
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}
const displayName = (u, member) => member?.nick || u?.global_name || u?.username || 'Неизвестный';
const guildIcon = g => g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=96` : null;
const initials = name => name.split(/\s+/).map(w => w[0]).join('').slice(0, 3);

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function fmtTime(iso, full) {
  const d = new Date(iso), now = new Date();
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (!full) return hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return 'Сегодня в ' + hm;
  if (sameDay(d, y)) return 'Вчера в ' + hm;
  return d.toLocaleDateString('ru-RU') + ' ' + hm;
}
function fmtStamp(sec, f = 'f') {
  const d = new Date(sec * 1000);
  const o = { t: { timeStyle: 'short' }, T: { timeStyle: 'medium' }, d: { dateStyle: 'short' }, D: { dateStyle: 'long' },
    f: { dateStyle: 'long', timeStyle: 'short' }, F: { dateStyle: 'full', timeStyle: 'short' } }[f];
  if (f === 'R') {
    const diff = Math.round((d - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
    const abs = Math.abs(diff);
    if (abs < 60) return rtf.format(diff, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  }
  return d.toLocaleString('ru-RU', o || {});
}

let toastTimer;
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}
const errText = e => typeof e === 'string' ? e : (e?.message || String(e));

// ---------------- состояние ----------------
const S = {
  me: null,
  guilds: [], dms: [],
  guildId: '@me',
  channels: new Map(),     // guildId -> [channel]
  chanById: new Map(),     // channelId -> channel
  channelId: null,
  msgs: new Map(),         // channelId -> [message] (старые -> новые)
  hasMore: new Map(),
  detached: false,         // открыт фрагмент истории (после «перейти» к старому закрепу)
  pins: new Map(),         // channelId -> [message]
  unread: new Set(),
  pings: new Map(),        // guildId|'@me' -> count
  users: new Map(),
  typing: new Map(),       // channelId -> Map(userId -> {name, until})
  reply: null, editing: null,
  collapsed: new Set(store.get('collapsed', [])),
  lastChannel: store.get('lastChannel', {}),
  loadingOlder: false,
  profiles: new Map(),     // userId -> profile
  acked: new Map(),        // channelId -> последний отмеченный id
  emojis: new Map(),       // guildId -> [custom emoji]
  files: [],               // прикреплённые к отправке файлы
  members: new Map(),      // guildId -> { cid, items, loading, error }
  roles: new Map(),        // guildId -> Map(roleId -> role)
  presence: new Map(),     // userId -> 'online' | 'idle' | 'dnd' | 'offline'
  acts: new Map(),         // userId -> activities[]
  presenceLoaded: false,
  myMember: new Map(),     // guildId -> мой участник (роли)
  mentions: new Map(),     // channelId -> число упоминаний (красный счётчик)
  chanGuild: new Map(),    // channelId -> guildId (для каналов, которые ещё не загружены)
  voice: new Map(),        // guildId -> Map(userId -> {channel_id, mute, deaf, stream, video})
  myStatus: null,
  folders: [],
  foldersSynced: false,
  openFolders: new Set(),
};

const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};
// Тег сервера рядом с ником (как «DBD», «WUWA» на ПК)
function guildTagHTML(u) {
  const pg = u?.primary_guild || u?.clan;
  if (!pg?.tag || pg.identity_enabled === false) return '';
  const badge = pg.badge && pg.identity_guild_id ? `<img src="https://cdn.discordapp.com/guild-tag-badges/${pg.identity_guild_id}/${pg.badge}.png?size=16" alt="">` : '';
  return `<span class="gtag">${badge}${esc(pg.tag)}</span>`;
}

// ---------------- markdown ----------------
function userName(id, m) {
  const u = m?.mentions?.find(x => x.id === id) || S.users.get(id);
  return u ? displayName(u, u.member) : 'пользователь';
}
function md(src, m) {
  if (!src) return '';
  let s = esc(src);
  const stash = [];
  const put = h => `\u0000${stash.push(h) - 1}\u0000`;
  s = s.replace(/```(?:([\w+#-]+)\n)?([\s\S]*?)```/g, (_, l, c) => put(`<pre><code>${c.replace(/^\n/, '').replace(/\n$/, '')}</code></pre>`));
  s = s.replace(/``([^`]+?)``|`([^`\n]+?)`/g, (_, a, b) => put(`<code>${a ?? b}</code>`));
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => put(`<a href="${u}" target="_blank" rel="noopener">${t}</a>`));
  s = s.replace(/&lt;(https?:\/\/[^\s]+?)&gt;|(https?:\/\/[^\s]+?)(?=[.,!?:;)\]]*(?:\s|$|&lt;|&quot;))/g,
    (_, a, b) => { const u = a || b; return put(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`); });
  s = s.replace(/&lt;@!?(\d+)&gt;/g, (_, id) => put(`<span class="mention">@${esc(userName(id, m))}</span>`));
  s = s.replace(/&lt;@&amp;(\d+)&gt;/g, () => put(`<span class="mention">@роль</span>`));
  s = s.replace(/&lt;#(\d+)&gt;/g, (_, id) => put(`<span class="mention" data-ch="${id}">#${esc(S.chanById.get(id)?.name || 'канал')}</span>`));
  s = s.replace(/&lt;(a?):(\w+):(\d+)&gt;/g, (_, a, n, id) => put(`<img class="emoji" alt=":${n}:" title=":${n}:" src="https://cdn.discordapp.com/emojis/${id}.${a ? 'gif' : 'webp'}?size=48">`));
  s = s.replace(/&lt;t:(-?\d+)(?::([tTdDfFR]))?&gt;/g, (_, t, f) => put(`<span class="ts">${esc(fmtStamp(+t, f))}</span>`));
  s = s.replace(/@(everyone|here)\b/g, (_, w) => put(`<span class="mention">@${w}</span>`));
  s = s
    .replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler">$1</span>')
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([\s\S]+?)__/g, '<u>$1</u>')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');
  const lines = s.split('\n');
  let out = '';
  lines.forEach((line, i) => {
    let mm, block = true, html;
    if ((mm = line.match(/^(#{1,3}) (.+)/))) html = `<h${mm[1].length}>${mm[2]}</h${mm[1].length}>`;
    else if ((mm = line.match(/^&gt; ?(.*)/))) html = `<blockquote>${mm[1] || ' '}</blockquote>`;
    else if ((mm = line.match(/^-# (.+)/))) html = `<div style="font-size:12px;color:var(--muted)">${mm[1]}</div>`;
    else { html = line; block = false; }
    out += html + (!block && i < lines.length - 1 ? '\n' : '');
  });
  for (let k = 0; k < 3 && out.includes('\u0000'); k++) out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
  return out;
}
const isJumbo = c => !!c && c.length < 200 && /^(?:\s|<a?:\w+:\d+>|\p{Extended_Pictographic}|️|‍|\p{Emoji_Modifier})+$/u.test(c);

// ---------------- отрисовка сообщений ----------------
function emojiHTML(e) {
  return e.id ? `<img src="https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'webp'}?size=48" alt="${esc(e.name)}">` : esc(e.name);
}
const emojiKey = e => e.id ? `${e.name}:${e.id}` : e.name;

function attachmentsHTML(m) {
  let h = '';
  for (const a of m.attachments || []) {
    const ct = a.content_type || '';
    if (ct === 'image/gif' || /\.gif$/i.test(a.filename || '')) {
      const ratio = a.width && a.height ? ` style="aspect-ratio:${a.width}/${a.height}"` : '';
      h += gifBox(a.url, a.proxy_url || a.url, a.width, a.height, `<img loading="lazy" src="${esc(a.proxy_url || a.url)}"${ratio} alt="">`);
    } else if (ct.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(a.filename || '')) {
      const ratio = a.width && a.height ? ` style="aspect-ratio:${a.width}/${a.height}"` : '';
      h += `<div class="att"><img loading="lazy" src="${esc(imgThumb(a.proxy_url || a.url, a.width, a.height))}" data-full="${esc(imgFull(a.proxy_url || a.url, a.width, a.height))}"${ratio} alt=""></div>`;
    } else if (ct.startsWith('video/')) {
      h += `<div class="att"><video controls preload="metadata" playsinline src="${esc(a.url)}"></video></div>`;
    } else {
      const kb = a.size ? ` · ${(a.size / 1024).toFixed(0)} КБ` : '';
      h += `<a class="att file" href="${esc(a.url)}" target="_blank" rel="noopener">📄 ${esc(a.filename)}${kb}</a>`;
    }
  }
  for (const st of m.sticker_items || []) {
    h += st.format_type === 3 ? `<div class="att file">🏷 ${esc(st.name)}</div>`
      : `<img class="stk" src="https://media.discordapp.net/stickers/${st.id}.${st.format_type === 4 ? 'gif' : 'webp'}?size=160" alt="${esc(st.name)}">`;
  }
  for (const e of m.embeds || []) {
    if ((e.type === 'gifv') && e.video) {
      h += gifBox(e.url, e.video.url, e.video.width, e.video.height, `<video ${vidAttrs()} src="${esc(e.video.url)}"></video>`, e.thumbnail?.url);
      continue;
    }
    if (e.type === 'image' && (e.thumbnail || e.image)) { const i = e.image || e.thumbnail; h += `<div class="att"><img loading="lazy" src="${esc(imgThumb(i.proxy_url || i.url, i.width, i.height))}" data-full="${esc(imgFull(i.proxy_url || i.url, i.width, i.height))}" alt=""></div>`; continue; }
    const col = e.color != null ? `border-left-color:#${e.color.toString(16).padStart(6, '0')}` : '';
    let b = '';
    if (e.provider?.name) b += `<div class="e-prov">${esc(e.provider.name)}</div>`;
    if (e.author?.name) b += `<div class="e-auth">${esc(e.author.name)}</div>`;
    if (e.title) b += e.url ? `<a class="e-title" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : `<div class="e-title" style="color:var(--text-strong)">${esc(e.title)}</div>`;
    if (e.description) b += `<div class="e-desc body">${md(e.description, m)}</div>`;
    for (const f of e.fields || []) b += `<div class="e-field"><b>${esc(f.name)}</b><span class="body">${md(f.value, m)}</span></div>`;
    const img = e.image || (e.type !== 'rich' ? e.thumbnail : null);
    if (img) b += `<img loading="lazy" src="${esc(imgThumb(img.proxy_url || img.url, img.width, img.height))}" data-full="${esc(imgFull(img.proxy_url || img.url, img.width, img.height))}" alt="">`;
    if (e.footer?.text) b += `<div class="e-prov" style="margin-top:6px">${esc(e.footer.text)}</div>`;
    if (b) h += `<div class="embed" style="${col}">${b}</div>`;
  }
  return h;
}

function reactionsHTML(m) {
  if (!m.reactions?.length) return '';
  return `<div class="reacts">${m.reactions.map(r =>
    `<button class="rx${r.me ? ' me' : ''}" data-emoji="${esc(emojiKey(r.emoji))}">${emojiHTML(r.emoji)}<span>${r.count}</span></button>`).join('')}</div>`;
}

// GIF в чате: нажатие показывает ☆ в углу (как наведение на ПК), ☆ — добавить в избранное.
function gifBox(url, src, w, h, media, preview) {
  if (!url) return `<div class="att">${media}</div>`;
  const on = isFavGif(url);
  return `<div class="att gifv" data-gurl="${esc(url)}" data-gsrc="${esc(src || '')}" data-gw="${w || ''}" data-gh="${h || ''}" data-gprev="${esc(preview || '')}">${media}<button class="gif-star${on ? ' on' : ''}" aria-label="В избранное">${STAR_ICON}</button></div>`;
}

function grouped(m, prev) {
  if (!prev || m.type === 19 || ![0, 19].includes(m.type) || ![0, 19].includes(prev.type)) return false;
  if (prev.author?.id !== m.author?.id) return false;
  const a = new Date(prev.timestamp), b = new Date(m.timestamp);
  return b - a < 7 * 60000 && sameDay(a, b);
}

// Системные сообщения Discord (звонки, участники группы, бусты…), как на ПК.
const SYS_PHONE = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>';
const SYS_IN = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M4 11h12.2l-5.6-5.6L12 4l8 8-8 8-1.4-1.4 5.6-5.6H4z"/></svg>';
const SYS_OUT = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>';
const SYS_PEN = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z"/></svg>';
function sysText(m, name) {
  const who = `<b class="sys-name" data-uid="${m.author?.id}">${name}</b>`;
  const target = m.mentions?.[0];
  const tgt = target ? `<b class="sys-name" data-uid="${target.id}">${esc(displayName(target))}</b>` : 'кого-то';
  switch (m.type) {
    case 1: return { icon: SYS_IN, color: 'var(--green)', html: `${who} добавляет ${tgt} в группу.` };
    case 2: return target && target.id !== m.author?.id
      ? { icon: SYS_OUT, color: 'var(--red)', html: `${who} удаляет ${tgt} из группы.` }
      : { icon: SYS_OUT, color: 'var(--red)', html: `${who} покидает группу.` };
    case 3: {
      const c = m.call || {};
      const missed = c.ended_timestamp && S.me && !c.participants?.includes(S.me.id);
      if (missed) return { icon: SYS_PHONE, color: 'var(--red)', html: `Вы пропустили звонок от ${who}.` };
      let dur = '';
      if (c.ended_timestamp) {
        const min = Math.max(1, Math.round((new Date(c.ended_timestamp) - new Date(m.timestamp)) / 60000));
        dur = min >= 60 ? ` Он длился ${Math.floor(min / 60)} ч ${min % 60} мин.` : ` Он длился ${min} ${plural(min, 'минуту', 'минуты', 'минут')}.`;
      }
      return { icon: SYS_PHONE, color: 'var(--green)', html: `${who} начинает звонок.${dur}` };
    }
    case 4: return { icon: SYS_PEN, color: 'var(--muted)', html: `${who} изменяет название канала: <b class="sys-name">${esc(m.content)}</b>` };
    case 5: return { icon: SYS_PEN, color: 'var(--muted)', html: `${who} изменяет значок группы.` };
    case 6: return { icon: '📌', color: 'var(--muted)', html: `${who} закрепил(а) сообщение. <a href="#" class="open-pins sys-name">Все закреплённые</a>` };
    case 7: return { icon: SYS_IN, color: 'var(--green)', html: `${who} присоединяется к серверу.` };
    case 8: return { icon: '💎', color: '#ff73fa', html: `${who} бустит сервер!` };
    case 9: case 10: case 11:
      return { icon: '💎', color: '#ff73fa', html: `${who} бустит сервер! Сервер достигает ${m.type - 8} уровня!` };
    case 12: return { icon: SYS_IN, color: 'var(--green)', html: `${who} подписывает канал <b class="sys-name">${esc(m.content)}</b> на этот.` };
    case 18: return { icon: '🧵', color: 'var(--muted)', html: `${who} начинает ветку: <b class="sys-name">${esc(m.content)}</b>` };
  }
  return null;
}

function msgHTML(m, prev, opt = {}) {
  S.users.set(m.author?.id, { ...m.author, member: m.member });
  const name = esc(displayName(m.author, m.member));
  const cls = ['m'];
  if (m._pending) cls.push('pending');
  if (m._failed) cls.push('failed');
  const mentioned = S.me && (m.mentions?.some(u => u.id === S.me.id) || m.mention_everyone);
  if (mentioned) cls.push('mentioned');

  const sys = sysText(m, name);
  if (sys) {
    return `<div class="${cls.join(' ')} sys" data-id="${m.id}"><span class="ic" style="color:${sys.color}">${sys.icon}</span>${sys.html} <span class="time">${fmtTime(m.timestamp, true)}</span></div>`;
  }

  const head = opt.forceHead || !grouped(m, prev);
  if (head) cls.push('head');
  let h = `<div class="${cls.join(' ')}" data-id="${m.id}">`;
  if (head) {
    if (m.type === 19 || m.referenced_message) {
      const r = m.referenced_message;
      h += r ? `<div class="reply" data-jump="${r.id}"><img src="${avatar(r.author)}" alt=""><b>${esc(displayName(r.author, r.member))}</b><span>${esc((r.content || 'Вложение').slice(0, 120))}</span></div>`
        : `<div class="reply"><span><i>Исходное сообщение удалено</i></span></div>`;
    }
    h += `<img class="av" data-uid="${m.author?.id}" src="${avatar(m.author)}" alt="" loading="lazy">`;
    h += `<div class="meta"><span class="name" data-uid="${m.author?.id}">${name}</span>${m.author?.bot ? '<span class="tag">бот</span>' : ''}<span class="time">${fmtTime(m.timestamp, true)}</span></div>`;
  }
  const jumbo = isJumbo(m.content) ? ' jumbo' : '';
  // сообщение — только ссылка на GIF/картинку: как в Discord, показываем лишь саму картинку
  const onlyMedia = m.content && m.embeds?.length && m.embeds.every(e => (e.type === 'gifv' || e.type === 'image') && e.url === m.content.trim());
  if (onlyMedia) h += m.edited_timestamp ? '<div class="body"><span class="edited">(ред.)</span></div>' : '';
  else h += `<div class="body${jumbo}">${md(m.content, m)}${m.edited_timestamp ? ' <span class="edited">(ред.)</span>' : ''}</div>`;
  h += attachmentsHTML(m) + reactionsHTML(m);
  return h + '</div>';
}

function dayHTML(m, prev) {
  if (prev && sameDay(new Date(prev.timestamp), new Date(m.timestamp))) return '';
  return `<div class="day"><span>${new Date(m.timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>`;
}

function renderMessages() {
  const list = S.msgs.get(S.channelId) || [];
  const ch = S.chanById.get(S.channelId);
  let h = '';
  if (S.hasMore.get(S.channelId)) h += `<div class="loader-top">Загрузка истории…</div>`;
  else if (ch) h += `<div class="chan-start"><div class="big">${ch.type === 1 ? '@' : '#'}</div><h2>${esc(chanTitle(ch))}</h2><p>Это начало канала.</p></div>`;
  list.forEach((m, i) => { const p = list[i - 1]; h += dayHTML(m, p) + msgHTML(m, p); });
  if (S.detached) h += `<div style="padding:12px;text-align:center"><button class="btn-primary" id="toPresent" style="width:auto;padding:8px 16px">К новым сообщениям ↓</button></div>`;
  $('#msgInner').innerHTML = h;
}

function rerenderOne(id) {
  const list = S.msgs.get(S.channelId) || [];
  const i = list.findIndex(m => m.id === id);
  const el = $(`#msgInner .m[data-id="${CSS.escape(id)}"]`);
  if (i < 0 || !el) return renderMessages();
  el.outerHTML = msgHTML(list[i], list[i - 1]);
}

const nearBottom = () => $('#messages').scrollTop > -120; // column-reverse: 0 = низ
const scrollBottom = () => { $('#messages').scrollTop = 0; };

function appendMessage(m) {
  const list = S.msgs.get(m.channel_id);
  if (!list) return;
  if (list.some(x => x.id === m.id)) return;
  const pi = m.nonce ? list.findIndex(x => x._pending && x.nonce === m.nonce) : -1;
  if (pi >= 0) { list[pi] = m; if (m.channel_id === S.channelId) rerenderOne(m.nonce); return; }
  if (S.detached && m.channel_id === S.channelId) return;
  const prev = list[list.length - 1];
  list.push(m);
  if (list.length > 400) list.splice(0, list.length - 300);
  if (m.channel_id !== S.channelId) return;
  const stick = nearBottom();
  $('#msgInner').insertAdjacentHTML('beforeend', dayHTML(m, prev) + msgHTML(m, prev));
  if (stick || m.author?.id === S.me?.id) scrollBottom();
  if (!m._pending) scheduleAck();
}

// ---------------- серверы и каналы ----------------
function chanTitle(c) {
  if (c.type === 1) return displayName(c.recipients?.[0]);
  if (c.type === 3) return c.name || c.recipients?.map(u => displayName(u)).join(', ');
  return c.name;
}

// ---------------- настройки: профиль, сообщения, оформление ----------------
const GEAR_SVG = '<svg class="stroke" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const PREF_DEFAULTS = { fontSize: 16, compact: false, embeds: true, gifAutoplay: true, jumbo: true, enterSend: false, theme: 'default', bgDim: 0.45, quickReact: '❤️' };
const QUICK_REACTS = ['❤️', '👍', '😂', '🔥', '💀', '😭'];
let prefs = { ...PREF_DEFAULTS, ...store.get('prefs', {}) };
const setPref = (k, v) => { prefs[k] = v; store.set('prefs', prefs); applyPrefs(); };

// Темы — только у вас на телефоне; другие люди видят Discord как обычно.
const THEMES = [
  { id: 'default', name: 'Как в Discord', bg: '#313338' },
  { id: 'amoled', name: 'AMOLED — чёрная, бережёт батарею', bg: '#000', amoled: true },
  { id: 'mint', name: 'Мята', bg: 'linear-gradient(160deg,#a8e6cf,#dcedc1)', light: true },
  { id: 'peach', name: 'Персик', bg: 'linear-gradient(160deg,#ffd194,#f6a5a5)', light: true },
  { id: 'lavender', name: 'Лаванда', bg: 'linear-gradient(160deg,#c3b5e8,#a1c4fd)', light: true },
  { id: 'citrus', name: 'Цитрус', bg: 'linear-gradient(160deg,#fbe7a1,#c5f0d6)', light: true },
  { id: 'rose', name: 'Роза', bg: 'linear-gradient(160deg,#e8a5c8,#d8d1a6)', light: true },
  { id: 'cotton', name: 'Сахарная вата', bg: 'linear-gradient(160deg,#ffd6e0,#d9e4ff)', light: true },
  { id: 'sky', name: 'Небо', bg: 'linear-gradient(160deg,#cfe9ff,#e8f8e0)', light: true },
  { id: 'vanilla', name: 'Ваниль', bg: 'linear-gradient(160deg,#f3ead3,#ece3d0)', light: true },
  { id: 'dusk', name: 'Сумерки', bg: 'linear-gradient(160deg,#4b2f86,#c06a3c)' },
  { id: 'neon', name: 'Неон', bg: 'linear-gradient(135deg,#7b1fa2,#3949ab 50%,#0091ea)' },
  { id: 'forest', name: 'Лес', bg: 'linear-gradient(160deg,#1e3b2c,#7a6a3a)' },
  { id: 'blood', name: 'Кровь', bg: 'linear-gradient(135deg,#7a0000,#140000)' },
  { id: 'night', name: 'Ночь', bg: 'linear-gradient(160deg,#121042,#2b2a8a)' },
  { id: 'brick', name: 'Кирпич', bg: 'linear-gradient(160deg,#7b3a30,#5a2a25)' },
  { id: 'storm', name: 'Гроза', bg: 'linear-gradient(180deg,#4a4560,#7d8aa8)' },
  { id: 'moss', name: 'Мох', bg: 'linear-gradient(160deg,#3e5f4e,#4f6f60)' },
  { id: 'deep', name: 'Глубина', bg: 'linear-gradient(160deg,#2f3f7a,#2e6b78)' },
  { id: 'aurora', name: 'Сияние', bg: 'linear-gradient(180deg,#1f7a8c,#8a3fa0)' },
  { id: 'sunset', name: 'Закат', bg: 'linear-gradient(160deg,#b0124f,#e8a317)' },
  { id: 'cyber', name: 'Кибер', bg: 'linear-gradient(135deg,#0b6e4f,#1f3fbf 50%,#0aa)' },
  { id: 'coffee', name: 'Кофе', bg: 'linear-gradient(160deg,#6b5a3e,#3d2f1f)' },
  { id: 'ultra', name: 'Ультрамарин', bg: 'linear-gradient(160deg,#1a1aa8,#3b4fd6)' },
];
// Иконки приложения (варианты котика). Меняется значок на рабочем столе.
const APP_ICONS = [ // по цветам: чёрный → белый → розовые → оранжевые → голубые
  { id: 'default', name: 'Классика' }, { id: 'lilac', name: 'Сирень' }, { id: 'pink', name: 'Сакура' },
  { id: 'sunset', name: 'Коралл' }, { id: 'blurple', name: '♡w♡' }, { id: 'flushed', name: 'Хааах~' },
  { id: 'owo', name: 'ÔwÔ' }, { id: 'bunny', name: 'Зайка' }, { id: 'ocean', name: '≧◠w◠≦' },
];

function applyPrefs() {
  const b = document.body;
  b.style.setProperty('--msg-font', prefs.fontSize + 'px');
  b.classList.toggle('compact', !!prefs.compact);
  b.classList.toggle('no-embeds', !prefs.embeds);
  b.classList.toggle('no-jumbo', !prefs.jumbo);
  // тема: свой фон-картинка или пресет
  const img = prefs.theme === 'custom' ? store.get('bgImage', null) : null;
  const t = THEMES.find(x => x.id === prefs.theme);
  // AMOLED — сплошной чёрный без размытия (размытие у других тем дороже для видеокарты)
  const amoled = !img && !!t?.amoled;
  b.classList.toggle('amoled', amoled);
  const themed = !!img || (t && t.id !== 'default' && !amoled);
  b.classList.toggle('themed', themed);
  b.classList.toggle('light', !img && !!t?.light);
  if (img) b.style.setProperty('--theme-bg', `linear-gradient(rgba(0,0,0,${prefs.bgDim}),rgba(0,0,0,${prefs.bgDim})),url("${img}") center/cover`);
  else if (themed) b.style.setProperty('--theme-bg', t.bg);
  else b.style.removeProperty('--theme-bg');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', themed || amoled ? '#000000' : '#1e1f22');
}
const vidAttrs = () => prefs.gifAutoplay ? 'autoplay loop muted playsinline' : 'loop muted playsinline preload="metadata"';

let setTab = 'profile';
function openSettings(tab) {
  if (tab) setTab = tab;
  pushPanel();
  $('#settings').classList.remove('hidden');
  document.querySelectorAll('[data-stab]').forEach(b => b.classList.toggle('active', b.dataset.stab === setTab));
  renderSettings();
}
function renderSettings() {
  const box = $('#setBody');
  if (setTab === 'profile') return renderProfileSettings(box);
  if (setTab === 'messages') return renderMessageSettings(box);
  renderLookSettings(box);
}
const toggleRow = (key, title, sub) => `<label class="set-row"><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-pref="${key}" ${prefs[key] ? 'checked' : ''}><i class="sw"></i></label>`;

// --- вкладка «Профиль» ---
let myProfile = null;
async function renderProfileSettings(box) {
  const u = S.me;
  const p = myProfile?.user_profile || {};
  box.innerHTML = `<div class="set-sec">
    <div class="set-me">
      <div class="set-av"><img src="${avatar(u)}" alt=""><button id="setAvatar" aria-label="Сменить аватар">${ICON.img}</button></div>
      <div><b>${esc(displayName(u))}</b><small>${esc(u.username || '')}</small></div>
    </div>
    <label class="set-lbl">Отображаемое имя</label>
    <input id="setName" class="set-in" maxlength="32" value="${esc(u.global_name || '')}" placeholder="${esc(u.username || '')}">
    ${u.is_bot_session ? '' : `<label class="set-lbl">Обо мне</label>
    <textarea id="setBio" class="set-in" maxlength="190" rows="4" placeholder="Расскажите о себе">${esc(p.bio || '')}</textarea>
    <label class="set-lbl">Местоимения</label>
    <input id="setPron" class="set-in" maxlength="40" value="${esc(p.pronouns || '')}" placeholder="например, он/его">`}
    <button id="setSave" class="set-btn primary">Сохранить</button>
    ${myProfile ? '' : '<p class="set-note">Загрузка профиля…</p>'}
  </div>
  <div class="set-sec">
    <button id="setLogout" class="set-btn danger">Выйти из аккаунта</button>
  </div>`;
  if (!myProfile && !u.is_bot_session) {
    try { myProfile = await B.profile(u.id); } catch { myProfile = {}; }
    if (setTab === 'profile' && !$('#settings').classList.contains('hidden')) renderProfileSettings(box);
  }
}
async function saveProfile() {
  const u = S.me, p = myProfile?.user_profile || {};
  const name = $('#setName')?.value.trim() ?? '';
  const bio = $('#setBio')?.value ?? null, pron = $('#setPron')?.value.trim() ?? null;
  let ok = true;
  if (name !== (u.global_name || '')) {
    try { const r = await B.api('PATCH', '/users/@me', { global_name: name || null }); Object.assign(S.me, r || { global_name: name }); } catch (e) { ok = false; apiErr(e); }
  }
  if (bio !== null && (bio !== (p.bio || '') || pron !== (p.pronouns || ''))) {
    try { await B.api('PATCH', '/users/@me/profile', { bio, pronouns: pron }); myProfile = { ...myProfile, user_profile: { ...p, bio, pronouns: pron } }; } catch (e) { ok = false; apiErr(e); }
  }
  if (ok) toast('Профиль сохранён');
  renderUser(); renderSettings();
}
// картинку уменьшаем до 512×512 (аватар) — быстрее загрузка, Discord всё равно сжимает
function imageToDataUrl(file, max, type = 'image/png', q = 0.9) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL(type, q));
    };
    img.onerror = e => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
async function uploadAvatar(file) {
  if (!file) return;
  try {
    const data = await imageToDataUrl(file, 512);
    const r = await B.api('PATCH', '/users/@me', { avatar: data });
    if (r) Object.assign(S.me, r);
    toast('Аватар обновлён'); renderUser(); renderSettings();
  } catch (e) { apiErr(e); }
}

// --- вкладка «Сообщения» ---
function renderMessageSettings(box) {
  const sizes = [14, 15, 16, 18, 20];
  box.innerHTML = `<div class="set-sec">
    <label class="set-lbl">Размер текста</label>
    <div class="set-seg">${sizes.map(s => `<button data-font="${s}" class="${prefs.fontSize === s ? 'on' : ''}" style="font-size:${s}px">Аа</button>`).join('')}</div>
    <div class="set-preview m head"><img class="av" src="${avatar(S.me)}" alt=""><div class="hdr"><span class="name">${esc(displayName(S.me))}</span> <span class="time">Сегодня в 12:00</span></div><div class="body">Так будут выглядеть сообщения 👋</div></div>
  </div>
  <div class="set-sec">
    ${toggleRow('compact', 'Компактный режим', 'Меньше отступы и аватарки — больше сообщений на экране')}
    ${toggleRow('embeds', 'Превью ссылок', 'Карточки сайтов и видео под ссылками')}
    ${toggleRow('gifAutoplay', 'Автовоспроизведение GIF', 'Выключите, чтобы экономить батарею и трафик: GIF запускается нажатием')}
    ${toggleRow('jumbo', 'Крупные эмодзи', 'Сообщение из одних эмодзи показывается крупно')}
    ${toggleRow('enterSend', 'Отправка по Enter', 'Кнопка ↵ на клавиатуре отправляет сообщение, а не переносит строку')}
  </div>
  <div class="set-sec">
    <label class="set-lbl">Двойной тап по сообщению</label>
    <p class="set-note">Ставит реакцию. Ответить — смахнуть сообщение влево.</p>
    <div class="set-seg emo">${QUICK_REACTS.map(e => `<button data-qreact="${e}" class="${prefs.quickReact === e ? 'on' : ''}">${e}</button>`).join('')}<button data-qreact="" class="${prefs.quickReact ? '' : 'on'}">Выкл</button></div>
  </div>
  ${storageHTML()}`;
}

// --- хранилище: сколько занимает Pocketcord, очистка кэша, автоочистка ---
const fmtMB = b => b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1) + ' ГБ' : Math.max(0.1, b / 1024 ** 2).toFixed(1) + ' МБ';
function storageInfo() { try { return JSON.parse(window.PcNotify?.storageInfo?.() || 'null'); } catch { return null; } }
function storageHTML() {
  const s = storageInfo();
  const auto = prefs.autoClean || '200';
  const opt = (v, l) => `<button data-autoclean="${v}" class="${auto === v ? 'on' : ''}">${l}</button>`;
  return `<div class="set-sec">
    <label class="set-lbl">Хранилище</label>
    ${s ? `<div class="stor">
      <div><span>Приложение</span><b>${fmtMB(s.app)}</b></div>
      <div><span>Вход, настройки, тема</span><b>${fmtMB(s.data)}</b></div>
      <div><span>Кэш картинок и GIF</span><b>${fmtMB(s.cache)}</b></div>
    </div>` : '<p class="set-note">Доступно в приложении на телефоне.</p>'}
    <p class="set-note">Картинки в чате загружаются сжатыми под экран, на весь экран — до 2K. Очистка кэша не трогает чаты, вход и настройки: картинки просто скачаются заново.</p>
    <button id="clearCache" class="set-btn">Очистить кэш</button>
    <label class="set-lbl" style="margin-top:14px">Автоочистка кэша</label>
    <div class="set-seg small">${opt('off', 'Выкл')}${opt('week', 'Раз в неделю')}${opt('200', 'Больше 200 МБ')}</div>
  </div>`;
}
function clearCacheNow(silent) {
  if (!window.PcNotify?.clearCache) return silent || toast('Доступно в приложении на телефоне');
  window.PcNotify.clearCache();
  store.set('lastClean', Date.now());
  if (!silent) { toast('Кэш очищен'); setTimeout(() => { if (setTab === 'messages' && !$('#settings').classList.contains('hidden')) renderSettings(); }, 600); }
}
// при запуске: раз в неделю или когда кэш больше 200 МБ
function autoCleanCheck() {
  const mode = prefs.autoClean || '200';
  if (mode === 'off' || !window.PcNotify?.storageInfo) return;
  if (mode === 'week') { if (Date.now() - store.get('lastClean', 0) > 7 * 864e5) clearCacheNow(true); return; }
  setTimeout(() => { const s = storageInfo(); if (s && s.cache > 200 * 1024 ** 2) clearCacheNow(true); }, 4000);
}

// --- вкладка «Оформление» ---
function renderLookSettings(box) {
  const hasImg = !!store.get('bgImage', null);
  const icon = window.PcNotify?.getAppIcon?.() || store.get('appIcon', 'default');
  box.innerHTML = `<div class="set-sec">
    <label class="set-lbl">Тема</label>
    <p class="set-note">Видна только вам — у других людей Discord выглядит как обычно.</p>
    <div class="theme-grid">
      <button class="theme-tile add${prefs.theme === 'custom' ? ' on' : ''}" data-bg="pick" title="Своя картинка">${hasImg ? `<img src="${store.get('bgImage')}" alt="">` : ''}<span>${ICON.img}</span></button>
      ${THEMES.map(t => `<button class="theme-tile${prefs.theme === t.id ? ' on' : ''}" data-theme="${t.id}" title="${t.name}" style="background:${t.bg}"></button>`).join('')}
    </div>
    ${prefs.theme === 'custom' && hasImg ? `<label class="set-lbl">Затемнение картинки</label>
      <input type="range" id="bgDim" min="0" max="0.8" step="0.05" value="${prefs.bgDim}">
      <button class="set-btn" data-bg="remove">Убрать свою картинку</button>` : ''}
  </div>
  <div class="set-sec">
    <label class="set-lbl">Значок приложения</label>
    <p class="set-note">${window.PcNotify ? 'Сменится значок Pocketcord на рабочем столе (через пару секунд).' : 'Доступно в приложении на телефоне.'}</p>
    <div class="icon-grid">${APP_ICONS.map(i => `<button class="icon-tile${icon === i.id ? ' on' : ''}" data-icon="${i.id}"><img src="icons/${i.id}.png" alt=""><small>${i.name}</small></button>`).join('')}</div>
  </div>`;
}
async function setCustomBg(file) {
  if (!file) return;
  try {
    const data = await imageToDataUrl(file, 1280, 'image/jpeg', 0.82);
    store.set('bgImage', data);
    if (!store.get('bgImage', null)) return toast('Картинка слишком большая');
    setPref('theme', 'custom'); renderSettings();
  } catch { toast('Не удалось открыть картинку'); }
}
function bindSettings() {
  $('#setClose').onclick = () => closePanels();
  document.querySelector('.set-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-stab]'); if (!b) return;
    setTab = b.dataset.stab; openSettingsTabs(); renderSettings(); $('#setBody').scrollTop = 0;
  });
  const body = $('#setBody');
  body.addEventListener('change', e => {
    const k = e.target.dataset.pref; if (k) setPref(k, e.target.checked);
  });
  body.addEventListener('input', e => { if (e.target.id === 'bgDim') setPref('bgDim', +e.target.value); });
  body.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('#setSave')) return saveProfile();
    if (t.closest('#setAvatar')) return $('#avatarInput').click();
    if (t.closest('#setLogout')) return showMenu('Выйти из аккаунта?', [
      { label: 'Выйти', danger: true, fn: async () => { await B.logout().catch(() => {}); location.reload(); } },
      { label: 'Отмена', fn: () => {} }]);
    const f = t.closest('[data-font]'); if (f) { setPref('fontSize', +f.dataset.font); return renderSettings(); }
    if (t.closest('#clearCache')) return clearCacheNow();
    const qr = t.closest('[data-qreact]'); if (qr) { setPref('quickReact', qr.dataset.qreact); return renderSettings(); }
    const ac = t.closest('[data-autoclean]'); if (ac) { setPref('autoClean', ac.dataset.autoclean); return renderSettings(); }
    const th = t.closest('[data-theme]'); if (th) { setPref('theme', th.dataset.theme); return renderSettings(); }
    const bg = t.closest('[data-bg]');
    if (bg) {
      if (bg.dataset.bg === 'remove') { store.set('bgImage', null); setPref('theme', 'default'); return renderSettings(); }
      if (store.get('bgImage', null) && prefs.theme !== 'custom') { setPref('theme', 'custom'); return renderSettings(); }
      return $('#bgInput').click();
    }
    const ic = t.closest('[data-icon]');
    if (ic) {
      if (!window.PcNotify?.setAppIcon) return toast('Значок меняется только в приложении на телефоне');
      window.PcNotify.setAppIcon(ic.dataset.icon); store.set('appIcon', ic.dataset.icon);
      toast('Значок сменится на рабочем столе через пару секунд'); renderSettings();
    }
  });
  $('#avatarInput').addEventListener('change', e => { uploadAvatar(e.target.files?.[0]); e.target.value = ''; });
  $('#bgInput').addEventListener('change', e => { setCustomBg(e.target.files?.[0]); e.target.value = ''; });
}
const openSettingsTabs = () => document.querySelectorAll('[data-stab]').forEach(b => b.classList.toggle('active', b.dataset.stab === setTab));

// ---------------- непрочитанное ----------------
// Счётчик на сервере = сумма упоминаний в его каналах (для ЛС — непрочитанные сообщения).
function recomputePings() {
  S.pings.clear();
  for (const [cid, n] of S.mentions) {
    const gid = S.chanById.get(cid)?.guild_id || S.chanGuild.get(cid) || '@me';
    S.pings.set(gid, (S.pings.get(gid) || 0) + n);
  }
}
/** Канал прочитан: убрать подсветку и счётчик. true — что-то изменилось. */
function markSeen(cid) {
  const a = S.unread.delete(cid), b = S.mentions.delete(cid);
  if (b) recomputePings();
  return a || b;
}
function onReadState(d) {
  for (const [cid, gid] of Object.entries(d.guildOf || {})) S.chanGuild.set(cid, gid);
  S.unread = new Set(d.unread || []);
  S.mentions = new Map(Object.entries(d.mentions || {}).map(([k, v]) => [k, +v]));
  // открытый сейчас чат считается прочитанным
  if (S.channelId && document.visibilityState === 'visible') { markSeen(S.channelId); scheduleAck(); }
  recomputePings();
  renderRail(); renderChannels();
}

// ---------------- голосовые каналы: кто там сидит ----------------
const MIC_OFF = '<svg viewBox="0 0 24 24" class="vu-ic"><path fill="currentColor" d="M12 2a3 3 0 0 0-3 3v5.2l6 6V5a3 3 0 0 0-3-3zM3.3 2 2 3.3l17.7 17.7 1.3-1.3-4.1-4.1A6.9 6.9 0 0 0 19 11h-2a5 5 0 0 1-.9 2.8l-1.4-1.4c.2-.4.3-.9.3-1.4V9.6L9 3.9V5zM5 11H7a5 5 0 0 0 6.1 4.9l1.6 1.6A7 7 0 0 1 13 18v3h-2v-3a7 7 0 0 1-6-7z"/></svg>';
const HEAD_OFF = '<svg viewBox="0 0 24 24" class="vu-ic"><path fill="currentColor" d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-7H5v-2a7 7 0 0 1 11.7-5.2l1.4-1.4A9 9 0 0 0 12 3zm7.4 3.4-1.4 1.4A7 7 0 0 1 19 12v2h-2v7h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-1.6-5.6zM3.3 2 2 3.3l18.7 18.7 1.3-1.3z"/></svg>';
function onVoiceStates(d) {
  for (const [gid, list] of Object.entries(d || {})) {
    const m = new Map(); list.forEach(v => m.set(v.user_id, v)); S.voice.set(gid, m);
  }
  if (S.voice.has(S.guildId)) { needVoiceNames(S.guildId); renderChannels(); }
}
function onVoiceUpdate(d) {
  if (!d.guild_id) return;
  if (!S.voice.has(d.guild_id)) S.voice.set(d.guild_id, new Map());
  const m = S.voice.get(d.guild_id);
  if (d.member?.user) S.users.set(d.user_id, { ...d.member.user, member: d.member });
  if (!d.channel_id) m.delete(d.user_id);
  else m.set(d.user_id, { user_id: d.user_id, channel_id: d.channel_id, mute: d.self_mute || d.mute, deaf: d.self_deaf || d.deaf, stream: d.self_stream, video: d.self_video });
  if (S.guildId === d.guild_id) renderChannels();
}
// Имена тех, кого ещё не видели, — просим у Discord (ответ — GUILD_MEMBERS_CHUNK)
const voiceAsked = new Set();
function needVoiceNames(gid) {
  const ids = [...(S.voice.get(gid)?.keys() || [])].filter(id => !S.users.get(id)?.username && !voiceAsked.has(id));
  if (!ids.length || !B.requestMemberIds || S.me?.is_bot_session) return;
  ids.forEach(id => voiceAsked.add(id));
  // Discord отдаёт не больше 100 человек за запрос — шлём пачками по 50 с паузой
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    setTimeout(() => B.requestMemberIds(gid, part).catch(() => part.forEach(id => voiceAsked.delete(id))), (i / 50) * 400);
  }
}
// Стандартная аватарка Discord по ID — пока ник и аватар не пришли
const defaultAvatar = id => { try { return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`; } catch { return ''; } };
function onVoiceNames(gid) { if (gid === S.guildId && S.voice.has(gid)) renderChannels(); }
function voiceUsersHTML(gid, cid) {
  const m = S.voice.get(gid); if (!m) return '';
  const here = [...m.values()].filter(v => v.channel_id === cid);
  if (!here.length) return '';
  return `<div class="vu-list">${here.map(v => {
    const u = S.users.get(v.user_id) || (v.user_id === S.me?.id ? S.me : null);
    const name = u ? (u.member?.nick || displayName(u)) : '…';
    return `<div class="vu" data-uid="${v.user_id}"><img src="${u ? avatar(u) : defaultAvatar(v.user_id)}" alt=""><span class="vu-nm">${esc(name)}</span>${v.stream ? '<span class="vu-live">LIVE</span>' : ''}${v.deaf ? HEAD_OFF : v.mute ? MIC_OFF : ''}</div>`;
  }).join('')}</div>`;
}

// ---------------- управление своими серверами ----------------
// Права берём из списка серверов: Discord сам считает их для вас (поле permissions), владельцу можно всё.
const PERM = { KICK: 1n << 1n, BAN: 1n << 2n, ADMIN: 1n << 3n, CHANNELS: 1n << 4n, GUILD: 1n << 5n, ROLES: 1n << 28n, MODERATE: 1n << 40n };
function can(gid, perm) {
  const g = S.guilds.find(x => x.id === gid); if (!g) return false;
  if (g.owner) return true;
  let p = 0n; try { p = BigInt(g.permissions || 0); } catch {}
  return (p & PERM.ADMIN) !== 0n || (p & perm) !== 0n;
}
const canManageAny = gid => [PERM.CHANNELS, PERM.GUILD].some(p => can(gid, p));
const nextMenu = (title, items) => setTimeout(() => showMenu(title, items), 350); // после закрытия предыдущего меню
const apiErr = e => { const t = errText(e); toast(/403|Missing Permissions|50013/.test(t) ? 'Нет прав на это действие' : /50001|Missing Access/.test(t) ? 'Нет доступа' : t); };
async function act(promise, ok) { try { await promise; if (ok) toast(ok); return true; } catch (e) { apiErr(e); return false; } }
function confirmMenu(title, label, fn) { nextMenu(title, [{ label, danger: true, fn }, { label: 'Отмена', fn: () => {} }]); }
const ICON = {
  edit: '<svg class="stroke" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  plus: '<svg class="stroke" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  img: '<svg class="stroke" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  trash: '<svg class="stroke" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
  up: '<svg class="stroke" viewBox="0 0 24 24"><path d="m6 14 6-6 6 6"/></svg>',
  down: '<svg class="stroke" viewBox="0 0 24 24"><path d="m6 10 6 6 6-6"/></svg>',
  clock: '<svg class="stroke" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  topic: '<svg class="stroke" viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h9"/></svg>',
  shield: '<svg class="stroke" viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/></svg>',
  door: '<svg class="stroke" viewBox="0 0 24 24"><path d="M14 4H6v16h8"/><path d="M10 12h10m-3-3 3 3-3 3"/></svg>',
  ban: '<svg class="stroke" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/></svg>',
};

// Меню сервера: нажатие на название сервера над списком каналов
function serverMenu(gid) {
  const g = S.guilds.find(x => x.id === gid); if (!g) return;
  const items = [];
  if (can(gid, PERM.GUILD)) {
    items.push({ label: 'Сохранить название', input: 'Название сервера', value: g.name, icon: ICON.edit,
      fn: name => name && name !== g.name && act(B.api('PATCH', `/guilds/${gid}`, { name }), 'Название изменено') });
    items.push({ label: 'Сменить иконку', icon: ICON.img, fn: () => { S.iconFor = gid; $('#iconInput').click(); } });
    if (g.icon) items.push({ label: 'Убрать иконку', icon: ICON.trash, fn: () => act(B.api('PATCH', `/guilds/${gid}`, { icon: null }), 'Иконка убрана') });
  }
  if (can(gid, PERM.CHANNELS)) {
    items.push({ label: 'Новый текстовый канал', icon: ICON.plus, fn: () => createChannelMenu(gid, null, 0) });
    items.push({ label: 'Новый голосовой канал', icon: ICON.plus, fn: () => createChannelMenu(gid, null, 2) });
    items.push({ label: 'Новая категория', icon: ICON.plus, fn: () => createChannelMenu(gid, null, 4) });
  }
  if (!items.length) return toast('У вас нет прав управлять этим сервером');
  showMenu(g.name, items);
}
function createChannelMenu(gid, parent, type) {
  const what = type === 4 ? 'категории' : type === 2 ? 'голосового канала' : 'канала';
  nextMenu(`Название ${what}`, [{ label: 'Создать', input: type === 4 ? 'Новая категория' : 'новый-канал', icon: ICON.plus, fn: name => {
    if (!name) return;
    act(B.api('POST', `/guilds/${gid}/channels`, { name, type, ...(parent ? { parent_id: parent } : {}) }), type === 4 ? 'Категория создана' : 'Канал создан');
  } }]);
}
async function uploadGuildIcon(file) {
  const gid = S.iconFor; S.iconFor = null;
  if (!gid || !file) return;
  if (file.size > 10 * 1024 * 1024) return toast('Картинка больше 10 МБ');
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  act(B.api('PATCH', `/guilds/${gid}`, { icon: data }), 'Иконка сервера обновлена');
}

// Меню канала/категории: долгое нажатие в списке каналов
function channelMenu(cid) {
  const c = S.chanById.get(cid); const gid = c?.guild_id;
  if (!c || !gid || !can(gid, PERM.CHANNELS)) return;
  const isCat = c.type === 4, isText = c.type === 0 || c.type === 5;
  const items = [{ label: 'Переименовать', input: 'Название', value: c.name, icon: ICON.edit,
    fn: name => name && name !== c.name && act(B.api('PATCH', `/channels/${cid}`, { name }), 'Переименовано') }];
  if (isText) {
    items.push({ label: 'Сохранить тему', input: 'Тема канала', value: c.topic || '', icon: ICON.topic,
      fn: topic => act(B.api('PATCH', `/channels/${cid}`, { topic: topic || null }), 'Тема обновлена') });
    items.push({ label: `Медленный режим: ${slowLabel(c.rate_limit_per_user || 0)}`, icon: ICON.clock, fn: () => slowmodeMenu(c) });
  }
  if (isCat) {
    items.push({ label: 'Новый канал в категории', icon: ICON.plus, fn: () => createChannelMenu(gid, cid, 0) });
    items.push({ label: 'Новый голосовой в категории', icon: ICON.plus, fn: () => createChannelMenu(gid, cid, 2) });
  }
  items.push({ label: 'Выше', icon: ICON.up, fn: () => moveChannel(c, -1) });
  items.push({ label: 'Ниже', icon: ICON.down, fn: () => moveChannel(c, 1) });
  items.push({ label: isCat ? 'Удалить категорию' : 'Удалить канал', icon: ICON.trash, danger: true,
    fn: () => confirmMenu(`Удалить «${c.name}»? Это нельзя отменить.${isCat ? ' Каналы внутри останутся.' : ''}`, 'Удалить',
      () => act(B.api('DELETE', `/channels/${cid}`), 'Удалено')) });
  showMenu((isCat ? '' : chanIcon(c.type) + ' ') + c.name, items);
}
const SLOW = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];
const slowLabel = s => !s ? 'выкл' : s < 60 ? `${s} с` : s < 3600 ? `${s / 60} мин` : `${s / 3600} ч`;
function slowmodeMenu(c) {
  nextMenu('Медленный режим', SLOW.map(s => ({ label: (s === (c.rate_limit_per_user || 0) ? '✓ ' : '') + slowLabel(s),
    fn: () => act(B.api('PATCH', `/channels/${c.id}`, { rate_limit_per_user: s }), s ? `Медленный режим: ${slowLabel(s)}` : 'Медленный режим выключен') })));
}
// Сдвиг канала на одну позицию среди соседей (в той же категории и того же вида)
function moveChannel(c, dir) {
  const all = S.channels.get(c.guild_id) || [];
  const voiceish = x => x.type === 2 || x.type === 13;
  const sibs = all.filter(x => (c.type === 4 ? x.type === 4 : x.type !== 4 && (x.parent_id || null) === (c.parent_id || null) && voiceish(x) === voiceish(c)))
    .sort((a, b) => (a.position - b.position) || (a.id < b.id ? -1 : 1));
  const i = sibs.findIndex(x => x.id === c.id), j = i + dir;
  if (i < 0 || j < 0 || j >= sibs.length) return toast(dir < 0 ? 'Уже самый верхний' : 'Уже самый нижний');
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  const base = Math.min(...sibs.map(x => x.position));
  const body = sibs.map((x, n) => ({ id: x.id, position: base + n }));
  body.forEach(b => { const ch = S.chanById.get(b.id); if (ch) ch.position = b.position; });
  renderChannels();
  act(B.api('PATCH', `/guilds/${c.guild_id}/channels`, body));
}

// Участник: блок «Управление» в профиле (роли, тайм-аут, кик, бан)
function modSectionHTML(p) {
  const gid = p._gid;
  const u = p.user, m = p.guild_member;
  if (!gid || !m || !u || u.id === S.me?.id) return '';
  const btns = [];
  if (can(gid, PERM.ROLES)) btns.push(`<button data-mod="roles">${ICON.shield}<span>Роли</span></button>`);
  if (can(gid, PERM.MODERATE)) btns.push(`<button data-mod="timeout">${ICON.clock}<span>${m.communication_disabled_until && new Date(m.communication_disabled_until) > new Date() ? 'Тайм-аут ✓' : 'Тайм-аут'}</span></button>`);
  if (can(gid, PERM.KICK)) btns.push(`<button data-mod="kick">${ICON.door}<span>Выгнать</span></button>`);
  if (can(gid, PERM.BAN)) btns.push(`<button data-mod="ban" class="danger">${ICON.ban}<span>Забанить</span></button>`);
  if (!btns.length) return '';
  return `<div class="prof-sec prof-mod"><h4>Управление</h4><div class="mod-btns">${btns.join('')}</div></div>`;
}
async function modAction(kind) {
  const p = S.profiles.get(S.profileId); const gid = p?._gid; const u = p?.user, m = p?.guild_member;
  if (!gid || !u || !m) return;
  const name = m.nick || displayName(u);
  if (kind === 'roles') {
    const roles = await loadRoles(gid);
    const myTop = S.guilds.find(x => x.id === gid)?.owner ? Infinity
      : Math.max(0, ...(N.roles.get(gid) || []).map(r => roles.get(r)?.position || 0));
    const list = [...roles.values()].filter(r => r.id !== gid && !r.managed && r.position < myTop).sort((a, b) => b.position - a.position);
    if (!list.length) return toast('Нет ролей, которые вы можете выдать');
    showMenu(`Роли: ${name}`, list.map(r => {
      const has = (m.roles || []).includes(r.id);
      return { label: (has ? '✓ ' : '') + r.name, dot: r.color ? '#' + r.color.toString(16).padStart(6, '0') : '#99aab5', fn: async () => {
        const ok = await act(B.api(has ? 'DELETE' : 'PUT', `/guilds/${gid}/members/${u.id}/roles/${r.id}`), has ? `Роль «${r.name}» снята` : `Роль «${r.name}» выдана`);
        if (ok) { m.roles = has ? m.roles.filter(x => x !== r.id) : [...(m.roles || []), r.id]; setTimeout(() => modAction('roles'), 350); }
      } };
    }));
  } else if (kind === 'timeout') {
    const T = [[60, '1 минута'], [300, '5 минут'], [600, '10 минут'], [3600, '1 час'], [86400, '1 день'], [604800, '1 неделя']];
    const items = T.map(([s, l]) => ({ label: l, icon: ICON.clock, fn: async () => {
      const until = new Date(Date.now() + s * 1000).toISOString();
      if (await act(B.api('PATCH', `/guilds/${gid}/members/${u.id}`, { communication_disabled_until: until }), `${name}: тайм-аут на ${l}`)) { m.communication_disabled_until = until; renderProfile(); }
    } }));
    if (m.communication_disabled_until && new Date(m.communication_disabled_until) > new Date())
      items.unshift({ label: 'Снять тайм-аут', icon: ICON.clock, fn: async () => {
        if (await act(B.api('PATCH', `/guilds/${gid}/members/${u.id}`, { communication_disabled_until: null }), 'Тайм-аут снят')) { m.communication_disabled_until = null; renderProfile(); }
      } });
    showMenu(`Тайм-аут: ${name}`, items);
  } else if (kind === 'kick') {
    showMenu(`Выгнать ${name} с сервера? По приглашению сможет вернуться.`, [
      { label: 'Выгнать', danger: true, fn: async () => { if (await act(B.api('DELETE', `/guilds/${gid}/members/${u.id}`), `${name} выгнан(а)`)) closePanels(); } },
      { label: 'Отмена', fn: () => {} }]);
  } else if (kind === 'ban') {
    const ban = secs => async () => { if (await act(B.api('PUT', `/guilds/${gid}/bans/${u.id}`, { delete_message_seconds: secs }), `${name} забанен(а)`)) closePanels(); };
    showMenu(`Забанить ${name}?`, [
      { label: 'Забанить', danger: true, fn: ban(0) },
      { label: 'Забанить и удалить сообщения за сутки', danger: true, fn: ban(86400) },
      { label: 'Отмена', fn: () => {} }]);
  }
}

// ---------------- папки серверов ----------------
// Формат как в настройках Discord: [{id, name, color, guild_ids}], id == null — сервер вне папки.
const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 6a2 2 0 0 1 2-2h4.6l2 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const FOLDER_COLORS = [5793266, 15844367, 15418782, 3066993, 15105570, 10181046, 3447003, 9807270];
const folderColor = f => '#' + (f.color ?? 5793266).toString(16).padStart(6, '0');
// Итоговый порядок: новые серверы (которых нет в настройках) — сверху, как в Discord.
function railLayout() {
  const known = new Set(S.guilds.map(g => g.id));
  const seen = new Set();
  const out = [];
  for (const f of S.folders || []) {
    const ids = (f.guild_ids || []).filter(id => known.has(id) && !seen.has(id));
    ids.forEach(id => seen.add(id));
    if (ids.length) out.push({ ...f, guild_ids: ids });
  }
  const fresh = S.guilds.filter(g => !seen.has(g.id)).map(g => ({ id: null, guild_ids: [g.id] }));
  return [...fresh, ...out];
}
async function loadFolders() {
  let f = null;
  try { f = await B.guildFolders?.(); } catch {}
  S.foldersSynced = Array.isArray(f);
  S.folders = Array.isArray(f) ? f : store.get('folders', []);
  renderRail();
}
async function saveFolders(next) {
  // убираем пустые папки и сохраняем полный порядок
  S.folders = next.filter(f => f.guild_ids.length);
  store.set('folders', S.folders);
  renderRail();
  if (!S.foldersSynced) return;
  try { await B.saveFolders(S.folders.map(f => ({ id: f.id, name: f.name ?? null, color: f.color ?? null, guild_ids: f.guild_ids }))); }
  catch (e) { toast('Папки сохранены только здесь: ' + errText(e)); }
}
const newFolderId = () => Math.floor(Math.random() * 2 ** 31);
function withoutGuild(layout, gid) {
  return layout.map(f => ({ ...f, guild_ids: f.guild_ids.filter(id => id !== gid) }));
}
function guildMenu(gid) {
  const layout = railLayout();
  const g = S.guilds.find(x => x.id === gid);
  const cur = layout.find(f => f.id != null && f.guild_ids.includes(gid));
  const folders = layout.filter(f => f.id != null && f !== cur);
  const items = [
    { label: 'Новая папка', icon: FOLDER_SVG, input: 'Название папки', fn: name => {
      const L = withoutGuild(layout, gid);
      const at = layout.findIndex(f => f.guild_ids.includes(gid));
      L.splice(at, 0, { id: newFolderId(), name: name || null, color: 5793266, guild_ids: [gid] });
      S.openFolders.add(String(L[at].id)); store.set('openFolders', [...S.openFolders]);
      saveFolders(L);
    } },
    ...folders.map(f => ({ label: `В папку «${f.name || 'Без названия'}»`, dot: folderColor(f), fn: () => {
      const L = withoutGuild(layout, gid);
      L.find(x => x.id === f.id).guild_ids.push(gid);
      saveFolders(L);
    } })),
  ];
  if (cur) items.push({ label: 'Убрать из папки', fn: () => {
    const L = withoutGuild(layout, gid);
    L.splice(L.findIndex(x => x.id === cur.id) + 1, 0, { id: null, guild_ids: [gid] });
    saveFolders(L);
  } });
  showMenu(g?.name || 'Сервер', items);
}
function folderMenu(fid) {
  const layout = railLayout();
  const f = layout.find(x => String(x.id) === String(fid)); if (!f) return;
  showMenu(f.name || 'Папка', [
    { label: 'Переименовать', input: 'Название папки', value: f.name || '', fn: name => { f.name = name || null; saveFolders(layout); } },
    { colors: FOLDER_COLORS, value: f.color, fn: c => { f.color = c; saveFolders(layout); } },
    { label: 'Распустить папку', danger: true, fn: () => {
      const i = layout.indexOf(f);
      layout.splice(i, 1, ...f.guild_ids.map(id => ({ id: null, guild_ids: [id] })));
      saveFolders(layout);
    } },
  ]);
}

// Простое нижнее меню: пункты, поле ввода, палитра цветов.
let menuItems = [];
function showMenu(title, items) {
  menuItems = items;
  const m = $('#menu');
  m.querySelector('.menu-title').textContent = title;
  m.querySelector('.menu-list').innerHTML = items.map((it, i) => {
    if (it.colors) return `<div class="menu-colors">${it.colors.map(c => `<button data-mi="${i}" data-color="${c}" class="${c === it.value ? 'on' : ''}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('')}</div>`;
    if (it.input) return `<div class="menu-input"><input data-in="${i}" placeholder="${esc(it.input)}" value="${esc(it.value || '')}"><button data-mi="${i}">${esc(it.label)}</button></div>`;
    return `<button data-mi="${i}" class="menu-item${it.danger ? ' danger' : ''}">${it.dot ? `<span class="st-inline" style="background:${it.dot}"></span>` : it.icon ? it.icon : ''}<span>${esc(it.label)}</span></button>`;
  }).join('');
  pushPanel();
  m.classList.remove('hidden');
}

function renderRail() {
  const ping = id => { const n = S.pings.get(id); return n ? `<span class="ping">${n > 99 ? '99+' : n}</span>` : ''; };
  const unreadGuild = gid => [...S.unread].some(cid => (S.chanById.get(cid)?.guild_id || S.chanGuild.get(cid)) === gid);
  let h = `<button class="g${S.guildId === '@me' ? ' active' : ''}${S.dms.some(d => S.unread.has(d.id)) ? ' unread' : ''}" data-g="@me" title="Личные сообщения"><div class="g-icon" style="${S.guildId === '@me' ? '' : 'color:var(--text)'}">
    <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3C7 3 3 6.6 3 11c0 2.4 1.2 4.5 3 6v4l3.6-2.2c.8.2 1.6.2 2.4.2 5 0 9-3.6 9-8s-4-8-9-8z"/></svg></div>${ping('@me')}</button><div class="rail-sep"></div>`;
  const byId = new Map(S.guilds.map(g => [g.id, g]));
  const gIcon = g => { const icon = guildIcon(g); return icon ? `<img src="${icon}" alt="" loading="lazy">` : esc(initials(g.name)); };
  const gBtn = g => `<button class="g${S.guildId === g.id ? ' active' : ''}${unreadGuild(g.id) ? ' unread' : ''}" data-g="${g.id}" title="${esc(g.name)}"><div class="g-icon">${gIcon(g)}</div>${ping(g.id)}</button>`;
  for (const f of railLayout()) {
    const gs = f.guild_ids.map(id => byId.get(id)).filter(Boolean);
    if (!gs.length) continue;
    if (f.id == null) { h += gBtn(gs[0]); continue; }
    const open = S.openFolders.has(String(f.id));
    const col = folderColor(f);
    const has = id => gs.some(g => g.id === id);
    const pings = gs.reduce((a, g) => a + (S.pings.get(g.id) || 0), 0);
    const cls = `${has(S.guildId) && !open ? ' active' : ''}${gs.some(g => unreadGuild(g.id)) && !open ? ' unread' : ''}`;
    if (!open) {
      h += `<button class="g folder${cls}" data-folder="${f.id}" title="${esc(f.name || 'Папка')}"><div class="g-icon folder-mini" style="--fc:${col}">${gs.slice(0, 4).map(g => `<span>${gIcon(g)}</span>`).join('')}</div>${pings ? `<span class="ping">${pings > 99 ? '99+' : pings}</span>` : ''}</button>`;
    } else {
      h += `<div class="folder-open" style="--fc:${col}"><button class="g folder" data-folder="${f.id}" title="${esc(f.name || 'Папка')}"><div class="g-icon folder-head">${FOLDER_SVG}</div></button>${gs.map(gBtn).join('')}</div>`;
    }
  }
  $('#guildRail').innerHTML = h;
  const total = [...S.pings.values()].reduce((a, b) => a + b, 0);
  const badge = $('#unreadBadge');
  badge.textContent = total > 99 ? '99+' : total;
  badge.classList.toggle('hidden', !total);
}

const TEXT_TYPES = new Set([0, 5, 1, 3]);
const chanIcon = t => ({ 0: '#', 5: '📢', 2: '🔊', 13: '🎙', 15: '💬', 16: '🖼' }[t] || '#');

// ---------------- статусы ----------------
const STATUS_NAMES = { online: 'В сети', idle: 'Отошёл', dnd: 'Не беспокоить', invisible: 'Невидимый', offline: 'Не в сети' };
// Discord не раскрывает «невидимый» другим: такой человек приходит как offline.
function statusOf(uid) {
  if (uid && uid === S.me?.id) return S.myStatus || 'online';
  return S.presence.get(uid) || (S.presenceLoaded && !S.me?.is_bot_session ? 'offline' : '');
}
function dotHTML(uid, extra = '') {
  const st = statusOf(uid);
  return st ? `<span class="status-dot ${st === 'invisible' ? 'offline' : st}${extra}" title="${STATUS_NAMES[st]}"></span>` : '';
}
function statusLine(uid) {
  const st = statusOf(uid); if (!st) return '';
  const act = activityText(S.acts.get(uid));
  return `<span class="st-inline ${st === 'invisible' ? 'offline' : st}"></span><b>${STATUS_NAMES[st]}</b>${act ? `<span class="dot">•</span>${esc(act)}` : ''}`;
}
let presTimer = 0;
function onPresences(list) {
  for (const p of list) { S.presence.set(p.id, p.status); S.acts.set(p.id, p.activities || []); }
  S.presenceLoaded = true;
  clearTimeout(presTimer);
  presTimer = setTimeout(() => {
    if (S.guildId === '@me') renderChannels();
    renderHeaderStatus();
    if (sideOpen('profile') && S.profileId) renderProfile();
  }, 150);
}
function renderHeaderStatus() {
  const el = $('#chatStatus');
  const ch = S.chanById.get(S.channelId);
  const uid = ch?.type === 1 ? ch.recipients?.[0]?.id : null;
  const st = uid ? statusOf(uid) : '';
  el.className = st ? 'st-inline ' + (st === 'invisible' ? 'offline' : st) : 'hidden';
  el.title = st ? STATUS_NAMES[st] : '';
}
async function setMyStatus(st) {
  const prev = S.myStatus;
  S.myStatus = st; store.set('myStatus', st);
  renderUser(); closeStatusMenu();
  try { await B.setStatus(st); toast('Статус: ' + STATUS_NAMES[st]); }
  catch (e) { S.myStatus = prev; renderUser(); toast('Статус не изменён: ' + errText(e)); }
}
function openStatusMenu() {
  const m = $('#statusMenu');
  m.innerHTML = ['online', 'idle', 'dnd', 'invisible'].map(s =>
    `<button data-st="${s}"${s === (S.myStatus || 'online') ? ' class="on"' : ''}><span class="st-inline ${s === 'invisible' ? 'offline' : s}"></span><span>${STATUS_NAMES[s]}</span>${s === 'invisible' ? '<small>Для других вы «не в сети»</small>' : s === 'dnd' ? '<small>Без уведомлений на ПК</small>' : ''}</button>`).join('');
  m.classList.remove('hidden');
}
function closeStatusMenu() { $('#statusMenu').classList.add('hidden'); }

// Иконка группы: своя картинка группы, иначе — аватарки двух участников внахлёст (как в Discord).
const GROUP_SVG = '<svg class="stroke grp-ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2"/></svg>';
function groupIconHTML(c) {
  if (c.icon) return `<img class="dm-av" src="https://cdn.discordapp.com/channel-icons/${c.id}/${c.icon}.webp?size=64" alt="">`;
  const people = (c.recipients || []).slice(0, 2);
  if (people.length >= 2) return `<span class="dm-av grp-av"><img src="${avatar(people[0])}" alt=""><img src="${avatar(people[1])}" alt=""></span>`;
  if (people.length === 1) return `<img class="dm-av" src="${avatar(people[0])}" alt="">`;
  return `<span class="dm-av grp-empty">${GROUP_SVG}</span>`;
}

function renderChannels() {
  const box = $('#channelList');
  if (S.guildId === '@me') {
    $('#guildName').textContent = 'Личные сообщения';
    const sorted = [...S.dms].sort((a, b) => (BigInt(b.last_message_id || 0) > BigInt(a.last_message_id || 0) ? 1 : -1));
    box.innerHTML = sorted.length ? sorted.map(c => {
      const u = c.recipients?.[0];
      const img = c.type === 1 ? `<span class="dm-av-wrap"><img class="dm-av" src="${avatar(u)}" alt="">${dotHTML(u?.id)}</span>` : groupIconHTML(c);
      const sub = c.type === 1 ? activityText(S.acts.get(u?.id)) : '';
      return `<button class="ch dm${c.id === S.channelId ? ' active' : ''}${S.unread.has(c.id) ? ' unread' : ''}" data-c="${c.id}">${img}<span class="nm">${esc(chanTitle(c))}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
    }).join('') : '<div class="empty">Нет личных сообщений</div>';
    return;
  }
  const g = S.guilds.find(x => x.id === S.guildId);
  $('#guildName').innerHTML = esc(g?.name || '') + (canManageAny(S.guildId) ? ' <span class="gh-more">▾</span>' : '');
  const all = S.channels.get(S.guildId);
  if (!all) { box.innerHTML = '<div class="empty">Загрузка…</div>'; return; }
  const visible = all.filter(c => c.type !== 4 && c.type !== 11 && c.type !== 12 && c.type !== 10);
  const byPos = (a, b) => ((a.type === 2 || a.type === 13) - (b.type === 2 || b.type === 13)) || (a.position - b.position) || (a.id < b.id ? -1 : 1);
  const cats = all.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
  const item = c => {
    const voice = c.type === 2 || c.type === 13 || c.type === 15 || c.type === 16;
    const vc = c.type === 2 || c.type === 13;
    return `<button class="ch${voice ? ' voice' : ''}${c.id === S.channelId ? ' active' : ''}${S.unread.has(c.id) ? ' unread' : ''}" data-c="${c.id}"${voice ? ` data-voice="${vc ? 'vc' : 'forum'}"` : ''}><span class="ic">${chanIcon(c.type)}</span><span class="nm">${esc(c.name)}</span></button>${vc ? voiceUsersHTML(S.guildId, c.id) : ''}`;
  };
  let h = visible.filter(c => !c.parent_id).sort(byPos).map(item).join('');
  for (const cat of cats) {
    const kids = visible.filter(c => c.parent_id === cat.id).sort(byPos);
    if (!kids.length) continue;
    const col = S.collapsed.has(cat.id);
    h += `<button class="cat${col ? ' collapsed' : ''}" data-cat="${cat.id}"><span class="arr">▼</span><span class="cat-nm">${esc(cat.name)}</span></button>`;
    h += kids.filter(c => !col || c.id === S.channelId || S.unread.has(c.id)).map(item).join('');
  }
  box.innerHTML = h;
}

function renderUser() {
  const u = S.me;
  const canSet = !u.is_bot_session;
  $('#userPanel').innerHTML = `<button id="myStatusBtn" class="me-btn"${canSet ? '' : ' disabled'}><span class="dm-av-wrap"><img src="${avatar(u)}" alt="">${dotHTML(u.id)}</span><div class="who"><b>${esc(displayName(u))}</b><span>${canSet ? esc(STATUS_NAMES[S.myStatus || 'online']) : esc(u.username)}${B?.demo ? ' · демо' : ''}</span></div></button>${window.PcNotify ? `<button id="notifBtn" aria-label="Уведомления">${N.mode === 'pocketcord' ? BELL_SVG : BELL_OFF_SVG}</button>` : ''}<button id="setBtn" aria-label="Настройки">${GEAR_SVG}</button>`;
}

// Как на ПК: нажатие на сервер сразу открывает его последний канал (панель остаётся открытой).
async function selectGuild(gid) {
  S.guildId = gid;
  store.set('lastGuild', gid);
  renderRail(); renderChannels();
  needVoiceNames(gid);
  if (gid !== '@me' && !S.channels.has(gid)) {
    try {
      const list = await B.channels(gid);
      list.forEach(c => { c.guild_id = gid; S.chanById.set(c.id, c); });
      S.channels.set(gid, list);
    } catch (e) { toast('Каналы: ' + errText(e)); S.channels.set(gid, []); }
    if (S.guildId === gid) renderChannels();
  }
  if (S.guildId !== gid) return;
  const want = S.lastChannel[gid];
  const list = gid === '@me' ? S.dms : (S.channels.get(gid) || []);
  const fallback = gid === '@me' ? null : list.filter(c => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position)[0];
  const target = list.find(c => c.id === want) || fallback;
  if (target && target.id !== S.channelId) openChannel(target.id, { closeDrawer: false });
}

async function openChannel(cid, { closeDrawer = true, around = null } = {}) {
  const ch = S.chanById.get(cid);
  if (!ch) return;
  const changed = S.channelId !== cid;
  if (changed && S.channelId) saveDraft(S.channelId);
  S.channelId = cid;
  S.lastChannel[ch.guild_id || '@me'] = cid; store.set('lastChannel', S.lastChannel);
  store.set('lastGuild', ch.guild_id || '@me');
  markSeen(cid);
  clearNotify(cid);
  $('#channelName').textContent = chanTitle(ch);
  if (ch.type === 3) $('.chat-title .hash').innerHTML = GROUP_SVG;
  else $('.chat-title .hash').textContent = ch.type === 1 ? '@' : chanIcon(ch.type);
  $('#channelTopic').textContent = ch.topic || '';
  $('#input').placeholder = `Написать ${ch.type === 1 ? '@' : ch.type === 3 ? '' : '#'}${chanTitle(ch)}`;
  renderChannels(); renderRail(); renderTyping();
  const isDm = ch.type === 1 || ch.type === 3;
  $('#callBtn').classList.toggle('hidden', !isDm);
  $('#membersBtn').classList.toggle('hidden', !ch.guild_id);
  renderHeaderStatus();
  if (changed && sideOpen('members')) { if (ch.guild_id) loadMembers(); else closePanels(); }
  if (changed) {
    cancelReply(); clearFiles(); hideAc();
    loadDraft(cid);
    S.search = { q: '', results: [], total: 0, loading: false, error: '' };
    if (S.side === 'search' && sideOpen()) { $('#sideBody').innerHTML = ''; renderSearch(); }
    if (sideOpen('pins')) renderPins();
    if (sideOpen('profile') && ch.type === 1) openProfile(ch.recipients?.[0]?.id, { push: false });
  }
  // на широком экране в ЛС профиль собеседника открыт сразу, как на ПК
  if (wide() && ch.type === 1 && !sideOpen()) openProfile(ch.recipients?.[0]?.id, { push: false });
  if (closeDrawer && !wide()) closePanels();

  if (around) {
    S.detached = true;
    $('#msgInner').innerHTML = '<div class="loader-top">Загрузка…</div>';
    try {
      const page = (await B.messages(cid, { around })).reverse();
      S.msgs.set(cid, page); S.hasMore.set(cid, page.length >= 49);
    } catch (e) { toast(errText(e)); }
    renderMessages();
    flashMessage(around);
    return;
  }
  if (S.detached && changed) { S.detached = false; S.msgs.delete(cid); }
  if (S.msgs.has(cid)) { renderMessages(); scrollBottom(); }
  else {
    $('#msgInner').innerHTML = '<div class="loader-top">Загрузка…</div>';
    try {
      const page = (await B.messages(cid)).reverse();
      S.msgs.set(cid, page); S.hasMore.set(cid, page.length >= 50);
    } catch (e) {
      S.msgs.delete(cid);
      $('#msgInner').innerHTML = `<div class="empty"><span class="big">🔒</span>${esc(errText(e).includes('403') ? 'Нет доступа к этому каналу' : errText(e))}</div>`;
      return;
    }
    if (S.channelId !== cid) return;
    renderMessages(); scrollBottom();
  }
  prefetchPins(cid);
  scheduleAck();
}

async function loadOlder() {
  const cid = S.channelId;
  const list = S.msgs.get(cid);
  if (S.loadingOlder || !list?.length || !S.hasMore.get(cid)) return;
  S.loadingOlder = true;
  try {
    const page = (await B.messages(cid, { before: list[0].id })).reverse();
    if (S.channelId !== cid) return;
    list.unshift(...page);
    S.hasMore.set(cid, page.length >= 50);
    renderMessages();
  } catch (e) { toast(errText(e)); }
  finally { S.loadingOlder = false; }
}

function flashMessage(id) {
  const el = $(`#msgInner .m[data-id="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  return true;
}

// ---------------- правая панель: закреплённые / поиск / профиль ----------------
const PIN_SVG = $('#pinsBtn svg').outerHTML;
const SEARCH_SVG = $('#searchBtn svg').outerHTML;
S.side = null;          // 'pins' | 'search' | 'profile'
S.profileId = null;
S.search = { q: '', results: [], total: 0, loading: false, error: '' };

function openSide(mode, { push = true } = {}) {
  if (!S.channelId && mode !== 'profile') return;
  if (push) pushPanel();
  if (!wide()) { $('#input').blur(); hideAc(); } // клавиатура не должна висеть поверх панели
  S.side = mode;
  $('#app').classList.add('side-open');
  $('#app').classList.remove('drawer-open');
  renderSide();
  if (mode === 'pins') prefetchPins(S.channelId);
  if (mode === 'search') setTimeout(() => $('#searchInput')?.focus({ preventScroll: true }), 250);
}
const sideOpen = m => $('#app').classList.contains('side-open') && (!m || S.side === m);
function toggleSide(mode) { sideOpen(mode) ? closePanels() : openSide(mode); }

function renderSide() {
  const panel = $('#sidePanel');
  panel.classList.toggle('profile-mode', S.side === 'profile');
  ['pins', 'search', 'members'].forEach(m => $(`#${m}Btn`).classList.toggle('on', sideOpen(m)));
  if (S.side === 'members') { $('#sideIcon').innerHTML = $('#membersBtn svg').outerHTML; $('#sideTitle').textContent = 'Участники'; renderMembers(); }
  if (S.side === 'pins') { $('#sideIcon').innerHTML = PIN_SVG; $('#sideTitle').textContent = 'Закреплённые сообщения'; renderPins(); }
  if (S.side === 'search') { $('#sideIcon').innerHTML = SEARCH_SVG; $('#sideTitle').textContent = 'Поиск'; renderSearch(); }
  if (S.side === 'profile') renderProfile();
}
function openMembers() { openSide('members'); loadMembers(); }

const normPins = r => Array.isArray(r) ? r : (r?.items || []).map(i => i.message);

async function prefetchPins(cid) {
  try {
    const p = normPins(await B.pins(cid));
    S.pins.set(cid, p);
    if (cid === S.channelId) updatePinBtn();
    if (sideOpen('pins') && cid === S.channelId) renderPins();
  } catch { S.pins.delete(cid); }
}
function updatePinBtn() {
  const n = S.pins.get(S.channelId)?.length || 0;
  $('#pinsBtn').classList.toggle('has-pins', n > 0);
  $('#pinsBtn').title = n ? `Закреплённые: ${n}` : 'Закреплённые';
}
const cardHTML = (m, actions, where = '') => `<div class="pin" data-pin="${m.id}">${where}${msgHTML(m, null, { forceHead: true })}<div class="pin-actions">${actions}</div></div>`;
function renderPins() {
  if (S.side !== 'pins') return;
  const list = S.pins.get(S.channelId);
  const box = $('#sideBody');
  if (!list) { box.innerHTML = '<div class="empty">Загрузка…</div>'; return; }
  if (!list.length) { box.innerHTML = '<div class="empty"><span class="big">📌</span>В этом канале пока нет закреплённых сообщений.</div>'; return; }
  box.innerHTML = list.map(m => cardHTML(m, `<button class="unpin" data-unpin="${m.id}">Открепить</button><button class="jump" data-jumpto="${m.id}" data-chan="${m.channel_id}">Перейти</button>`)).join('');
}
function openPins() { openSide('pins'); }

// --- поиск ---
function searchScope() {
  const ch = S.chanById.get(S.channelId);
  return ch?.guild_id ? { guildId: ch.guild_id } : { channelId: S.channelId };
}
function renderSearch() {
  if (S.side !== 'search') return;
  const box = $('#sideBody');
  const ch = S.chanById.get(S.channelId);
  const where = ch?.guild_id ? (S.guilds.find(g => g.id === ch.guild_id)?.name || 'сервер') : chanTitle(ch || {});
  const st = S.search;
  if (!box.querySelector('#searchInput')) {
    box.innerHTML = `<div class="search-box"><input id="searchInput" type="search" enterkeyhint="search" placeholder="Искать «${esc(where)}»"></div><div id="searchRes"></div>`;
    box.querySelector('#searchInput').value = st.q;
  }
  let h = '';
  if (st.error) h = `<div class="empty">${esc(st.error)}</div>`;
  else if (st.loading && !st.results.length) h = '<div class="empty">Ищем…</div>';
  else if (st.q && !st.results.length) h = '<div class="empty"><span class="big">🔍</span>Ничего не найдено</div>';
  else if (!st.q) h = '<div class="empty">Введите текст и нажмите «Найти» на клавиатуре.<br>Поиск идёт по всему серверу, как на ПК.</div>';
  else {
    h = `<div class="search-meta">Результатов: ${st.total}</div>` + st.results.map(m => {
      const c = S.chanById.get(m.channel_id);
      const label = c && c.guild_id ? `<div class="where">#${esc(c.name)}</div>` : '';
      return cardHTML(m, `<button class="jump" data-jumpto="${m.id}" data-chan="${m.channel_id}">Перейти</button>`, label);
    }).join('');
    if (st.results.length < st.total) h += `<button class="more-btn" id="searchMore">${st.loading ? 'Загрузка…' : 'Показать ещё'}</button>`;
  }
  box.querySelector('#searchRes').innerHTML = h;
}
async function runSearch(more = false) {
  const st = S.search;
  if (!st.q.trim() || st.loading) return;
  if (!more) { st.results = []; st.total = 0; }
  st.loading = true; st.error = ''; renderSearch();
  try {
    const r = await B.search(searchScope(), st.q, more ? st.results.length : undefined);
    if (!r?.messages) { st.error = r?.message?.includes('index') || r?.code === 110000 ? 'Discord ещё индексирует канал — повторите через пару секунд' : 'Поиск недоступен'; }
    else {
      // каждый результат — массив, нужное сообщение помечено hit или стоит первым
      st.results.push(...r.messages.map(arr => arr.find(x => x.hit) || arr[0]));
      st.total = r.total_results ?? st.results.length;
    }
  } catch (e) {
    st.error = errText(e).includes('403') || errText(e).includes('401') ? 'Поиск доступен только при входе пользовательским токеном (у ботов его нет).' : errText(e);
  }
  st.loading = false; renderSearch();
}

// --- профиль ---
const snowDate = id => { try { return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)); } catch { return null; } };
const fmtDate = d => d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function dmPartner() {
  const ch = S.chanById.get(S.channelId);
  return ch?.type === 1 ? ch.recipients?.[0] : null;
}
async function openProfile(uid, opts) {
  if (!uid) return;
  S.profileId = uid;
  openSide('profile', opts);
  // сервер, в контексте которого открыт профиль (роли, «Управление»): явно переданный или текущего канала
  const gid = opts?.gid || S.chanById.get(S.channelId)?.guild_id;
  // профиль на этом сервере уже есть (с ролями именно этого сервера)
  if (S.profiles.has(uid) && (S.profiles.get(uid)._gid === gid || S.profiles.get(uid).error)) return;
  const known = S.users.get(uid) || S.dms.map(d => d.recipients?.[0]).find(u => u?.id === uid);
  if (known && !S.profiles.has(uid)) S.profiles.set(uid, { user: known, _partial: true });
  renderSide();
  try {
    const p = await B.profile(uid, gid);
    if (p) p._gid = gid;
    S.profiles.set(uid, p);
  } catch (e) { if (!known) S.profiles.set(uid, { error: errText(e) }); }
  if (S.side === 'profile' && S.profileId === uid) renderSide();
}
function renderProfile() {
  const box = $('#sideBody');
  const p = S.profiles.get(S.profileId);
  const closeBtn = '<button class="icon-btn" id="profClose" aria-label="Закрыть">✕</button>';
  if (!p) { box.innerHTML = `<div class="prof"><div class="prof-banner">${closeBtn}</div><div class="empty">Загрузка…</div></div>`; return; }
  if (p.error) { box.innerHTML = `<div class="prof"><div class="prof-banner">${closeBtn}</div><div class="empty">${esc(p.error)}</div></div>`; return; }
  const u = p.user || {};
  const up = p.user_profile || {};
  const hex = n => n != null ? '#' + Number(n).toString(16).padStart(6, '0') : null;
  const accent = hex(up.accent_color ?? u.accent_color) || u._c || '#5865f2';
  const themeBg = up.theme_colors?.[0] != null ? hex(up.theme_colors[0]) : null;
  const banner = u.banner ? `background-image:url(https://cdn.discordapp.com/banners/${u.id}/${u.banner}.${u.banner.startsWith('a_') ? 'gif' : 'webp'}?size=600)` : '';
  const bio = up.bio ?? u.bio ?? '';
  const member = p.guild_member;
  const mutualG = p.mutual_guilds?.length || 0;
  const mutualF = p.mutual_friends_count ?? p.mutual_friends?.length ?? 0;
  const friendAvs = (p.mutual_friends || []).slice(0, 3).map(f => `<img src="${avatar(f)}" alt="">`).join('');
  const mutual = [
    mutualF ? `${mutualF} ${plural(mutualF, 'общий друг', 'общих друга', 'общих друзей')}` : '',
    mutualG ? `${mutualG} ${plural(mutualG, 'общий сервер', 'общих сервера', 'общих серверов')}` : '',
  ].filter(Boolean).join(' • ');
  const accs = (p.connected_accounts || []).slice(0, 6).map(a => `<div class="prof-acc"><span>🔗</span><b>${esc(a.name)}</b><span style="color:var(--muted)">${esc(a.type)}</span></div>`).join('');
  const badges = (p.badges || []).map(b => `<img src="https://cdn.discordapp.com/badge-icons/${b.icon}.png" alt="" title="${esc(b.description || '')}">`).join('');
  const deco = u.avatar_decoration_data?.asset ? `<img class="prof-av-deco" src="https://cdn.discordapp.com/avatar-decoration-presets/${u.avatar_decoration_data.asset}.png?size=160&passthrough=true" alt="">` : '';
  const sub = [esc(u.username || ''), up.pronouns ? esc(up.pronouns) : ''].filter(Boolean).join('<span class="dot">•</span>');
  box.innerHTML = `<div class="prof" style="${themeBg ? `--prof-bg:${themeBg};` : ''}--prof-accent:${accent}">
    <div class="prof-banner" style="${banner}">
      <div class="prof-top-btns">
        <button id="profFull2" aria-label="Открыть в Discord"><svg class="stroke" viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg></button>
        <button id="profClose" aria-label="Закрыть"><svg class="stroke" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
    </div>
    <div class="prof-av-wrap"><img class="prof-av" src="${avatar(u)}" alt="">${deco}${dotHTML(u.id)}</div>
    <div class="prof-main">
      <div class="prof-name">${esc(member?.nick || displayName(u))}${u.bot ? '<span class="tag" style="background:var(--blurple);color:#fff;font-size:10px;padding:1px 4px;border-radius:3px">БОТ</span>' : ''}</div>
      <div class="prof-user">${sub}${guildTagHTML(u)}</div>
      ${statusOf(u.id) ? `<div class="prof-status">${statusLine(u.id)}</div>` : ''}
      ${badges ? `<div class="badges">${badges}</div>` : ''}
      ${mutual ? `<div class="prof-mutual">${friendAvs ? `<span class="mini-avs">${friendAvs}</span>` : ''}${mutual}</div>` : ''}
      ${bio ? `<div class="prof-sec"><h4>Обо мне</h4><div class="body" style="font-size:14px">${md(bio)}</div></div>` : ''}
      <div class="prof-sec"><h4>В числе участников с</h4>${fmtDate(snowDate(u.id))}</div>
      ${member?.joined_at ? `<div class="prof-sec"><h4>На сервере с</h4>${fmtDate(new Date(member.joined_at))}</div>` : ''}
      ${accs ? `<div class="prof-sec"><h4>Подключения</h4>${accs}</div>` : ''}
      ${p._partial ? '<div class="prof-mutual">Загрузка профиля…</div>' : ''}
    </div>
    ${modSectionHTML(p)}
    <div class="prof-foot"><button id="profFull">Полный профиль</button></div>
  </div>`;
}

// --- участники сервера ---
async function loadRoles(gid) {
  if (S.roles.has(gid)) return S.roles.get(gid);
  const m = new Map(); S.roles.set(gid, m);
  try { const g = await B.guildInfo(gid); (g?.roles || []).forEach(r => m.set(r.id, r)); } catch {}
  return m;
}
function roleColor(ids, roles) {
  const r = (ids || []).map(id => roles.get(id)).filter(r => r && r.color).sort((a, b) => b.position - a.position)[0];
  return r ? '#' + r.color.toString(16).padStart(6, '0') : '';
}
function activityText(acts) {
  for (const a of acts || []) {
    if (a.type === 4 && (a.state || a.emoji)) return `${a.emoji && !a.emoji.id ? a.emoji.name + ' ' : ''}${a.state || ''}`.trim();
    if (a.type === 0) return 'Играет в ' + a.name;
    if (a.type === 2) return '♫ ' + (a.details || a.name);
    if (a.type === 3) return 'Смотрит ' + a.name;
    if (a.type === 1) return 'Стримит ' + (a.details || a.name);
  }
  return '';
}
// Для ботов: REST-список без статусов, группируем по «отдельно отображаемым» ролям
function groupMembers(list, roles) {
  const hoisted = [...roles.values()].filter(r => r.hoist).sort((a, b) => b.position - a.position);
  const buckets = new Map();
  for (const m of list) {
    const top = hoisted.find(r => m.roles?.includes(r.id));
    const k = top ? top.id : 'all';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(m);
  }
  const items = [];
  for (const k of [...hoisted.map(r => r.id), 'all']) {
    const ms = buckets.get(k); if (!ms) continue;
    items.push({ group: { id: k, count: ms.length } });
    ms.sort((a, b) => (a.nick || displayName(a.user)).localeCompare(b.nick || displayName(b.user))).forEach(m => items.push({ member: m }));
  }
  return items;
}
async function loadMembers() {
  const ch = S.chanById.get(S.channelId);
  const gid = ch?.guild_id; if (!gid) return;
  const prev = S.members.get(gid);
  if (!prev || prev.cid !== ch.id) S.members.set(gid, { cid: ch.id, items: [], loading: true, error: '' });
  renderMembers();
  await loadRoles(gid);
  const st = S.members.get(gid);
  if (S.me?.is_bot_session) {
    try { st.items = groupMembers(await B.guildMembers(gid), S.roles.get(gid)); }
    catch (e) { st.error = /40[13]/.test(errText(e)) ? 'Чтобы бот видел участников, включите «Server Members Intent» на странице «Бот» в портале разработчика.' : errText(e); }
    st.loading = false; renderMembers(); return;
  }
  try { await B.subscribeMembers(gid, ch.id); }
  catch (e) { st.error = errText(e); st.loading = false; renderMembers(); return; }
  setTimeout(() => { if (st.loading && !st.items.length) { st.loading = false; st.error = 'Discord не прислал список участников. Попробуйте открыть ещё раз.'; renderMembers(); } }, 8000);
}
function renderMembers() {
  if (S.side !== 'members') return;
  const gid = S.chanById.get(S.channelId)?.guild_id;
  const st = S.members.get(gid), roles = S.roles.get(gid) || new Map();
  const box = $('#sideBody');
  if (!st || (st.loading && !st.items.length)) { box.innerHTML = '<div class="empty">Загрузка участников…</div>'; return; }
  if (st.error && !st.items.length) { box.innerHTML = `<div class="empty">${esc(st.error)}</div>`; return; }
  box.innerHTML = st.items.map(it => {
    if (it.group) {
      const id = it.group.id;
      const name = id === 'online' ? 'В сети' : id === 'offline' ? 'Не в сети' : id === 'all' ? 'Участники' : (roles.get(id)?.name || 'Роль');
      return `<div class="mem-group">${esc(name)} — ${it.group.count}</div>`;
    }
    const m = it.member; if (!m?.user) return '';
    const u = m.user;
    S.users.set(u.id, { ...u, member: m });
    const status = m.presence?.status || (st.items.some(x => x.group?.id === 'offline') ? 'offline' : '');
    if (m.presence) { S.presence.set(u.id, m.presence.status); S.acts.set(u.id, m.presence.activities || []); }
    const color = roleColor(m.roles, roles);
    const act = activityText(m.presence?.activities);
    return `<button class="mem${status === 'offline' ? ' offline' : ''}" data-uid="${u.id}">
      <div class="mem-av"><img src="${avatar(u)}" alt="" loading="lazy">${status ? `<span class="status-dot ${status}"></span>` : ''}</div>
      <div class="mem-txt"><div class="mem-name"><span${color ? ` style="color:${color}"` : ''}>${esc(m.nick || displayName(u))}</span>${u.bot ? '<span class="tag">БОТ</span>' : ''}${guildTagHTML(u)}</div>
      ${act ? `<div class="mem-act">${esc(act)}</div>` : ''}</div></button>`;
  }).join('');
}
function onMemberList(d) {
  const st = S.members.get(d.guild_id);
  if (!st) return;
  st.items ||= [];
  for (const op of d.ops || []) {
    if (op.op === 'SYNC') { const [a, b] = op.range; while (st.items.length < a) st.items.push({}); st.items.splice(a, b - a + 1, ...(op.items || [])); }
    else if (op.op === 'INSERT') st.items.splice(op.index, 0, op.item);
    else if (op.op === 'UPDATE') st.items[op.index] = op.item;
    else if (op.op === 'DELETE') st.items.splice(op.index, 1);
    else if (op.op === 'INVALIDATE') { const [a, b] = op.range; st.items.splice(a, b - a + 1); }
  }
  st.loading = false; st.error = '';
  if (sideOpen('members') && S.chanById.get(S.channelId)?.guild_id === d.guild_id) renderMembers();
}

// --- связь с официальным Discord ---
function openExternal(url) {
  if (B?.openUrl) B.openUrl(url).catch(e => toast('Не удалось открыть: ' + errText(e)));
  else window.open(url, '_blank', 'noopener');
}
function channelLink(cid = S.channelId, mid) {
  const ch = S.chanById.get(cid);
  return `https://discord.com/channels/${ch?.guild_id || '@me'}/${cid}${mid ? '/' + mid : ''}`;
}
function startCall() {
  openExternal(channelLink());
  toast('Открываю этот чат в официальном Discord — нажмите там 📞');
}

// --- отметки «прочитано» (синхронизация с официальным клиентом) ---
let ackTimer = null;
function scheduleAck() {
  clearTimeout(ackTimer);
  const cid = S.channelId;
  ackTimer = setTimeout(() => {
    if (cid !== S.channelId || document.visibilityState !== 'visible' || S.detached) return;
    const last = [...(S.msgs.get(cid) || [])].reverse().find(m => !m._pending && !m._failed);
    if (last && B.ack && S.acked.get(cid) !== last.id) { S.acked.set(cid, last.id); B.ack(cid, last.id).catch(() => {}); }
  }, 1200);
}

// ---------------- панели / история (кнопка «назад» на Android) ----------------
// Одна запись в истории на «открыта любая панель», чтобы «назад» её закрывал.
let panelPushed = false, ignorePop = false;
const OVERLAYS = ['#sheet', '#lightbox', '#picker', '#menu', '#settings'];
const anyOpen = () => { const a = $('#app'); return a.classList.contains('drawer-open') || a.classList.contains('side-open') || OVERLAYS.some(s => !$(s).classList.contains('hidden')); };
function pushPanel() { if (!wide() && !panelPushed && !anyOpen()) { history.pushState({ panel: 1 }, ''); panelPushed = true; } }
// Меню поверх панели каналов: закрываем только его, панель остаётся открытой.
function closeMenu() { $('#menu').classList.add('hidden'); if (!anyOpen() && panelPushed) closePanels(); }
function closePanels(fromPop = false) {
  // «назад», когда открыто меню поверх панели каналов, закрывает только меню
  if (fromPop && !$('#menu').classList.contains('hidden') && $('#app').classList.contains('drawer-open')) {
    $('#menu').classList.add('hidden'); history.pushState({ panel: 1 }, ''); return;
  }
  $('#app').classList.remove('drawer-open', 'side-open');
  OVERLAYS.forEach(s => $(s).classList.add('hidden'));
  ['pins', 'search', 'members'].forEach(m => $(`#${m}Btn`).classList.remove('on'));
  if (panelPushed) { panelPushed = false; if (!fromPop) { ignorePop = true; history.back(); } }
}
function openDrawer() { if (wide()) return; $('#input').blur(); hideAc(); pushPanel(); $('#app').classList.add('drawer-open'); $('#app').classList.remove('side-open'); }
addEventListener('popstate', () => { if (ignorePop) { ignorePop = false; return; } closePanels(true); });

// ---------------- просмотр фото: щипок, двойной тап, перетаскивание ----------------
const LB = { s: 1, x: 0, y: 0, pts: new Map(), start: null, lastTap: 0, moved: false };
function openLightbox(src) {
  const img = $('#lightbox img');
  img.src = src;
  Object.assign(LB, { s: 1, x: 0, y: 0, moved: false }); LB.pts.clear();
  lbApply(false);
  pushPanel();
  $('#lightbox').classList.remove('hidden');
}
function lbClamp() {
  const img = $('#lightbox img');
  LB.s = Math.min(6, Math.max(1, LB.s));
  const mx = Math.max(0, (img.offsetWidth * LB.s - innerWidth) / 2);
  const my = Math.max(0, (img.offsetHeight * LB.s - innerHeight) / 2);
  LB.x = Math.min(mx, Math.max(-mx, LB.x));
  LB.y = Math.min(my, Math.max(-my, LB.y));
}
function lbApply(anim) {
  const img = $('#lightbox img');
  img.style.transition = anim ? 'transform .2s ease-out' : 'none';
  img.style.transform = `translate(${LB.x}px, ${LB.y}px) scale(${LB.s})`;
}
// масштаб s1 вокруг точки экрана (px, py): точка под пальцем остаётся на месте
function lbZoomAt(s1, px, py) {
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const k = s1 / LB.s;
  LB.x = px - cx - (px - cx - LB.x) * k;
  LB.y = py - cy - (py - cy - LB.y) * k;
  LB.s = s1;
}
function bindLightbox() {
  const lb = $('#lightbox');
  lb.addEventListener('pointerdown', e => {
    if (e.target.closest('.lb-close')) return;
    lb.setPointerCapture?.(e.pointerId);
    LB.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    LB.moved = false;
    if (LB.pts.size === 2) {
      const [a, b] = [...LB.pts.values()];
      LB.start = { d: Math.hypot(a.x - b.x, a.y - b.y), s: LB.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x: LB.x, y: LB.y };
    } else LB.start = { px: e.clientX, py: e.clientY, x: LB.x, y: LB.y };
  });
  lb.addEventListener('pointermove', e => {
    if (!LB.pts.has(e.pointerId)) return;
    LB.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = LB.start; if (!st) return;
    if (LB.pts.size >= 2 && st.d) {
      const [a, b] = [...LB.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      Object.assign(LB, { s: st.s, x: st.x + (mx - st.mx), y: st.y + (my - st.my) });
      lbZoomAt(Math.min(6, Math.max(0.8, st.s * d / st.d)), mx, my);
      LB.moved = true;
    } else if (LB.pts.size === 1 && st.px != null) {
      const dx = e.clientX - st.px, dy = e.clientY - st.py;
      if (Math.hypot(dx, dy) > 8) LB.moved = true;
      if (LB.s > 1) { LB.x = st.x + dx; LB.y = st.y + dy; lbClamp(); }
    }
    lbApply(false);
  });
  const up = e => {
    if (!LB.pts.delete(e.pointerId)) return;
    if (LB.pts.size === 1) { // один палец остался — продолжаем перетаскивать от него
      const p = [...LB.pts.values()][0];
      LB.start = { px: p.x, py: p.y, x: LB.x, y: LB.y }; return;
    }
    if (LB.pts.size) return;
    if (LB.s < 1.05) { LB.s = 1; LB.x = 0; LB.y = 0; } else lbClamp();
    lbApply(true);
    if (LB.moved || e.type === 'pointercancel') return;
    // тап: двойной — приближение/отдаление, одиночный на неувеличенном фото — закрыть
    const now = Date.now();
    if (now - LB.lastTap < 300) {
      clearTimeout(LB.tapTimer); LB.lastTap = 0;
      if (LB.s > 1) Object.assign(LB, { s: 1, x: 0, y: 0 }); else { lbZoomAt(2.5, e.clientX, e.clientY); lbClamp(); }
      lbApply(true);
    } else {
      LB.lastTap = now;
      LB.tapTimer = setTimeout(() => { if (LB.s === 1) closePanels(); }, 300);
    }
  };
  lb.addEventListener('pointerup', up);
  lb.addEventListener('pointercancel', up);
  lb.addEventListener('wheel', e => { // колёсико мыши на ПК
    e.preventDefault();
    lbZoomAt(Math.min(6, Math.max(1, LB.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2))), e.clientX, e.clientY);
    if (LB.s === 1) { LB.x = 0; LB.y = 0; }
    lbClamp(); lbApply(true);
  }, { passive: false });
  lb.querySelector('.lb-close').addEventListener('click', () => closePanels());
}

// ---------------- действия с сообщением ----------------
let sheetMsg = null;
const findMsg = id => (S.msgs.get(S.channelId) || []).find(m => m.id === id) || (S.pins.get(S.channelId) || []).find(m => m.id === id);

// ---------- «Часто используемые» эмодзи — берутся из аккаунта Discord (у каждого свои) ----------
// Discord хранит их в настройках-protobuf (settings-proto/2): поле 6 — эмодзи в сообщениях, 13 — в реакциях.
let EMOJI_SC = null;
function scToEmoji(name) {
  if (!EMOJI_SC) {
    EMOJI_SC = Object.create(null);
    for (const p of (typeof EMOJI_SC_RAW === 'string' ? EMOJI_SC_RAW : '').split('|')) { const i = p.indexOf('='); if (i > 0 && !(p.slice(0, i) in EMOJI_SC)) EMOJI_SC[p.slice(0, i)] = p.slice(i + 1); }
    for (const [n, c] of Object.entries(EMOJI_NAMES)) if (!(n in EMOJI_SC)) EMOJI_SC[n] = c;
  }
  const tone = name.match(/^(.+)_tone([1-5])$/);
  if (tone) { const b = EMOJI_SC[tone[1]]; return b ? b.replace(/️/g, '') + String.fromCodePoint(0x1F3FA + +tone[2]) : null; }
  return EMOJI_SC[name] || null;
}
function pbRead(buf) { // минимальный разбор protobuf: [{f, v}] — v число или Uint8Array
  const out = []; let i = 0;
  const varint = () => { let r = 0, mul = 1, b; do { b = buf[i++]; r += (b & 127) * mul; mul *= 128; } while (b & 128 && i < buf.length); return r; };
  while (i < buf.length) {
    const tag = varint(), f = Math.floor(tag / 8), wt = tag & 7;
    if (wt === 0) out.push({ f, v: varint() });
    else if (wt === 2) { const n = varint(); out.push({ f, v: buf.subarray(i, i + n) }); i += n; }
    else if (wt === 1) i += 8; else if (wt === 5) i += 4; else break;
  }
  return out;
}
function customEmojiName(id) {
  for (const list of S.emojis.values()) { const e = (list || []).find(x => x.id === id); if (e) return e; }
  for (const g of S.guilds) { const e = (g.emojis || []).find(x => x.id === id); if (e) return e; }
  return null;
}
function parseFrecency(field) {
  const items = [];
  for (const ent of pbRead(field).filter(x => x.f === 1 && x.v instanceof Uint8Array)) {
    const kv = pbRead(ent.v);
    const key = new TextDecoder().decode(kv.find(x => x.f === 1)?.v || new Uint8Array());
    const it = pbRead(kv.find(x => x.f === 2)?.v || new Uint8Array());
    const num = f => { const x = it.find(y => y.f === f); return typeof x?.v === 'number' ? x.v : 0; };
    const score = num(4) || num(3) || num(1);
    let e = null;
    if (/^\d{15,}$/.test(key)) { const c = customEmojiName(key); if (c) e = { id: key, name: c.name, animated: !!c.animated }; }
    else { const ch = /^[\x20-\x7e]+$/.test(key) ? scToEmoji(key) : key; if (ch) e = { ch }; }
    if (e) items.push({ e, score });
  }
  return items.sort((a, b) => b.score - a.score).map(x => x.e);
}
let frecencyLoading = false;
async function loadFrecency() {
  if (frecencyLoading || !B?.api) return;
  frecencyLoading = true;
  try {
    const r = await B.api('GET', '/users/@me/settings-proto/2');
    if (!r?.settings) return;
    const bin = Uint8Array.from(atob(r.settings), c => c.charCodeAt(0));
    const top = pbRead(bin);
    const pick = f => { const x = top.find(y => y.f === f && y.v instanceof Uint8Array); return x ? parseFrecency(x.v).slice(0, 40) : []; };
    const msg = pick(6), react = pick(13);
    if (msg.length || react.length) store.set('frecency', { msg, react: react.length ? react : msg, t: Date.now() });
  } catch { /* бот-токен или нет сети — останутся локальные «недавние» */ }
  finally { frecencyLoading = false; }
}
// kind: 'react' | 'msg'. Discord-список + то, что вы недавно выбирали здесь, без повторов.
function frequentEmoji(kind, n) {
  const fr = store.get('frecency', null)?.[kind] || [];
  const local = store.get('recentEmoji', []).map(ch => ({ ch }));
  const seen = new Set(), out = [];
  for (const e of [...fr, ...local, ...['👍', '❤️', '😂', '😮', '😢'].map(ch => ({ ch }))]) {
    const k = e.id || e.ch; if (seen.has(k)) continue; seen.add(k); out.push(e);
    if (out.length >= n) break;
  }
  return out;
}
const emoBtnHTML = e => e.id
  ? `<button data-react="${esc(`${e.name}:${e.id}`)}" data-emo="${esc(`${e.animated ? 'a' : ''}:${e.name}:${e.id}`)}" data-rkey="${esc(`${e.name}:${e.id}`)}"><img src="https://cdn.discordapp.com/emojis/${e.id}.webp?size=64" alt=""></button>`
  : `<button data-react="${esc(e.ch)}" data-emo="${esc(e.ch)}" data-rkey="${esc(e.ch)}">${esc(e.ch)}</button>`;

function openSheet(id) {
  const m = findMsg(id);
  if (!m || m._pending || !$('#sheet').classList.contains('hidden')) return;
  sheetMsg = m;
  if (Date.now() - (store.get('frecency', null)?.t || 0) > 6e5) loadFrecency();
  const mine = m.author?.id === S.me?.id;
  const sh = $('#sheet');
  sh.querySelector('.quick-react').innerHTML = frequentEmoji('react', 8).map(emoBtnHTML).join('') +
    '<button class="add" data-react-more="1" aria-label="Другая реакция"><svg class="stroke" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.2-8.6"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/><path d="M19 2v6M16 5h6"/></svg></button>';
  sh.querySelector('[data-act=profile]').classList.toggle('hidden', !m.author || m.author.id === S.me?.id);
  sh.querySelector('[data-act=pin] span').textContent = m.pinned ? 'Открепить' : 'Закрепить';
  sh.querySelector('[data-act=edit]').classList.toggle('hidden', !mine || !m.content);
  sh.querySelector('[data-act=delete]').classList.toggle('hidden', !mine);
  sh.querySelector('[data-act=copy]').classList.toggle('hidden', !m.content);
  pushPanel();
  sh.classList.remove('hidden');
}

async function toggleReaction(m, key, forceAdd) {
  const r = m.reactions?.find(x => emojiKey(x.emoji) === key);
  const add = forceAdd ?? !r?.me;
  if (r?.me && add) return;
  try { await B.react(m.channel_id, m.id, key, add); } catch (e) { toast(errText(e)); }
}

async function sheetAction(act) {
  const m = sheetMsg; closePanels();
  if (!m) return;
  if (act === 'reply') { S.reply = m; S.editing = null; showReplyBar(`Ответ <b>${esc(displayName(m.author, m.member))}</b>`); $('#input').focus(); }
  if (act === 'copy') { try { await navigator.clipboard.writeText(m.content); toast('Скопировано'); } catch { toast('Не удалось скопировать'); } }
  if (act === 'pin') {
    try { await B.setPin(m.channel_id, m.id, !m.pinned); m.pinned = !m.pinned; toast(m.pinned ? 'Сообщение закреплено' : 'Сообщение откреплено'); prefetchPins(m.channel_id); }
    catch (e) { toast(errText(e).includes('403') ? 'Нет права «Управлять сообщениями»' : errText(e)); }
  }
  if (act === 'profile') { openProfile(m.author.id); return; }
  if (act === 'link') { openExternal(channelLink(m.channel_id, m.id)); return; }
  if (act === 'edit') { saveDraft(); S.editing = m; S.reply = null; showReplyBar('Редактирование сообщения'); $('#input').value = m.content; autoGrow(); $('#input').focus(); }
  if (act === 'delete') {
    if (!confirm('Удалить сообщение?')) return;
    try { await B.del(m.channel_id, m.id); } catch (e) { toast(errText(e)); }
  }
}

function showReplyBar(html) { $('#replyText').innerHTML = html; $('#replyBar').classList.remove('hidden'); }
function cancelReply() {
  const wasEditing = !!S.editing;
  S.reply = null; S.editing = null; $('#replyBar').classList.add('hidden');
  if (wasEditing) loadDraft(S.channelId); else autoGrow(); // после редактирования вернуть недописанное
}

// --- черновики: недописанный текст хранится для каждого канала отдельно ---
const drafts = store.get('drafts', {});
let draftTimer = null;
function saveDraft(cid = S.channelId) {
  clearTimeout(draftTimer); draftTimer = null;
  if (!cid || S.editing) return; // текст редактируемого сообщения — не черновик
  const v = $('#input').value;
  if (v.trim()) drafts[cid] = v.slice(0, 4000); else if (drafts[cid] == null) return; else delete drafts[cid];
  store.set('drafts', drafts);
}
const saveDraftSoon = () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 500); };
function loadDraft(cid) { $('#input').value = (cid && drafts[cid]) || ''; autoGrow(); }

// ---------------- отправка ----------------
let pendingSeq = 0, lastTyping = 0;
function autoGrow() {
  const i = $('#input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 160) + 'px';
  const ready = !!i.value.trim() || S.files.length > 0;
  $('#sendBtn').classList.toggle('ready', ready);
  $('#sendBtn').classList.toggle('hidden', !ready);
}

// ---------------- подсказки при наборе: @люди, #каналы, :эмодзи ----------------
// В поле пишется читаемо («@Аня», «#общее», «:pepe:»), а при отправке превращается в формат Discord.
const AC = { map: new Map(), items: [], idx: 0, start: 0, end: 0, timer: 0, search: new Map() };
const EMOJI_NAMES = {
  smile: '😄', grin: '😁', joy: '😂', rofl: '🤣', sweat_smile: '😅', wink: '😉', blush: '😊', heart_eyes: '😍', kiss: '😘', thinking: '🤔',
  neutral: '😐', expressionless: '😑', eyeroll: '🙄', smirk: '😏', unamused: '😒', pensive: '😔', cry: '😢', sob: '😭', angry: '😠', rage: '😡',
  scream: '😱', flushed: '😳', sleeping: '😴', sunglasses: '😎', nerd: '🤓', clown: '🤡', skull: '💀', ghost: '👻', poop: '💩', pleading: '🥺',
  thumbsup: '👍', like: '👍', thumbsdown: '👎', ok: '👌', clap: '👏', pray: '🙏', muscle: '💪', wave: '👋', eyes: '👀', point_up: '☝️',
  heart: '❤️', broken_heart: '💔', fire: '🔥', star: '⭐', sparkles: '✨', '100': '💯', check: '✅', x: '❌', warning: '⚠️', tada: '🎉',
  cat: '🐱', dog: '🐶', moon: '🌙', sun: '☀️', rainbow: '🌈', pizza: '🍕', coffee: '☕', beer: '🍺', gamepad: '🎮', crown: '👑',
  smeh: '😂', serdce: '❤️', ogon: '🔥', plach: '😭', klass: '👍', cherep: '💀', dumayu: '🤔',
};
function acSource(trigger, q) {
  const ql = q.toLowerCase();
  const ch = S.chanById.get(S.channelId); const gid = ch?.guild_id;
  if (trigger === '@') {
    const seen = new Map();
    const add = (u, nick) => { if (!u?.id || seen.has(u.id) || u.id === S.me?.id) return; const name = nick || displayName(u);
      if (!ql || name.toLowerCase().includes(ql) || (u.username || '').toLowerCase().includes(ql)) seen.set(u.id, { kind: '@', id: u.id, name, sub: u.username, avatar: avatar(u) }); };
    if (!gid) (ch?.recipients || []).forEach(u => add(u));
    else {
      (AC.search.get(gid + ':' + ql) || []).forEach(m => add(m.user, m.nick));
      (S.msgs.get(S.channelId) || []).slice(-80).reverse().forEach(m => add(m.author, m.member?.nick));
      (S.members.get(gid)?.items || []).forEach(it => it.member && add(it.member.user, it.member.nick));
    }
    const list = [...seen.values()].slice(0, 8);
    if (gid) for (const s of ['everyone', 'here']) if (s.startsWith(ql)) list.push({ kind: '@', special: s, name: s, sub: 'упомянуть всех' });
    return list;
  }
  if (trigger === '#') {
    if (!gid) return [];
    return (S.channels.get(gid) || []).filter(c => (c.type === 0 || c.type === 5 || c.type === 15) && c.name.toLowerCase().includes(ql))
      .slice(0, 8).map(c => ({ kind: '#', id: c.id, name: c.name, sub: S.chanById.get(c.parent_id)?.name || '' }));
  }
  if (trigger === ':' && q.length >= 2) {
    if (gid && !S.emojis.has(gid) && B.emojis) { S.emojis.set(gid, []); B.emojis(gid).then(l => { S.emojis.set(gid, l || []); updateAc(); }).catch(() => {}); }
    const custom = (S.emojis.get(gid) || []).filter(e => e.name.toLowerCase().includes(ql)).slice(0, 6)
      .map(e => ({ kind: ':', custom: e, name: e.name, img: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'webp'}?size=48` }));
    const std = Object.entries(EMOJI_NAMES).filter(([n]) => n.startsWith(ql)).slice(0, 8 - custom.length)
      .map(([n, ch]) => ({ kind: ':', char: ch, name: n }));
    return [...custom, ...std];
  }
  return [];
}
function updateAc() {
  const i = $('#input'), pos = i.selectionStart ?? i.value.length;
  const before = i.value.slice(0, pos);
  const m = before.match(/(^|\s)([@#:])([^\s@#:]{0,32})$/);
  if (!m) return hideAc();
  const [, , trig, q] = m;
  AC.start = pos - q.length - 1; AC.end = pos;
  AC.items = acSource(trig, q); AC.idx = 0;
  renderAc();
  // поиск участников на сервере по нику (ответ — GUILD_MEMBERS_CHUNK)
  const gid = S.chanById.get(S.channelId)?.guild_id;
  if (trig === '@' && gid && B.requestMembers && !S.me?.is_bot_session && !AC.search.has(gid + ':' + q.toLowerCase())) {
    clearTimeout(AC.timer);
    AC.timer = setTimeout(() => { AC.pendingQ = gid + ':' + q.toLowerCase(); B.requestMembers(gid, q).catch(() => {}); }, 250);
  }
}
function onMembersChunk(d) {
  (d.members || []).forEach(m => m.user && S.users.set(m.user.id, { ...m.user, member: m }));
  if (AC.pendingQ && AC.pendingQ.startsWith(d.guild_id + ':')) { AC.search.set(AC.pendingQ, d.members || []); AC.pendingQ = null; if (!$('#acBox').classList.contains('hidden')) updateAc(); }
  onVoiceNames(d.guild_id);
}
function renderAc() {
  const box = $('#acBox');
  if (!AC.items.length) return hideAc();
  box.innerHTML = AC.items.map((it, n) => `<button data-ac="${n}" class="${n === AC.idx ? 'on' : ''}">${
    it.avatar ? `<img src="${it.avatar}" alt="">` : it.img ? `<img class="emo" src="${it.img}" alt="">` : it.char ? `<span class="ac-ic">${it.char}</span>` : `<span class="ac-ic">${it.kind}</span>`
  }<b>${esc(it.kind === ':' ? ':' + it.name + ':' : it.name)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('');
  box.classList.remove('hidden');
}
function hideAc() { const b = $('#acBox'); if (b) { b.classList.add('hidden'); b.innerHTML = ''; } AC.items = []; }
function pickAc(n) {
  const it = AC.items[n]; if (!it) return;
  const i = $('#input');
  let text;
  if (it.kind === '@') { text = '@' + (it.special || it.name); if (!it.special) AC.map.set('@' + it.name, `<@${it.id}>`); }
  else if (it.kind === '#') { text = '#' + it.name; AC.map.set(text, `<#${it.id}>`); }
  else if (it.custom) { text = ':' + it.name + ':'; AC.map.set(text, `<${it.custom.animated ? 'a' : ''}:${it.custom.name}:${it.custom.id}>`); }
  else text = it.char;
  i.value = i.value.slice(0, AC.start) + text + ' ' + i.value.slice(AC.end);
  const p = AC.start + text.length + 1;
  i.setSelectionRange(p, p); i.focus();
  hideAc(); autoGrow();
}
/** «@Аня» → «<@id>», «#общее» → «<#id>», «:pepe:» → «<:pepe:id>» перед отправкой. */
function expandMentions(text) {
  const keys = [...AC.map.keys()].sort((a, b) => b.length - a.length);
  for (const k of keys) text = text.split(k).join(AC.map.get(k));
  return text;
}

// ---------------- файлы («+») ----------------
const MAX_FILE = 10 * 1024 * 1024; // лимит Discord без Nitro
function addFiles(list) {
  for (const f of list) {
    if (S.files.length >= 10) { toast('Не больше 10 файлов'); break; }
    if (f.size > MAX_FILE) { toast(`«${f.name}» больше 10 МБ`); continue; }
    S.files.push({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
  }
  renderFiles();
}
function clearFiles() { S.files.forEach(f => f.preview && URL.revokeObjectURL(f.preview)); S.files = []; renderFiles(); }
function renderFiles() {
  const bar = $('#attachBar');
  bar.classList.toggle('hidden', !S.files.length);
  bar.innerHTML = S.files.map((f, i) => `<div class="chip">${f.preview ? `<img src="${f.preview}" alt="">` : `📄<br>${esc(f.file.name.slice(0, 40))}`}<button data-rmfile="${i}" aria-label="Убрать">✕</button></div>`).join('');
  autoGrow();
}
// ---------------- уведомления в шторке ----------------
// Кто показывает уведомления: 'pocketcord' | 'discord' (официальное приложение) | null — ещё не выбрано.
// Чтобы не было двойных, в режиме 'pocketcord' уведомления Discord выключаются в настройках Android.
const N = { settings: new Map(), roles: new Map(), mode: store.get('notifMode', null) };
const notifyOn = () => !!window.PcNotify && N.mode === 'pocketcord';
function onGuildSettings(list) { for (const e of list) N.settings.set(e.guild_id || '@me', e); }
const mutedNow = (muted, end) => !!muted && (!end || new Date(end) > new Date());
function shouldNotify(m) {
  if (!S.me || m.author?.id === S.me.id) return false;
  if (![0, 19, 3, 1].includes(m.type)) return false;
  // уже смотрим этот канал
  if (document.visibilityState === 'visible' && m.channel_id === S.channelId) return false;
  const gs = N.settings.get(m.guild_id || '@me');
  const ov = gs?.channel_overrides?.find(o => o.channel_id === m.channel_id);
  if (ov && mutedNow(ov.muted, ov.mute_end)) return false;
  // категория канала тоже может быть заглушена
  const parent = S.chanById.get(m.channel_id)?.parent_id;
  const pov = parent && gs?.channel_overrides?.find(o => o.channel_id === parent);
  if (pov && mutedNow(pov.muted, pov.mute_end)) return false;
  if (!m.guild_id) return true; // ЛС и группы: всё, кроме заглушённых (проверено выше)
  if (gs && mutedNow(gs.muted, gs.mute_end)) return false;
  const lvl = [ov?.level, pov?.level, gs?.level].find(l => l != null && l !== 3) ?? 1; // 0 — все, 1 — упоминания, 2 — ничего
  if (lvl === 2) return false;
  const me = m.mentions?.some(u => u.id === S.me.id);
  const everyone = m.mention_everyone && !gs?.suppress_everyone;
  const myRoles = N.roles.get(m.guild_id) || [];
  const role = !gs?.suppress_roles && m.mention_roles?.some(r => myRoles.includes(r));
  return lvl === 0 || me || everyone || role;
}
async function notifyMessage(m) {
  if (!notifyOn() || !shouldNotify(m)) return;
  let ch = S.chanById.get(m.channel_id);
  if (!ch && m.guild_id && !S.channels.has(m.guild_id)) {
    try { const list = await B.channels(m.guild_id); list.forEach(c => { c.guild_id = m.guild_id; S.chanById.set(c.id, c); }); S.channels.set(m.guild_id, list); } catch {}
    ch = S.chanById.get(m.channel_id);
  }
  const g = S.guilds.find(x => x.id === m.guild_id);
  const author = displayName(m.author, m.member);
  const sys = sysText(m, author);
  let text = sys ? sys.html.replace(/<[^>]+>/g, '') : plainText(m);
  if (!text) text = m.attachments?.length ? '📎 Вложение' : m.embeds?.length ? '🔗 Ссылка' : m.sticker_items?.length ? 'Стикер' : 'Сообщение';
  const title = m.guild_id ? `#${ch?.name || 'канал'} • ${g?.name || ''}` : ch?.type === 3 ? chanTitle(ch) : '';
  window.PcNotify.show(JSON.stringify({
    channel: m.channel_id, guild: m.guild_id || '', title, group: !!m.guild_id || ch?.type === 3,
    author, authorId: m.author?.id || '', avatar: avatar(m.author), text: text.slice(0, 500), mid: m.id,
    ts: Date.parse(m.timestamp) || Date.now(),
  }));
}
// Текст без разметки: упоминания -> @ник, эмодзи -> :имя:
function plainText(m) {
  return (m.content || '')
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const u = m.mentions?.find(x => x.id === id) || S.users.get(id) || (id === S.me?.id ? S.me : null);
      return '@' + (u ? displayName(u) : 'кто-то');
    })
    .replace(/<#(\d+)>/g, (_, id) => '#' + (S.chanById.get(id)?.name || 'канал'))
    .replace(/<@&\d+>/g, '@роль')
    .replace(/<a?(:\w+:)\d+>/g, '$1')
    .replace(/[*_~`|]{1,3}/g, '');
}
// Пузырь (BubbleActivity) показывает это же окно приложения: при открытии — проверить связь,
// отметить прочитанным и убрать уведомление открытого чата.
window.onBubbleShown = () => setTimeout(openDrawer, 150);
window.onAppVisible = () => { B?.wake?.().catch(() => {}); if (S.channelId) { scheduleAck(); clearNotify(S.channelId); } };

function clearNotify(cid) { try { window.PcNotify?.clear(cid); } catch {} }
function setNotifyMode(mode) {
  N.mode = mode; store.set('notifMode', mode);
  if (S.me) renderUser();
  if (!window.PcNotify) return;
  if (mode === 'pocketcord') {
    window.PcNotify.requestPermission();
    window.PcNotify.keepAlive(true);
    // второе меню — после того, как закроется первое (иначе путается история «назад»)
    if (window.PcNotify.discordInstalled()) setTimeout(() => {
      showMenu('Чтобы не было двойных уведомлений', [
        { label: 'Выключить уведомления в Discord', icon: BELL_OFF_SVG, fn: () => window.PcNotify.openDiscordSettings() },
        { label: 'Не сейчас', fn: () => {} },
      ]);
    }, 400);
    else toast('Уведомления включены');
  } else {
    window.PcNotify.keepAlive(false);
    window.PcNotify.clearAll();
    toast(mode === 'discord' ? 'Уведомления показывает официальный Discord' : 'Уведомления выключены');
  }
}
const BELL_SVG = '<svg class="stroke" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
const BELL_OFF_SVG = '<svg class="stroke" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l2 2H8"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="m3 3 18 18"/></svg>';
function notifyChooser(title = 'Кто показывает уведомления?') {
  const mark = m => N.mode === m ? ' ✓' : '';
  const items = [
    { label: 'Pocketcord' + mark('pocketcord'), icon: BELL_SVG, fn: () => setNotifyMode('pocketcord') },
    { label: 'Официальный Discord' + mark('discord'), icon: BELL_SVG, fn: () => setNotifyMode('discord') },
    { label: 'Никто' + mark('off'), icon: BELL_OFF_SVG, fn: () => setNotifyMode('off') },
  ];
  showMenu(title, items);
}
// нажатие на уведомление
window.onNotifyOpen = async () => {
  const raw = window.PcNotify?.pendingOpen(); if (!raw) return;
  const { channel, guild } = JSON.parse(raw);
  if (guild && S.guildId !== guild) await selectGuild(guild);
  if (!guild && S.guildId !== '@me') await selectGuild('@me');
  if (!S.chanById.has(channel)) await refreshDms();
  closePanels();
  openChannel(channel);
  // открылись плавающим окном — как у Discord: сразу серверы и ЛС, чат уже выбран
  try { if (window.PcNotify?.isFloating?.()) window.onBubbleShown(); } catch {}
};
// Кнопки уведомления
window.notifyReply = async (cid, text) => {
  try {
    const nonce = String(Date.now()) + String(pendingSeq++ % 1000).padStart(3, '0');
    await B.send(cid, text, null, nonce);
  } catch (e) { toast('Не отправлено: ' + errText(e)); }
};
window.notifyMarkRead = (cid, mid) => {
  const id = mid || S.msgs.get(cid)?.at(-1)?.id;
  if (id && B.ack) { S.acked.set(cid, id); B.ack(cid, id).catch(() => {}); }
  if (markSeen(cid)) { renderRail(); renderChannels(); }
};

// ---------------- картинка из буфера обмена ----------------
// На Android — через нативный мост PcClip (WebView сам картинки из буфера не отдаёт),
// в браузере — через Clipboard API.
const b64ToFile = (b64, name, type) => {
  const bin = atob(b64); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new File([a], name, { type });
};
let clipUsed = store.get('clipUsed', '');
function clipStamp() { try { return window.PcClip?.imageStamp() || ''; } catch { return ''; } }
async function pasteClipboardImage() {
  hideClipHint();
  if (window.PcClip) {
    const raw = window.PcClip.readImage();
    if (!raw) return toast('В буфере обмена нет картинки');
    const j = JSON.parse(raw);
    if (j.error) return toast('Картинка больше 10 МБ');
    addFiles([b64ToFile(j.data, j.name, j.mime)]);
    clipUsed = clipStamp(); store.set('clipUsed', clipUsed);
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const type = it.types.find(t => t.startsWith('image/'));
      if (type) { const b = await it.getType(type); addFiles([new File([b], 'image.' + type.split('/')[1], { type })]); return; }
    }
    toast('В буфере обмена нет картинки');
  } catch { toast('Нет доступа к буферу обмена'); }
}
// Подсказка над полем ввода, если скопирована новая картинка (как у клавиатуры).
function checkClipHint() {
  const st = clipStamp();
  const show = st && st !== clipUsed && S.channelId && S.files.length < 10;
  $('#clipHint').classList.toggle('hidden', !show);
  if (show) $('#clipHint').dataset.stamp = st;
}
function hideClipHint(remember = false) {
  const h = $('#clipHint');
  if (remember && h.dataset.stamp) { clipUsed = h.dataset.stamp; store.set('clipUsed', clipUsed); }
  h.classList.add('hidden');
}

const toB64 = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(file);
});

// ---------------- выбор эмодзи / GIF ----------------
const P = { tab: 'emoji', mode: 'insert', target: null, gifTimer: null, gifReq: 0 };
async function openPicker(tab, mode = 'insert', target = null) {
  Object.assign(P, { tab, mode, target, gifView: 'home' });
  if (Date.now() - (store.get('frecency', null)?.t || 0) > 6e5) loadFrecency().then(() => { if (P.tab === 'emoji' && !$('#picker').classList.contains('hidden')) renderPicker(); });
  $('#pickerSearch').value = '';
  $('.picker-tabs [data-tab=gif]').classList.toggle('hidden', mode === 'react');
  pushPanel();
  $('#picker').classList.remove('hidden');
  const gid = S.chanById.get(S.channelId)?.guild_id;
  if (gid && !S.emojis.has(gid) && B.emojis) { S.emojis.set(gid, []); B.emojis(gid).then(l => { S.emojis.set(gid, l || []); if (P.tab === 'emoji') renderPicker(); }).catch(() => {}); }
  renderPicker();
}
function renderPicker() {
  document.querySelectorAll('.picker-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === P.tab));
  const q = $('#pickerSearch').value.trim().toLowerCase();
  const grid = $('#pickerGrid'), cats = $('#pickerCats');
  $('#pickerSearch').placeholder = P.tab === 'gif' ? 'Поиск GIF (Tenor)' : 'Поиск эмодзи сервера';
  if (P.tab === 'gif') {
    cats.innerHTML = '';
    if (q) { P.gifView = 'search'; loadGifs(q); }
    else if (P.gifView === 'trending') loadGifs('');
    else if (P.gifView === 'fav') renderGifs();
    else { P.gifView = 'home'; renderGifHome(); }
    return;
  }
  const gid = S.chanById.get(S.channelId)?.guild_id;
  const custom = (S.emojis.get(gid) || []).filter(e => e.available !== false && (!q || e.name.toLowerCase().includes(q)));
  const g = S.guilds.find(x => x.id === gid);
  const secs = [];
  if (custom.length) secs.push({ id: 'srv', icon: g && guildIcon(g) ? `<img src="${guildIcon(g)}" alt="">` : '⭐', name: g?.name || 'Сервер',
    html: custom.map(e => `<button data-emo="${esc(`${e.animated ? 'a' : ''}:${e.name}:${e.id}`)}" data-rkey="${esc(`${e.name}:${e.id}`)}" title=":${esc(e.name)}:"><img loading="lazy" src="https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'webp'}?size=64" alt=""></button>`).join('') });
  if (!q) {
    const freq = frequentEmoji(P.mode === 'react' ? 'react' : 'msg', 24);
    secs.unshift({ id: 'rec', icon: '🕘', name: 'Часто используемые', html: freq.map(emoBtnHTML).join('') });
    EMOJI_CATS.forEach((c, i) => secs.push({ id: 'c' + i, icon: c.icon, name: c.name, html: c.list.map(e => `<button data-emo="${e}" data-rkey="${e}">${e}</button>`).join('') }));
  }
  cats.innerHTML = secs.map(s => `<button data-cat-jump="${s.id}">${s.icon}</button>`).join('');
  grid.innerHTML = secs.length ? secs.map(s => `<div class="e-sec" id="sec-${s.id}">${esc(s.name)}</div><div class="e-grid">${s.html}</div>`).join('')
    : '<div class="picker-note">Ничего не найдено</div>';
  grid.scrollTop = 0;
}
// ---------- GIF + избранное (хранится на этом устройстве) ----------
const STAR_SVG = STAR_ICON;
const favGifs = () => store.get('favGifs', []);
const isFavGif = url => favGifs().some(g => g.url === url);
function toggleFavGif(g) {
  const list = favGifs();
  const i = list.findIndex(x => x.url === g.url);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ url: g.url, src: g.src, gif_src: g.gif_src, preview: g.preview, width: g.width, height: g.height });
  store.set('favGifs', list.slice(0, 200));
  toast(i >= 0 ? 'Убрано из избранного' : 'Добавлено в избранное ⭐');
}
function gifGridHTML(list, offset) {
  return `<div class="g-grid">${list.map((g, i) => {
    const ratio = g.width && g.height ? ` style="aspect-ratio:${g.width}/${g.height}"` : '';
    const media = g.src && /\.mp4/.test(g.src) ? `<video autoplay loop muted playsinline src="${esc(g.src)}"${ratio}></video>` : `<img loading="lazy" src="${esc(g.gif_src || g.src || g.preview)}"${ratio} alt="">`;
    return `<button data-gif="${esc(g.url)}"><span class="fav${isFavGif(g.url) ? ' on' : ''}" data-fav="${offset + i}" aria-label="В избранное">${STAR_SVG}</span>${media}</button>`;
  }).join('')}</div>`;
}
// Экраны вкладки GIF: 'home' (плитки как в Discord), 'fav', 'trending', 'search'.
const TREND_SVG = '<svg class="stroke" viewBox="0 0 24 24"><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>';
function tileMedia(src) {
  if (!src) return '';
  return /\.mp4|\.webm/.test(src) ? `<video autoplay loop muted playsinline src="${esc(src)}"></video>` : `<img loading="lazy" src="${esc(src)}" alt="">`;
}
function renderGifHome() {
  const grid = $('#pickerGrid');
  const favs = favGifs();
  const c = P.gifCats;
  const fav = favs[0];
  let h = '<div class="gif-tiles">';
  h += `<button class="gif-tile fav-tile" data-gifview="fav">${tileMedia(fav && (fav.src || fav.gif_src || fav.preview))}<span><svg class="stroke star-ic" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/></svg>Избранное</span></button>`;
  h += `<button class="gif-tile" data-gifview="trending">${tileMedia(c?.gifs?.[0]?.src)}<span>${TREND_SVG}Популярные GIF</span></button>`;
  for (const cat of c?.categories || []) h += `<button class="gif-tile" data-gifcat="${esc(cat.name)}">${tileMedia(cat.src)}<span>${esc(cat.name)}</span></button>`;
  h += '</div>';
  if (P.gifCatsError) h += `<div class="picker-note">${esc(P.gifCatsError)}</div>`;
  else if (!c) h += '<div class="picker-note">Загрузка…</div>';
  grid.innerHTML = h;
  if (!c && !P.gifCatsLoading) {
    P.gifCatsLoading = true;
    (B.gifCategories ? B.gifCategories() : Promise.resolve({ categories: [], gifs: [] }))
      .then(r => { P.gifCats = r || { categories: [] }; })
      .catch(e => { P.gifCats = { categories: [] }; P.gifCatsError = /40[13]/.test(errText(e)) ? 'GIF доступны только при входе токеном аккаунта.' : ''; })
      .finally(() => { P.gifCatsLoading = false; if (P.tab === 'gif' && P.gifView === 'home') renderGifHome(); });
  }
}
function renderGifs() {
  const grid = $('#pickerGrid');
  const isFav = P.gifView === 'fav';
  const list = isFav ? favGifs() : (P.gifList || []);
  P.shown = list;
  const title = isFav ? '⭐ Избранное' : P.gifView === 'trending' ? 'Популярные GIF' : esc(P.gifQuery || '');
  let h = `<div class="g-head"><button data-gifback aria-label="Назад"><svg class="stroke" viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg></button><span>${title}</span></div>`;
  if (!isFav && P.gifError) h += `<div class="picker-note">${esc(P.gifError)}</div>`;
  else if (!isFav && P.gifLoading && !list.length) h += '<div class="picker-note">Загрузка…</div>';
  else if (list.length) h += gifGridHTML(list, 0);
  else h += `<div class="picker-note">${isFav ? 'Нажмите ☆ на любой GIF — в чате или здесь, — чтобы добавить его сюда.' : 'Ничего не найдено'}</div>`;
  const keep = grid.scrollTop;
  grid.innerHTML = h;
  grid.scrollTop = keep;
}
async function loadGifs(q) {
  const req = ++P.gifReq;
  Object.assign(P, { gifQuery: q, gifList: [], gifLoading: true, gifError: '' });
  renderGifs();
  try {
    const r = await B.gifs(q);
    if (req !== P.gifReq) return;
    P.gifList = Array.isArray(r) ? r : (r?.gifs || r?.results || []);
  } catch (e) {
    if (req !== P.gifReq) return;
    P.gifError = /40[13]/.test(errText(e)) ? 'Поиск GIF доступен только при входе токеном аккаунта.' : errText(e);
  }
  P.gifLoading = false;
  renderGifs();
}
function pickEmoji(btn) {
  const raw = btn.dataset.emo;
  if (!raw.includes(':')) store.set('recentEmoji', [raw, ...store.get('recentEmoji', []).filter(x => x !== raw)].slice(0, 16));
  if (P.mode === 'react') { const m = P.target; closePanels(); if (m) toggleReaction(m, btn.dataset.rkey, true); return; }
  const text = raw.includes(':') ? `<${raw}>` : raw;
  const i = $('#input'), s = i.selectionStart ?? i.value.length;
  i.value = i.value.slice(0, s) + text + i.value.slice(i.selectionEnd ?? s);
  i.selectionStart = i.selectionEnd = s + text.length;
  autoGrow();
  navigator.vibrate?.(5);
}

async function send() {
  const input = $('#input');
  const content = expandMentions(input.value.trim());
  const cid = S.channelId;
  if ((!content && !S.files.length) || !cid) return;
  input.value = ''; autoGrow(); hideAc();
  if (!S.editing && drafts[cid] != null) { delete drafts[cid]; store.set('drafts', drafts); clearTimeout(draftTimer); }
  if (S.editing) {
    const m = S.editing; cancelReply();
    if (content !== m.content) try { await B.edit(m.channel_id, m.id, content); } catch (e) { toast(errText(e)); }
    return;
  }
  const reply = S.reply; cancelReply();
  const files = S.files.map(f => f.file); clearFiles();
  if (S.detached) { S.detached = false; S.msgs.delete(cid); await openChannel(cid); }
  const nonce = String(Date.now()) + String(pendingSeq++ % 1000).padStart(3, '0');
  const temp = { id: nonce, nonce, _pending: true, channel_id: cid, author: S.me, content, timestamp: new Date().toISOString(),
    type: reply ? 19 : 0, referenced_message: reply, mentions: [], embeds: [], reactions: [],
    attachments: files.map(f => ({ filename: `${f.name} (загрузка…)`, size: f.size })) };
  appendMessage(temp);
  try {
    const real = files.length
      ? await B.upload(cid, content, reply?.id, nonce, await Promise.all(files.map(async f => ({ name: f.name, mime: f.type || null, data: await toB64(f) }))))
      : await B.send(cid, content, reply?.id, nonce);
    const list = S.msgs.get(cid) || [];
    const pi = list.findIndex(x => x.id === nonce);
    if (pi >= 0) {
      if (list.some(x => x.id === real.id)) list.splice(pi, 1); else list[pi] = real;
      if (cid === S.channelId) renderMessages();
    }
  } catch (e) {
    temp._failed = true; temp._pending = false;
    if (cid === S.channelId) rerenderOne(nonce);
    toast('Не отправлено: ' + errText(e));
  }
}

// ---------------- события Gateway ----------------
function onGateway({ t, d }) {
  if (t === 'MESSAGE_CREATE') {
    notifyMessage(d).catch(() => {});
    const ch = S.chanById.get(d.channel_id);
    const tp = S.typing.get(d.channel_id); if (tp?.delete(d.author?.id)) renderTyping();
    if (!ch && !d.guild_id) { refreshDms(); }
    if (ch && !ch.guild_id) { ch.last_message_id = d.id; }
    appendMessage(d);
    const mine = d.author?.id === S.me?.id;
    const visible = d.channel_id === S.channelId && document.visibilityState === 'visible';
    if (!mine && !visible) {
      S.unread.add(d.channel_id);
      const gid = d.guild_id || '@me';
      if (!d.guild_id || d.mentions?.some(u => u.id === S.me.id) || d.mention_everyone) { S.mentions.set(d.channel_id, (S.mentions.get(d.channel_id) || 0) + 1); S.chanGuild.set(d.channel_id, gid); recomputePings(); }
      renderRail(); renderChannels();
    } else if (S.guildId === '@me') renderChannels();
  } else if (t === 'MESSAGE_UPDATE') {
    for (const arr of [S.msgs.get(d.channel_id), S.pins.get(d.channel_id)]) {
      const m = arr?.find(x => x.id === d.id);
      if (m) Object.assign(m, d);
    }
    if (d.channel_id === S.channelId) rerenderOne(d.id);
  } else if (t === 'MESSAGE_DELETE') {
    const list = S.msgs.get(d.channel_id);
    if (list) { const i = list.findIndex(x => x.id === d.id); if (i >= 0) { list.splice(i, 1); if (d.channel_id === S.channelId) renderMessages(); } }
    const p = S.pins.get(d.channel_id);
    if (p?.some(x => x.id === d.id)) { S.pins.set(d.channel_id, p.filter(x => x.id !== d.id)); if (d.channel_id === S.channelId) { updatePinBtn(); renderPins(); } }
  } else if (t === 'MESSAGE_REACTION_ADD' || t === 'MESSAGE_REACTION_REMOVE') {
    const m = S.msgs.get(d.channel_id)?.find(x => x.id === d.message_id);
    if (!m) return;
    m.reactions ||= [];
    const key = emojiKey(d.emoji);
    let r = m.reactions.find(x => emojiKey(x.emoji) === key);
    const me = d.user_id === S.me?.id;
    if (t === 'MESSAGE_REACTION_ADD') {
      if (r) { r.count++; if (me) r.me = true; } else m.reactions.push({ emoji: d.emoji, count: 1, me });
    } else if (r) {
      r.count--; if (me) r.me = false;
      if (r.count <= 0) m.reactions = m.reactions.filter(x => x !== r);
    }
    if (d.channel_id === S.channelId) rerenderOne(m.id);
  } else if (t === 'GUILD_SETTINGS') {
    onGuildSettings(d);
  } else if (t === 'MY_ROLES') {
    for (const [g, r] of Object.entries(d || {})) N.roles.set(g, r || []);
  } else if (t === 'READ_STATE') {
    onReadState(d);
  } else if (t === 'VOICE_STATES') {
    onVoiceStates(d);
  } else if (t === 'VOICE_STATE_UPDATE') {
    onVoiceUpdate(d);
  } else if (t === 'GUILD_MEMBERS_CHUNK') {
    onMembersChunk(d);
  } else if (t === 'GUILD_UPDATE') {
    const g = S.guilds.find(x => x.id === d.id);
    if (g) { Object.assign(g, { name: d.name, icon: d.icon }); renderRail(); if (S.guildId === d.id) renderChannels(); }
  } else if (t === 'GUILD_ROLE_CREATE' || t === 'GUILD_ROLE_UPDATE') {
    S.roles.get(d.guild_id)?.set(d.role.id, d.role);
  } else if (t === 'GUILD_ROLE_DELETE') {
    S.roles.get(d.guild_id)?.delete(d.role_id);
  } else if (t === 'GUILD_MEMBER_UPDATE') {
    if (d.user?.id === S.me?.id && d.roles) { N.roles.set(d.guild_id, d.roles); S.myMember.set(d.guild_id, d); }
    const p = S.profiles.get(d.user?.id);
    if (p?.guild_member && p._gid === d.guild_id) { p.guild_member.roles = d.roles; if (S.side === 'profile' && S.profileId === d.user.id) renderProfile(); }
  } else if (t === 'MESSAGE_ACK') {
    clearNotify(d.channel_id); // прочитано на ПК или в Discord
    if (markSeen(d.channel_id)) { renderRail(); renderChannels(); }
  } else if (t === 'PRESENCES') {
    onPresences(d);
  } else if (t === 'GUILD_MEMBER_LIST_UPDATE') {
    onMemberList(d);
  } else if (t === 'CHANNEL_PINS_UPDATE') {
    if (d.channel_id === S.channelId) prefetchPins(d.channel_id); else S.pins.delete(d.channel_id);
  } else if (t === 'TYPING_START') {
    if (d.user_id === S.me?.id) return;
    const u = d.member?.user || S.users.get(d.user_id);
    const name = d.member?.nick || u?.global_name || u?.username || 'Кто-то';
    if (!S.typing.has(d.channel_id)) S.typing.set(d.channel_id, new Map());
    S.typing.get(d.channel_id).set(d.user_id, { name, until: Date.now() + 9000 });
    if (d.channel_id === S.channelId) renderTyping();
  } else if (t === 'CHANNEL_CREATE' || t === 'CHANNEL_UPDATE' || t === 'CHANNEL_DELETE') {
    if (d.guild_id && S.channels.has(d.guild_id)) {
      const list = S.channels.get(d.guild_id).filter(c => c.id !== d.id);
      if (t !== 'CHANNEL_DELETE') { list.push(d); S.chanById.set(d.id, d); }
      S.channels.set(d.guild_id, list);
      if (S.guildId === d.guild_id) renderChannels();
    } else if (!d.guild_id) refreshDms();
  }
}

function renderTyping() {
  const map = S.typing.get(S.channelId);
  const now = Date.now();
  const names = map ? [...map.values()].filter(x => x.until > now).map(x => x.name) : [];
  const el = $('#typing');
  if (!names.length) { el.innerHTML = ''; return; }
  const who = names.length > 3 ? 'Несколько человек' : names.map(n => `<b>${esc(n)}</b>`).join(', ');
  el.innerHTML = `${who} ${names.length > 1 ? 'печатают' : 'печатает'}…`;
}
setInterval(renderTyping, 2000);

async function refreshDms() {
  try {
    S.dms = await B.dms();
    S.dms.forEach(c => S.chanById.set(c.id, c));
    if (S.guildId === '@me') renderChannels();
  } catch {}
}

// Догрузить то, что пришло, пока соединения не было (если Discord не смог досылать сам).
async function catchUp() {
  refreshDms();
  const cid = S.channelId;
  const list = S.msgs.get(cid);
  if (!cid || !list || S.detached) return;
  try {
    const fresh = await B.messages(cid);
    const have = new Set(list.map(m => m.id));
    const add = (fresh || []).filter(m => !have.has(m.id)).reverse();
    add.forEach(m => appendMessage(m));
  } catch {}
}
let statusTimer = 0, wasReady = false;
function onStatus({ state, info }) {
  const el = $('#status');
  el.classList.remove('err');
  clearTimeout(statusTimer);
  if (state === 'ready') {
    el.classList.add('hidden');
    // новая сессия после обрыва (не RESUME) — события за время обрыва потеряны, догружаем
    if (wasReady && !info?.resumed) catchUp();
    wasReady = true;
    // статус, сохранённый в Discord, главнее; иначе — последний выбранный здесь
    const st = info?.status || store.get('myStatus', null);
    if (st && st !== S.myStatus) { S.myStatus = st; if (S.me) renderUser(); }
    return;
  }
  // короткие переподключения (доли секунды) не мигают плашкой
  if (state === 'connecting' && wasReady) {
    statusTimer = setTimeout(() => { el.textContent = 'Подключение…'; el.classList.remove('hidden'); }, 1200);
    return;
  }
  el.classList.remove('hidden');
  if (state === 'connecting') el.textContent = 'Подключение…';
  else if (state === 'error') el.textContent = 'Нет соединения, переподключаемся…';
  else if (state === 'fatal') { el.classList.add('err'); el.textContent = 'Ошибка: ' + (info || 'соединение закрыто'); }
}

// ---------------- вход ----------------
async function enterApp(me) {
  S.me = me;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderUser();
  const [guilds, dms] = await Promise.all([B.guilds().catch(() => []), B.dms().catch(() => [])]);
  S.guilds = guilds; S.dms = dms;
  dms.forEach(c => S.chanById.set(c.id, c));
  S.openFolders = new Set(store.get('openFolders', []));
  S.folders = store.get('folders', []);
  loadFolders();
  const last = store.get('lastGuild', guilds[0]?.id || '@me');
  const gid = last === '@me' || guilds.some(g => g.id === last) ? last : '@me';
  await selectGuild(gid);
  if (!S.channelId) openDrawer();
  autoCleanCheck();
  setTimeout(loadFrecency, 3000);
  // уведомления: служба после перезапуска, первый выбор режима, открытие из шторки
  if (window.PcNotify) {
    if (N.mode === 'pocketcord') window.PcNotify.keepAlive(true);
    if (window.PcNotify.pendingOpen && N.mode) window.onNotifyOpen();
    if (!N.mode) setTimeout(() => notifyChooser('Кто будет показывать уведомления?'), 1500);
  }
}

function showLogin() {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#demoBtn').classList.toggle('hidden', !!window.__TAURI__);
}

async function doLogin() {
  // убираем то, что часто прилипает при копировании из DevTools / мессенджеров
  let raw = $('#tokenInput').value.trim().replace(/^authorization\s*:?\s*/i, '');
  let bot = $('#botToggle').checked;
  if (/^Bot\s+/i.test(raw)) { bot = true; raw = raw.replace(/^Bot\s+/i, ''); }
  const clean = raw.replace(/[\s"'`]/g, '');
  if (!clean) return;
  const token = bot ? 'Bot ' + clean : clean;
  const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Вход…';
  $('#loginError').textContent = '';
  try { const me = await B.login(token); $('#tokenInput').value = ''; await enterApp(me); }
  catch (e) {
    const t = errText(e);
    const parts = clean.split('.').length;
    $('#loginError').innerHTML = t.includes('401')
      ? `Discord не принял токен (401).<br>Длина: ${clean.length} симв., частей через точку: ${parts} (обычно 3).<br>` +
        (bot ? 'Стоит галочка «Это токен бота» — для токена аккаунта её нужно снять.' : 'Если это токен бота — поставьте галочку «Это токен бота».') +
        '<br>Проверьте, что скопировано значение целиком.'
      : esc(t);
  }
  finally { btn.disabled = false; btn.textContent = 'Войти'; }
}

function startDemo() {
  B = demoBackend();
  B.onEvent(onGateway); B.onStatus(onStatus);
  B.login().then(enterApp);
}

// ---------------- обработчики ----------------
function bind() {
  bindSettings();
  $('#loginBtn').onclick = doLogin;
  $('#tokenInput').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  $('#demoBtn').onclick = startDemo;
  $('#guideBtn').onclick = () => $('#guide').classList.remove('hidden');
  $('#guideClose').onclick = () => $('#guide').classList.add('hidden');
  $('#guide').addEventListener('click', e => {
    if (e.target === $('#guide')) return $('#guide').classList.add('hidden');
    const t = e.target.closest('[data-gtab]'); if (!t) return;
    document.querySelectorAll('[data-gtab]').forEach(b => b.classList.toggle('active', b === t));
    document.querySelectorAll('[data-gpage]').forEach(p => p.classList.toggle('hidden', p.dataset.gpage !== t.dataset.gtab));
    $('#guide .guide-body').scrollTop = 0;
  });
  $('#tokenEye').onclick = () => { const i = $('#tokenInput'); i.type = i.type === 'password' ? 'text' : 'password'; };
  $('#menuBtn').onclick = openDrawer;
  $('#pinsBtn').onclick = () => toggleSide('pins');
  $('#searchBtn').onclick = () => toggleSide('search');
  $('#membersBtn').onclick = () => sideOpen('members') ? closePanels() : openMembers();
  // нажатие на ник в шапке: в ЛС — профиль, на сервере — участники
  $('.chat-title').onclick = () => {
    const ch = S.chanById.get(S.channelId); if (!ch) return;
    if (ch.type === 1) sideOpen('profile') ? closePanels() : openProfile(dmPartner()?.id);
    else if (ch.guild_id) sideOpen('members') ? closePanels() : openMembers();
  };
  $('#callBtn').onclick = startCall;
  $('#sideClose').onclick = () => closePanels();

  // «+», GIF, эмодзи
  $('#attachBtn').onclick = () => $('#fileInput').click();
  // картинка, вставленная из буфера обмена клавиатуры (нативная часть: ImageInput.kt)
  window.onNativeImage = json => {
    try {
      const j = JSON.parse(json);
      if (j.error) return toast(j.error === 'too_big' ? 'Картинка больше 10 МБ' : 'Не удалось вставить картинку');
      addFiles([b64ToFile(j.data, j.name, j.mime)]);
      hideClipHint(true);
    } catch (e) { toast('Не удалось вставить картинку'); }
  };
  $('#clipHint').addEventListener('click', e => {
    if (e.target.closest('.x')) hideClipHint(true); else pasteClipboardImage();
  });
  $('#input').addEventListener('focus', checkClipHint);
  $('#menu').addEventListener('click', e => {
    if (e.target === $('#menu')) return closeMenu();
    const b = e.target.closest('[data-mi]'); if (!b) return;
    const it = menuItems[+b.dataset.mi]; if (!it) return;
    const arg = it.colors ? +b.dataset.color : it.input ? $(`#menu [data-in="${b.dataset.mi}"]`).value.trim() : undefined;
    closeMenu(); it.fn(arg);
  });
  $('#menu').addEventListener('keydown', e => {
    const inp = e.target.closest('[data-in]');
    if (inp && e.key === 'Enter') { e.preventDefault(); $(`#menu button[data-mi="${inp.dataset.in}"]`).click(); }
  });
  // долгое нажатие на сервер / папку -> меню папок
  let rlTimer = null, rlStart = null, rlFired = false;
  const rail = $('#guildRail');
  const railMenu = el => el.dataset.folder ? folderMenu(el.dataset.folder) : el.dataset.g !== '@me' && guildMenu(el.dataset.g);
  rail.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-g],[data-folder]'); if (!el || e.button !== 0) return;
    rlStart = [e.clientX, e.clientY]; rlFired = false;
    rlTimer = setTimeout(() => { rlTimer = null; rlFired = true; navigator.vibrate?.(15); railMenu(el); }, 450);
  });
  rail.addEventListener('pointermove', e => { if (rlTimer && Math.hypot(e.clientX - rlStart[0], e.clientY - rlStart[1]) > 10) { clearTimeout(rlTimer); rlTimer = null; } });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => rail.addEventListener(ev, () => { clearTimeout(rlTimer); rlTimer = null; }));
  rail.addEventListener('contextmenu', e => {
    const el = e.target.closest('[data-g],[data-folder]'); if (!el) return;
    e.preventDefault(); clearTimeout(rlTimer); rlTimer = null;
    if (!rlFired) railMenu(el);
  });
  $('#fileInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#attachBar').addEventListener('click', e => {
    const b = e.target.closest('[data-rmfile]'); if (!b) return;
    const [f] = S.files.splice(+b.dataset.rmfile, 1); if (f?.preview) URL.revokeObjectURL(f.preview);
    renderFiles();
  });
  $('#gifBtn').onclick = () => openPicker('gif');
  $('#emojiBtn').onclick = () => openPicker('emoji');
  $('#picker').addEventListener('click', e => {
    if (e.target === $('#picker')) return closePanels();
    const tab = e.target.closest('[data-tab]');
    if (tab) { P.tab = tab.dataset.tab; P.gifView = 'home'; $('#pickerSearch').value = ''; renderPicker(); return; }
    const gv = e.target.closest('[data-gifview]');
    if (gv) { P.gifView = gv.dataset.gifview; $('#pickerGrid').scrollTop = 0; renderPicker(); return; }
    const gc = e.target.closest('[data-gifcat]');
    if (gc) { $('#pickerSearch').value = gc.dataset.gifcat; $('#pickerGrid').scrollTop = 0; renderPicker(); return; }
    if (e.target.closest('[data-gifback]')) { P.gifView = 'home'; $('#pickerSearch').value = ''; renderPicker(); return; }
    const jump = e.target.closest('[data-cat-jump]');
    if (jump) { document.getElementById('sec-' + jump.dataset.catJump)?.scrollIntoView({ block: 'start' }); return; }
    const emo = e.target.closest('[data-emo]'); if (emo) return pickEmoji(emo);
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const g = P.shown?.[+fav.dataset.fav];
      if (g) { toggleFavGif(g); if (P.gifView === 'fav') renderGifs(); else fav.classList.toggle('on', isFavGif(g.url)); }
      return;
    }
    const gif = e.target.closest('[data-gif]');
    if (gif) {
      closePanels();
      const i = $('#input'); const keep = i.value; i.value = gif.dataset.gif;
      send().then(() => { if (keep) { i.value = keep; autoGrow(); } });
    }
  });
  $('#pickerSearch').addEventListener('input', () => {
    clearTimeout(P.gifTimer);
    P.gifTimer = setTimeout(renderPicker, P.tab === 'gif' ? 350 : 0);
  });
  // в браузере перетаскивание/вставка картинок тоже прикрепляет файлы
  $('#input').addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); addFiles(f); } });
  $('#scrim').onclick = () => closePanels();
  $('#replyCancel').onclick = cancelReply;
  $('#sendBtn').onclick = () => { send(); if (isTouch) $('#input').focus(); };

  const input = $('#input');
  input.addEventListener('input', () => {
    autoGrow();
    updateAc();
    saveDraftSoon();
    if (input.value && Date.now() - lastTyping > 8000 && S.channelId) { lastTyping = Date.now(); B.typing(S.channelId).catch(() => {}); }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input && !acStart) hideAc(); }, 250));
  // Подсказка выбирается коротким касанием; если палец сдвинулся — это прокрутка списка, ничего не выбираем.
  // mousedown гасим, чтобы поле не теряло фокус и клавиатура не пряталась.
  let acStart = null;
  const acBox = $('#acBox');
  acBox.addEventListener('mousedown', e => e.preventDefault());
  acBox.addEventListener('pointerdown', e => { acStart = { x: e.clientX, y: e.clientY, top: acBox.scrollTop }; });
  acBox.addEventListener('pointerup', e => {
    const b = e.target.closest('[data-ac]'); const s = acStart; acStart = null;
    if (!b || !s) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8 || Math.abs(acBox.scrollTop - s.top) > 4) return;
    e.preventDefault(); pickAc(+b.dataset.ac);
  });
  acBox.addEventListener('pointercancel', () => { acStart = null; });
  input.addEventListener('keydown', e => {
    if (AC.items.length && !$('#acBox').classList.contains('hidden')) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); AC.idx = (AC.idx + (e.key === 'ArrowDown' ? 1 : -1) + AC.items.length) % AC.items.length; renderAc(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickAc(AC.idx); return; }
      if (e.key === 'Escape') { hideAc(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && (!isTouch || prefs.enterSend)) { e.preventDefault(); send(); }
    if (e.key === 'Escape') cancelReply();
    if (e.key === 'ArrowUp' && !input.value) {
      const mine = [...(S.msgs.get(S.channelId) || [])].reverse().find(m => m.author?.id === S.me?.id && !m._pending);
      if (mine) { sheetMsg = mine; sheetAction('edit'); e.preventDefault(); }
    }
  });

  $('#guildRail').addEventListener('click', e => {
    if (rlFired) { rlFired = false; return; } // это было долгое нажатие
    const f = e.target.closest('[data-folder]');
    if (f) {
      const id = f.dataset.folder;
      S.openFolders.has(id) ? S.openFolders.delete(id) : S.openFolders.add(id);
      store.set('openFolders', [...S.openFolders]); renderRail(); return;
    }
    const g = e.target.closest('[data-g]'); if (g) selectGuild(g.dataset.g);
  });
  // название сервера над каналами -> меню сервера (название, иконка, новые каналы)
  $('#guildHeader').addEventListener('click', () => { if (S.guildId && S.guildId !== '@me') serverMenu(S.guildId); });
  $('#iconInput').addEventListener('change', e => { uploadGuildIcon(e.target.files?.[0]); e.target.value = ''; });
  // долгое нажатие на канал/категорию -> меню канала (если есть права)
  let clTimer = null, clStart = null, clFired = false;
  const cl = $('#channelList');
  const clTarget = e => e.target.closest('[data-c],[data-cat]');
  const clOpen = el => channelMenu(el.dataset.c || el.dataset.cat);
  cl.addEventListener('pointerdown', e => {
    const el = clTarget(e); if (!el || e.button !== 0 || S.guildId === '@me') return;
    clStart = [e.clientX, e.clientY]; clFired = false;
    clTimer = setTimeout(() => { clTimer = null; const c = S.chanById.get(el.dataset.c || el.dataset.cat); if (c && can(c.guild_id, PERM.CHANNELS)) { clFired = true; navigator.vibrate?.(15); clOpen(el); } }, 450);
  });
  cl.addEventListener('pointermove', e => { if (clTimer && Math.hypot(e.clientX - clStart[0], e.clientY - clStart[1]) > 10) { clearTimeout(clTimer); clTimer = null; } });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => cl.addEventListener(ev, () => { clearTimeout(clTimer); clTimer = null; }));
  cl.addEventListener('contextmenu', e => { const el = clTarget(e); if (!el || S.guildId === '@me') return; e.preventDefault(); clearTimeout(clTimer); if (!clFired) clOpen(el); });
  $('#channelList').addEventListener('click', e => {
    if (clFired) { clFired = false; e.preventDefault(); return; } // это было долгое нажатие
    const vu = e.target.closest('.vu[data-uid]');
    if (vu) { closePanels(); setTimeout(() => openProfile(vu.dataset.uid, { gid: S.guildId }), 250); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) { const id = cat.dataset.cat; S.collapsed.has(id) ? S.collapsed.delete(id) : S.collapsed.add(id); store.set('collapsed', [...S.collapsed]); renderChannels(); return; }
    const c = e.target.closest('[data-c]');
    if (!c) return;
    // голосовой канал: зайти можно только в официальном Discord — открываем его там
    if (c.dataset.voice === 'vc') { openExternal(`https://discord.com/channels/${S.guildId}/${c.dataset.c}`); return; }
    if (c.dataset.voice) { toast('Форумы пока не поддерживаются'); return; }
    openChannel(c.dataset.c);
  });
  $('#statusMenu').addEventListener('click', e => {
    const b = e.target.closest('[data-st]');
    if (b) setMyStatus(b.dataset.st); else if (e.target === $('#statusMenu')) closeStatusMenu();
  });
  $('#userPanel').addEventListener('click', async e => {
    if (e.target.closest('#notifBtn')) { notifyChooser('Уведомления'); return; }
    if (e.target.closest('#myStatusBtn')) { $('#statusMenu').classList.contains('hidden') ? openStatusMenu() : closeStatusMenu(); return; }
    if (e.target.closest('#setBtn')) { openSettings(); return; }
    if (e.target.id !== 'logoutBtn') return;
    if (!confirm('Выйти из аккаунта?')) return;
    await B.logout().catch(() => {});
    location.reload();
  });

  const msgs = $('#messages');
  msgs.addEventListener('scroll', () => {
    if (msgs.scrollHeight + msgs.scrollTop - msgs.clientHeight < 400) loadOlder();
  }, { passive: true });

  // клики внутри сообщений и закрепов
  const clickInside = e => {
    const a = e.target.closest('a[href^="http"]');
    if (a) { e.preventDefault(); openExternal(a.href); return; }
    const who = e.target.closest('[data-uid]');
    if (who && who.dataset.uid !== 'undefined') { openProfile(who.dataset.uid); return; }
    const sp = e.target.closest('.spoiler'); if (sp) { sp.classList.add('shown'); return; }
    const rx = e.target.closest('.rx');
    if (rx) { const m = findMsg(rx.closest('[data-id]').dataset.id); if (m) toggleReaction(m, rx.dataset.emoji); return; }
    const gbox = e.target.closest('.gifv');
    if (gbox) {
      const d = gbox.dataset;
      if (e.target.closest('.gif-star')) {
        toggleFavGif({ url: d.gurl, src: d.gsrc, preview: d.gprev, width: +d.gw || undefined, height: +d.gh || undefined });
        const on = isFavGif(d.gurl);
        document.querySelectorAll('.gifv').forEach(b => { if (b.dataset.gurl === d.gurl) b.querySelector('.gif-star').classList.toggle('on', on); });
        return;
      }
      const vid = gbox.querySelector('video'); if (vid?.paused) vid.play().catch(() => {}); // GIF без автозапуска — по нажатию
      document.querySelectorAll('.gifv.show-star').forEach(b => b !== gbox && b.classList.remove('show-star'));
      gbox.classList.toggle('show-star');
      clearTimeout(gbox._t); gbox._t = setTimeout(() => gbox.classList.remove('show-star'), 4000);
      return;
    }
    const img = e.target.closest('.att img, .embed img');
    if (img) { openLightbox(img.dataset.full || img.src); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) { if (!flashMessage(jump.dataset.jump)) openChannel(S.channelId, { around: jump.dataset.jump }); return; }
    if (e.target.closest('.open-pins')) { e.preventDefault(); openPins(); return; }
    const chm = e.target.closest('[data-ch]');
    if (chm && S.chanById.has(chm.dataset.ch)) { openChannel(chm.dataset.ch); return; }
    if (e.target.id === 'toPresent') { S.detached = false; S.msgs.delete(S.channelId); openChannel(S.channelId); }
  };
  $('#msgInner').addEventListener('click', clickInside);
  $('#sideBody').addEventListener('keydown', e => {
    if (e.target.id === 'searchInput' && e.key === 'Enter') { e.preventDefault(); S.search.q = e.target.value; runSearch(); e.target.blur(); }
  });
  $('#sideBody').addEventListener('click', async e => {
    if (e.target.closest('#profClose')) return closePanels();
    const mod = e.target.closest('[data-mod]'); if (mod) return modAction(mod.dataset.mod);
    if (e.target.closest('#profCall')) return startCall();
    if (e.target.closest('#profFull, #profFull2')) return openExternal(`https://discord.com/users/${S.profileId}`);
    if (e.target.closest('#searchMore')) return runSearch(true);
    const j = e.target.closest('[data-jumpto]');
    if (j) {
      const id = j.dataset.jumpto, cid = j.dataset.chan || S.channelId;
      if (!wide() || S.side !== 'search') closePanels();
      if (cid !== S.channelId) { if (!S.chanById.has(cid)) return toast('Канал недоступен'); openChannel(cid, { around: id }); }
      else if (!flashMessage(id)) openChannel(cid, { around: id });
      return;
    }
    const u = e.target.closest('[data-unpin]');
    if (u) {
      try { await B.setPin(S.channelId, u.dataset.unpin, false); S.pins.set(S.channelId, (S.pins.get(S.channelId) || []).filter(m => m.id !== u.dataset.unpin)); renderPins(); updatePinBtn(); toast('Откреплено'); }
      catch (err) { toast(errText(err).includes('403') ? 'Нет права «Управлять сообщениями»' : errText(err)); }
      return;
    }
    clickInside(e);
  });

  // долгое нажатие / правый клик -> меню действий
  let lpTimer = null, lpStart = null, lpEl = null;
  const lpCancel = () => { clearTimeout(lpTimer); lpTimer = null; lpEl?.classList.remove('pressed'); lpEl = null; };
  $('#msgInner').addEventListener('pointerdown', e => {
    const el = e.target.closest('.m[data-id]');
    if (!el || e.button !== 0 || e.target.closest('a,button,video')) return;
    lpStart = [e.clientX, e.clientY]; lpEl = el;
    lpTimer = setTimeout(() => { el.classList.remove('pressed'); navigator.vibrate?.(15); openSheet(el.dataset.id); lpTimer = null; }, 420);
    setTimeout(() => lpTimer && el.classList.add('pressed'), 120);
  });
  $('#msgInner').addEventListener('pointermove', e => { if (lpTimer && Math.hypot(e.clientX - lpStart[0], e.clientY - lpStart[1]) > 10) lpCancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('#msgInner').addEventListener(ev, lpCancel));
  $('#msgInner').addEventListener('contextmenu', e => {
    const el = e.target.closest('.m[data-id]'); if (!el) return;
    e.preventDefault(); lpCancel(); openSheet(el.dataset.id);
  });
  // двойной тап по сообщению — быстрая реакция (выбирается в настройках)
  $('#msgInner').addEventListener('dblclick', e => {
    const el = e.target.closest('.m[data-id]'); if (!el || !isTouch || !prefs.quickReact) return;
    if (e.target.closest('a,button,video,img.att-img,.att,.spoiler,.reactions')) return;
    const m = findMsg(el.dataset.id); if (!m || m._pending || m._failed) return;
    lpCancel(); getSelection()?.removeAllRanges?.();
    navigator.vibrate?.(10);
    toggleReaction(m, prefs.quickReact, true);
  });

  // свайп сообщения влево — ответить на него (как в Telegram)
  let sw = null, swUsed = false; // swUsed — жест уже ушёл на ответ, панели не открываем
  const swReset = () => {
    if (!sw) return;
    const { el } = sw; sw = null;
    el.style.transition = 'transform .18s ease'; el.style.transform = '';
    el.querySelector('.swipe-ico')?.remove();
    setTimeout(() => { el.style.transition = ''; }, 200);
  };
  $('#msgInner').addEventListener('touchstart', e => {
    const el = e.target.closest('.m[data-id]');
    sw = null;
    if (!el || e.touches.length > 1 || e.target.closest('pre, .att, a, video')) return;
    const t = e.touches[0];
    sw = { el, x: t.clientX, y: t.clientY, dx: 0, on: false, dead: false };
  }, { passive: true });
  $('#msgInner').addEventListener('touchmove', e => {
    if (!sw || sw.dead) return;
    const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw.dead = true; return; } // это прокрутка
      if (dx > -14 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      sw.on = true; swUsed = true; lpCancel();
      const ico = document.createElement('span'); ico.className = 'swipe-ico'; ico.innerHTML = '↩';
      sw.el.appendChild(ico);
    }
    sw.dx = Math.max(-90, Math.min(0, dx));
    sw.el.style.transform = `translateX(${sw.dx}px)`;
    const ico = sw.el.querySelector('.swipe-ico');
    const ready = sw.dx <= -60;
    if (ico) { ico.style.opacity = Math.min(1, -sw.dx / 60); ico.classList.toggle('ready', ready); }
    if (ready && !sw.buzzed) { sw.buzzed = true; navigator.vibrate?.(8); } else if (!ready) sw.buzzed = false;
  }, { passive: true });
  $('#msgInner').addEventListener('touchend', () => {
    if (sw?.on && sw.dx <= -60) {
      const m = findMsg(sw.el.dataset.id);
      if (m && !m._pending && !m._failed) { sheetMsg = m; sheetAction('reply'); }
    }
    swReset();
  }, { passive: true });
  $('#msgInner').addEventListener('touchcancel', swReset, { passive: true });

  $('#sheet').addEventListener('click', e => {
    if (e.target === $('#sheet')) return closePanels();
    if (e.target.closest('[data-react-more]')) {
      const m = sheetMsg; $('#sheet').classList.add('hidden');
      openPicker('emoji', 'react', m); return;
    }
    const r = e.target.closest('[data-react]');
    if (r) { const m = sheetMsg; closePanels(); if (m) toggleReaction(m, r.dataset.react, true); return; }
    const a = e.target.closest('[data-act]'); if (a) sheetAction(a.dataset.act);
  });
  bindLightbox();

  // свайпы: вправо — каналы, влево — закреплённые
  let sx = 0, sy = 0, tracking = false;
  $('#app').addEventListener('touchstart', e => { swUsed = false; const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = !e.target.closest('pre, .att, textarea, #lightbox, #menu'); }, { passive: true });
  $('#app').addEventListener('touchend', e => {
    if (!tracking || wide() || swUsed) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const app = $('#app');
    if (app.classList.contains('drawer-open')) { if (dx < 0) closePanels(); return; }
    if (app.classList.contains('side-open')) { if (dx > 0) closePanels(); return; }
    if (!$('#sheet').classList.contains('hidden') || !$('#picker').classList.contains('hidden')) return;
    if (dx > 0) openDrawer(); else openPins();
  }, { passive: true });

  // сеть вернулась (Wi-Fi <-> мобильный интернет) — тоже проверить связь сразу
  addEventListener('online', () => B?.wake?.().catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { saveDraft(); return; }
    B?.wake?.().catch(() => {}); // вернулись в приложение — сразу проверить связь
    if (!S.channelId) return;
    scheduleAck();
    clearNotify(S.channelId);
    if (document.activeElement === $('#input')) setTimeout(checkClipHint, 300);
    if (markSeen(S.channelId)) { renderRail(); renderChannels(); }
  });
}

// ---------------- старт ----------------
(async function main() {
  applyPrefs();
  bind();
  if (!B) {
    if (new URLSearchParams(location.search).has('demo')) return startDemo();
    return showLogin();
  }
  B.onEvent(onGateway); B.onStatus(onStatus);
  try {
    const me = await B.restore();
    if (me) return enterApp(me);
  } catch (e) { $('#loginError').textContent = errText(e); }
  showLogin();
})();
