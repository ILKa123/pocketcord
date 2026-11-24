// Демо-бэкенд: тот же интерфейс, что и Rust-команды, но с выдуманными данными.
// Нужен, чтобы посмотреть интерфейс в браузере без токена.
function demoBackend() {
  const EPOCH = 1420070400000n;
  let seq = 0;
  const sf = (t = Date.now()) => String(((BigInt(t) - EPOCH) << 22n) + BigInt(seq++ % 4096));
  const users = {
    me:   { id: '100000000000000001', username: 'you', global_name: 'Ты', avatar: null, _c: '#5865f2' },
    anya: { id: '100000000000000002', username: 'anya', global_name: 'Аня', avatar: null, _c: '#eb459e', primary_guild: { tag: 'DBD', identity_enabled: true } },
    max:  { id: '100000000000000003', username: 'max_dev', global_name: 'Макс', avatar: null, _c: '#23a55a' },
    lena: { id: '100000000000000004', username: 'lena', global_name: 'Лена', avatar: null, _c: '#f0b232' },
    bot:  { id: '100000000000000005', username: 'Ferris', global_name: null, avatar: null, bot: true, _c: '#e67e22' },
  };
  const g1 = '200000000000000001', g2 = '200000000000000002';
  const guilds = [
    { id: g1, name: 'Rust Россия', icon: null, owner: true, permissions: '8' },
    { id: g2, name: 'Вечерние игры', icon: null },
  ];
  const C = (id, name, type, pos, parent = null, extra = {}) => ({ id, name, type, position: pos, parent_id: parent, ...extra });
  const channels = {
    [g1]: [
      C('300000000000000010', 'Информация', 4, 0),
      C('300000000000000011', 'правила', 0, 0, '300000000000000010'),
      C('300000000000000012', 'новости', 5, 1, '300000000000000010', { topic: 'Релизы Rust и экосистемы' }),
      C('300000000000000020', 'Текстовые каналы', 4, 1),
      C('300000000000000021', 'общее', 0, 0, '300000000000000020', { topic: 'Болтаем обо всём' }),
      C('300000000000000022', 'помощь', 0, 1, '300000000000000020', { topic: 'Задавайте вопросы с кодом' }),
      C('300000000000000023', 'мемы', 0, 2, '300000000000000020'),
      C('300000000000000030', 'Голосовые', 4, 2),
      C('300000000000000031', 'Общий', 2, 0, '300000000000000030'),
    ],
    [g2]: [
      C('300000000000000040', 'Чаты', 4, 0),
      C('300000000000000041', 'лобби', 0, 0, '300000000000000040'),
      C('300000000000000042', 'скриншоты', 0, 1, '300000000000000040'),
    ],
  };
  const dms = [
    { id: '400000000000000001', type: 1, recipients: [users.anya], last_message_id: sf() },
    { id: '400000000000000002', type: 1, recipients: [users.max], last_message_id: sf() },
  ];

  const store = {}; // channelId -> messages (новые первыми, как в API)
  const t0 = Date.now() - 1000 * 60 * 60 * 26;
  const mk = (cid, u, content, minsAgo, extra = {}) => {
    const ts = Date.now() - minsAgo * 60000;
    return { id: sf(ts), channel_id: cid, author: u, content, timestamp: new Date(ts).toISOString(),
      edited_timestamp: null, type: 0, mentions: [], attachments: [], embeds: [], reactions: [], pinned: false, ...extra };
  };
  const gen = 'общее';
  const cg = '300000000000000021';
  const L = [];
  L.push(mk(cg, users.max, 'Всем привет! Кто уже обновился на **Rust 1.91**?', 1560));
  L.push(mk(cg, users.anya, 'я обновилась, всё собралось с первого раза', 1556));
  L.push(mk(cg, users.anya, 'даже clippy молчит 😅', 1555));
  const rules = mk(cg, users.lena, '📌 **Правила канала**\n> 1. Будьте вежливы\n> 2. Код — в блоках ```\n> 3. Без спама', 1500, { pinned: true });
  L.push(rules);
  L.push(mk(cg, users.max, 'Вот как я теперь читаю конфиг:\n```rust\nlet cfg: Config = toml::from_str(&std::fs::read_to_string("app.toml")?)?;\nprintln!("{cfg:#?}");\n```', 300));
  const q = L[L.length - 1];
  L.push(mk(cg, users.me, 'А почему не через `serde_json`?', 296, { type: 19, referenced_message: q, message_reference: { message_id: q.id } }));
  L.push(mk(cg, users.max, 'TOML удобнее руками править', 295, { reactions: [{ emoji: { name: '👍' }, count: 3, me: true }, { emoji: { name: '🦀' }, count: 2, me: false }] }));
  L.push(mk(cg, users.bot, '', 290, { embeds: [{ type: 'rich', color: 0xe67e22, title: 'Сборка #418 прошла', url: 'https://example.com',
    description: 'Ветка `main` · 2 мин 14 с', fields: [{ name: 'Тесты', value: '312 пройдено' }, { name: 'Предупреждения', value: '0' }] }] }));
  const meeting = mk(cg, users.lena, 'Созвон в **субботу в 18:00** — обсуждаем мобильный клиент. Ссылка будет тут.', 120, { pinned: true });
  L.push(meeting);
  L.push(mk(cg, users.lena, '', 119, { type: 6, message_reference: { message_id: meeting.id } }));
  L.push(mk(cg, users.anya, `<@${users.me.id}> ты придёшь?`, 30, { mentions: [users.me] }));
  L.push(mk(cg, users.me, 'Да, конечно ||и принесу печеньки||', 28));
  const link = mk(cg, users.max, 'Полезная статья про async: https://example.com/async-rust', 12, { pinned: true });
  L.push(link);
  L.push(mk(cg, users.anya, 'спасибо!', 4, { reactions: [{ emoji: { name: '❤️' }, count: 1, me: false }] }));
  store[cg] = L.reverse();

  const seedSimple = (cid, lines) => { store[cid] = lines.map((l, i) => mk(cid, l[0], l[1], (lines.length - i) * 37)).reverse(); };
  seedSimple('300000000000000022', [[users.lena, 'Как сделать `Arc<Mutex<T>>` без дедлоков?'], [users.max, 'Не держи guard через `.await` 🙂']]);
  seedSimple('300000000000000023', [[users.anya, 'когда borrow checker наконец разрешил'], [users.max, '🦀🦀🦀']]);
  seedSimple('300000000000000011', [[users.lena, 'Добро пожаловать! Прочитайте закреплённые сообщения в #общее.']]);
  seedSimple('300000000000000012', [[users.bot, '**Rust 1.91** вышел! Подробности в блоге.']]);
  seedSimple('300000000000000041', [[users.max, 'Кто сегодня играет?'], [users.lena, 'я в 21:00']]);
  seedSimple('300000000000000042', []);
  seedSimple(dms[0].id, [[users.anya, 'Привет! Глянешь мой PR?'], [users.me, 'Да, вечером']]);
  seedSimple(dms[1].id, [[users.max, 'Скинь конфиг сервера, пожалуйста']]);

  let evCb = () => {}, stCb = () => {};
  const emit = (t, d) => setTimeout(() => evCb({ t, d }), 0);
  const delay = (v, ms = 120) => new Promise(r => setTimeout(() => r(structuredClone(v)), ms));
  const find = (cid, mid) => (store[cid] || []).find(m => m.id === mid);
  const guildOf = cid => Object.keys(channels).find(g => channels[g].some(c => c.id === cid));

  // «живой» собеседник
  const chatter = ['Кстати, а кто пробовал Tauri 2 на Android?', 'Я тут 🦀', 'Отличная идея!', 'Сейчас посмотрю', 'Ахаха 😂', 'А где ссылка?', `<@${users.me.id}> глянь, пожалуйста`];
  const targets = [cg, cg, '300000000000000022', '300000000000000041', dms[0].id];
  setInterval(() => {
    const cid = targets[Math.floor(Math.random() * targets.length)];
    const u = cid === dms[0].id ? users.anya : [users.anya, users.max, users.lena][Math.floor(Math.random() * 3)];
    emit('TYPING_START', { channel_id: cid, user_id: u.id, member: { user: u } });
    setTimeout(() => {
      const content = chatter[Math.floor(Math.random() * chatter.length)];
      const m = mk(cid, u, content, 0, { guild_id: guildOf(cid), mentions: content.includes(users.me.id) ? [users.me] : [] });
      store[cid].unshift(m);
      emit('MESSAGE_CREATE', structuredClone(m));
    }, 2500);
  }, 15000);

  return {
    demo: true,
    restore: () => delay(null, 0),
    login: () => delay(users.me),
    logout: async () => {},
    guilds: () => delay(guilds),
    dms: () => delay(dms),
    channels: g => delay(channels[g] || []),
    messages: (cid, o = {}) => {
      const all = store[cid] || [];
      if (o.before) { const i = all.findIndex(m => m.id === o.before); return delay(i < 0 ? [] : all.slice(i + 1, i + 51)); }
      if (o.around) { const i = Math.max(0, all.findIndex(m => m.id === o.around)); return delay(all.slice(Math.max(0, i - 25), i + 25)); }
      return delay(all.slice(0, 50));
    },
    pins: cid => delay((store[cid] || []).filter(m => m.pinned)),
    send: (cid, content, replyTo, nonce) => {
      const ref = replyTo ? find(cid, replyTo) : null;
      const m = mk(cid, users.me, content, 0, { nonce, guild_id: guildOf(cid), ...(ref ? { type: 19, referenced_message: ref, message_reference: { message_id: ref.id } } : {}) });
      store[cid].unshift(m);
      emit('MESSAGE_CREATE', structuredClone(m));
      return delay(m, 200);
    },
    edit: (cid, mid, content) => { const m = find(cid, mid); m.content = content; m.edited_timestamp = new Date().toISOString(); emit('MESSAGE_UPDATE', structuredClone(m)); return delay(m); },
    del: (cid, mid) => { store[cid] = store[cid].filter(m => m.id !== mid); emit('MESSAGE_DELETE', { id: mid, channel_id: cid }); return delay(null); },
    setPin: (cid, mid, p) => { const m = find(cid, mid); if (m) m.pinned = p; emit('MESSAGE_UPDATE', structuredClone(m)); emit('CHANNEL_PINS_UPDATE', { channel_id: cid }); return delay(null); },
    react: (cid, mid, emoji, add) => {
      const m = find(cid, mid); if (!m) return delay(null);
      emit(add ? 'MESSAGE_REACTION_ADD' : 'MESSAGE_REACTION_REMOVE', { channel_id: cid, message_id: mid, user_id: users.me.id, emoji: { name: emoji, id: null } });
      let r = m.reactions.find(r => r.emoji.name === emoji);
      if (add) { if (r) { r.count++; r.me = true; } else m.reactions.push({ emoji: { name: emoji }, count: 1, me: true }); }
      else if (r) { r.count--; r.me = false; if (!r.count) m.reactions = m.reactions.filter(x => x !== r); }
      return delay(null);
    },
    typing: async () => {},
    upload: (cid, content, replyTo, nonce, files) => {
      const atts = files.map((f, i) => ({ id: sf(), filename: f.name, size: Math.round(f.data.length * 0.75), content_type: f.mime,
        url: `data:${f.mime || 'application/octet-stream'};base64,${f.data}` }));
      const m = mk(cid, users.me, content, 0, { nonce, guild_id: guildOf(cid), attachments: atts });
      store[cid].unshift(m);
      emit('MESSAGE_CREATE', structuredClone(m));
      return delay(m, 400);
    },
    search: (scope, q) => {
      const chans = scope.guildId ? channels[scope.guildId].map(c => c.id) : [scope.channelId];
      const hits = chans.flatMap(c => store[c] || []).filter(m => m.content.toLowerCase().includes(q.toLowerCase()));
      return delay({ total_results: hits.length, messages: hits.slice(0, 25).map(m => [{ ...m, hit: true }]) }, 300);
    },
    profile: uid => {
      const u = Object.values(users).find(x => x.id === uid);
      const bios = { anya: 'Пишу на Rust и рисую 🎨\nhttps://example.com/anya', max: 'backend • 🦀 • кофе', lena: 'модератор сервера', bot: 'CI-бот сервера' };
      const key = Object.keys(users).find(k => users[k] === u);
      return delay({ user: u, user_profile: { bio: bios[key] || '', pronouns: key === 'anya' ? 'она' : '', accent_color: parseInt((u?._c || '#5865f2').slice(1), 16) },
        mutual_guilds: key === 'bot' ? [{ id: g1 }] : [{ id: g1 }, { id: g2 }], mutual_friends_count: key === 'bot' ? 0 : 2,
        mutual_friends: key === 'bot' ? [] : [users.lena, users.max].filter(x => x !== u).slice(0, 2),
        connected_accounts: key === 'max' ? [{ type: 'github', name: 'max-dev' }] : [] }, 250);
    },
    emojis: () => delay([]),
    gifCategories: () => {
      const tile = (c, t) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="${c}"/><circle cx="${40 + t.length * 7}" cy="45" r="30" fill="#fff" opacity=".25"/></svg>`);
      const names = ['привет', 'лол', 'любовь', 'с днём рождения', 'грустно', 'танцы'];
      const cols = ['#e67e22', '#9b59b6', '#eb459e', '#23a55a', '#00a8fc', '#f23f43'];
      return delay({ categories: names.map((n, i) => ({ name: n, src: tile(cols[i], n) })), gifs: [{ src: tile('#5865f2', 'trend') }] }, 200);
    },
    gifs: q => {
      const colors = ['#5865f2', '#eb459e', '#23a55a', '#f0b232', '#e67e22', '#00a8fc', '#9b59b6', '#f23f43'];
      const word = q || 'топ';
      return delay(colors.map((c, i) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 ${100 + (i % 3) * 30}"><rect width="100%" height="100%" fill="${c}"/><text x="80" y="60" font-size="22" font-family="sans-serif" fill="#fff" text-anchor="middle">${word} ${i + 1}</text></svg>`;
        return { url: `https://tenor.com/view/demo-gif-${i + 1}`, gif_src: 'data:image/svg+xml,' + encodeURIComponent(svg), width: 160, height: 100 + (i % 3) * 30 };
      }), 300);
    },
    ack: async () => {},
    guildInfo: g => delay({ id: g, roles: [
      { id: '500000000000000001', name: 'Owner', color: 0xeb459e, hoist: true, position: 3 },
      { id: '500000000000000002', name: 'Admins', color: 0x9b59b6, hoist: true, position: 2 },
      { id: '500000000000000003', name: 'Pooling Team', color: 0x23a55a, hoist: true, position: 1 },
    ] }),
    guildMembers: () => delay([]),
    subscribeMembers: (gid) => {
      const M = (u, roles, status, acts = []) => ({ member: { user: u, roles, presence: { status, activities: acts } } });
      const items = [
        { group: { id: '500000000000000001', count: 1 } }, M(users.lena, ['500000000000000001'], 'online', [{ type: 2, name: 'Spotify', details: 'Lo-fi beats' }]),
        { group: { id: '500000000000000002', count: 2 } }, M(users.max, ['500000000000000002'], 'dnd', [{ type: 0, name: 'Wuthering Waves' }]),
        M(users.anya, ['500000000000000002'], 'idle', [{ type: 4, state: 'рисую', emoji: { name: '🎨' } }]),
        { group: { id: '500000000000000003', count: 1 } }, M(users.bot, ['500000000000000003'], 'online'),
        { group: { id: 'offline', count: 1 } }, M(users.me, [], 'offline'),
      ];
      emit('GUILD_MEMBER_LIST_UPDATE', { guild_id: gid, id: 'everyone', ops: [{ op: 'SYNC', range: [0, 99], items }], groups: [] });
      return delay(null);
    },
    setStatus: () => delay(null),
    api: (method, path, body) => {
      const m = path.match(/^\/channels\/(\d+)$/);
      if (m && method === 'PATCH') { for (const list of Object.values(channels)) { const c = list.find(x => x.id === m[1]); if (c) { Object.assign(c, body); emit('CHANNEL_UPDATE', { ...c, guild_id: Object.keys(channels).find(k => channels[k] === list) }); } } }
      return delay({});
    },
    requestMembers: (gid, q) => { const all = [users.anya, users.max, users.lena, users.bot].filter(u => (u.global_name || u.username).toLowerCase().includes((q || '').toLowerCase())); emit('GUILD_MEMBERS_CHUNK', { guild_id: gid, members: all.map(u => ({ user: u, roles: [] })) }); return delay(null); },
    requestMemberIds: () => delay(null),
    guildFolders: () => delay([{ id: 7, name: 'Игры', color: 15844367, guild_ids: [g2] }, { id: null, guild_ids: [g1] }]),
    saveFolders: () => delay(null),
    onEvent: cb => { evCb = cb; },
    onStatus: cb => {
      stCb = cb;
      setTimeout(() => {
        stCb({ state: 'ready', info: { status: 'online' } });
        emit('READ_STATE', { unread: ['300000000000000022', '300000000000000041'], mentions: { '300000000000000022': 2, '400000000000000002': 1 },
          guildOf: { '300000000000000022': g1, '300000000000000041': g2, '400000000000000002': '@me' } });
        emit('VOICE_STATES', { [g1]: [
          { user_id: users.max.id, channel_id: '300000000000000031', mute: true, deaf: false },
          { user_id: users.lena.id, channel_id: '300000000000000031', mute: false, deaf: false, stream: true },
        ] });
        emit('PRESENCES', [
          { id: users.anya.id, status: 'idle', activities: [{ type: 4, state: 'рисую', emoji: { name: '🎨' } }] },
          { id: users.max.id, status: 'dnd', activities: [{ type: 0, name: 'Wuthering Waves' }] },
          { id: users.lena.id, status: 'online', activities: [] },
        ]);
      }, 300);
    },
  };
}
