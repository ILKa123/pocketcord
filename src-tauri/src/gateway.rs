//! Discord Gateway (WebSocket): сообщения в реальном времени.
//! События пересылаются в интерфейс через `app.emit("discord", {t, d})`.

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const URL: &str = "wss://gateway.discord.gg/?v=10&encoding=json";

/// Какие события отправлять в UI (остальное отбрасывается в Rust, чтобы не грузить WebView).
const FORWARD: &[&str] = &[
    "MESSAGE_CREATE",
    "MESSAGE_UPDATE",
    "MESSAGE_DELETE",
    "MESSAGE_REACTION_ADD",
    "MESSAGE_REACTION_REMOVE",
    "CHANNEL_PINS_UPDATE",
    "TYPING_START",
    "CHANNEL_CREATE",
    "CHANNEL_UPDATE",
    "CHANNEL_DELETE",
    "GUILD_MEMBER_LIST_UPDATE",
    "GUILD_MEMBERS_CHUNK",
    "MESSAGE_ACK", // прочитано в другом клиенте -> убираем уведомление
    "VOICE_STATE_UPDATE",
    "GUILD_UPDATE",
    "GUILD_ROLE_CREATE",
    "GUILD_ROLE_UPDATE",
    "GUILD_ROLE_DELETE",
    "GUILD_MEMBER_UPDATE",
];

// GUILDS | GUILD_MESSAGES | GUILD_MESSAGE_REACTIONS | GUILD_MESSAGE_TYPING
// | DIRECT_MESSAGES | DIRECT_MESSAGE_REACTIONS | MESSAGE_CONTENT
const BOT_INTENTS: u64 = 1 | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12) | (1 << 13) | (1 << 15);

enum End {
    Reconnect,
    Fatal(String),
}

type BoxErr = Box<dyn std::error::Error + Send + Sync>;

fn snow(v: &Value) -> u64 {
    v.as_str().and_then(|s| s.parse().ok()).unwrap_or(0)
}

/// Непрочитанные каналы и счётчики упоминаний из READY.
/// Канал непрочитан, если в нём есть сообщение новее последнего прочитанного.
/// Каналы, где у вас нет отметки прочтения (часто это скрытые от вас каналы), не подсвечиваем.
fn read_state(d: &Value) -> Value {
    let rs = &d["read_state"];
    let entries = if rs.is_array() { rs.clone() } else { rs["entries"].clone() };
    let mut read = std::collections::HashMap::new();
    for e in entries.as_array().into_iter().flatten() {
        if let Some(id) = e["id"].as_str() {
            read.insert(id.to_string(), (snow(&e["last_message_id"]), e["mention_count"].as_u64().unwrap_or(0)));
        }
    }
    // заглушённые серверы и каналы — без «непрочитано» (как в Discord)
    let mut muted = std::collections::HashSet::new();
    let ugs = &d["user_guild_settings"];
    let ugs = if ugs.is_array() { ugs.clone() } else { ugs["entries"].clone() };
    for s in ugs.as_array().into_iter().flatten() {
        let gid = s["guild_id"].as_str().unwrap_or("@me").to_string();
        if s["muted"].as_bool() == Some(true) { muted.insert(gid); }
        for o in s["channel_overrides"].as_array().into_iter().flatten() {
            if o["muted"].as_bool() == Some(true) { if let Some(c) = o["channel_id"].as_str() { muted.insert(c.to_string()); } }
        }
    }
    let mut unread = Vec::new();
    let mut mentions = serde_json::Map::new();
    let mut guild_of = serde_json::Map::new();
    let mut check = |cid: &str, gid: &str, last: u64, parent: Option<&str>| {
        if let Some(&(seen, mc)) = read.get(cid) {
            if mc > 0 { mentions.insert(cid.to_string(), json!(mc)); }
            let is_muted = muted.contains(gid) || muted.contains(cid) || parent.map(|p| muted.contains(p)).unwrap_or(false);
            if last > seen && !is_muted { unread.push(json!(cid)); }
        }
        guild_of.insert(cid.to_string(), json!(gid));
    };
    for g in d["guilds"].as_array().into_iter().flatten() {
        let gid = g["id"].as_str().unwrap_or("");
        for c in g["channels"].as_array().into_iter().flatten() {
            let t = c["type"].as_u64().unwrap_or(0);
            if t != 0 && t != 5 { continue; }
            if let Some(cid) = c["id"].as_str() { check(cid, gid, snow(&c["last_message_id"]), c["parent_id"].as_str()); }
        }
    }
    for c in d["private_channels"].as_array().into_iter().flatten() {
        if let Some(cid) = c["id"].as_str() {
            // в ЛС непрочитанное = упоминание (как в Discord: красный счётчик на значке ЛС)
            let last = snow(&c["last_message_id"]);
            if let Some(&(seen, _)) = read.get(cid) {
                if last > seen && !muted.contains(cid) { unread.push(json!(cid)); }
            }
            guild_of.insert(cid.to_string(), json!("@me"));
        }
    }
    json!({ "unread": unread, "mentions": mentions, "guildOf": guild_of })
}

/// Голосовые состояния по серверам: {guild_id: [{user_id, channel_id, mute, deaf, stream, video}]}.
fn voice_states(guilds: &[Value]) -> Value {
    let mut out = serde_json::Map::new();
    for g in guilds {
        let Some(gid) = g["id"].as_str() else { continue };
        let list: Vec<Value> = g["voice_states"].as_array().into_iter().flatten()
            .filter(|v| !v["channel_id"].is_null())
            .map(|v| json!({
                "user_id": v["user_id"], "channel_id": v["channel_id"],
                "mute": v["self_mute"].as_bool().unwrap_or(false) || v["mute"].as_bool().unwrap_or(false),
                "deaf": v["self_deaf"].as_bool().unwrap_or(false) || v["deaf"].as_bool().unwrap_or(false),
                "stream": v["self_stream"], "video": v["self_video"]
            }))
            .collect();
        if !list.is_empty() { out.insert(gid.to_string(), json!(list)); }
    }
    Value::Object(out)
}

/// Только то, что нужно для решения «показывать ли уведомление».
fn compact_guild_settings(e: &Value) -> Value {
    let overrides: Vec<Value> = e["channel_overrides"].as_array().into_iter().flatten()
        .map(|o| json!({
            "channel_id": o["channel_id"], "muted": o["muted"],
            "mute_end": o["mute_config"]["end_time"], "level": o["message_notifications"]
        }))
        .collect();
    json!({
        "guild_id": e["guild_id"], "muted": e["muted"], "mute_end": e["mute_config"]["end_time"],
        "level": e["message_notifications"], "suppress_everyone": e["suppress_everyone"],
        "suppress_roles": e["suppress_roles"], "channel_overrides": overrides
    })
}

/// Сжимаем presence до {id, status, activities}, чтобы не гонять в WebView лишнее.
fn compact_presence(p: &Value) -> Option<Value> {
    let id = p["user"]["id"].as_str().or_else(|| p["user_id"].as_str())?;
    let st = p["status"].as_str()?;
    let acts: Vec<Value> = p["activities"].as_array().into_iter().flatten()
        .map(|a| json!({ "type": a["type"], "name": a["name"], "state": a["state"], "details": a["details"], "emoji": a["emoji"] }))
        .collect();
    Some(json!({ "id": id, "status": st, "activities": acts }))
}

fn status(app: &AppHandle, state: &str, extra: Value) {
    let _ = app.emit("gateway_status", json!({ "state": state, "info": extra }));
}

/// Команда от UI «приложение снова на экране»: проверить связь немедленно.
pub const WAKE: &str = "__wake__";

/// Данные для возобновления сессии (RESUME): после обрыва Discord досылает пропущенные события,
/// и не нужно заново проходить IDENTIFY — переподключение занимает доли секунды.
#[derive(Default)]
struct Resume {
    session_id: Option<String>,
    url: Option<String>,
    seq: Value,
}

/// `outbox` — сырые JSON-пакеты от UI (например, подписка на список участников) и WAKE.
pub async fn run(app: AppHandle, token: String, mut outbox: UnboundedReceiver<String>) {
    let mut backoff = 0u64;
    let mut resume = Resume::default();
    loop {
        status(&app, "connecting", Value::Null);
        match session(&app, &token, &mut outbox, &mut resume).await {
            Ok(End::Fatal(why)) => {
                status(&app, "fatal", json!(why));
                return;
            }
            Ok(End::Reconnect) => backoff = 0, // обычный обрыв — сразу заново
            Err(e) => {
                status(&app, "error", json!(e.to_string()));
                backoff = (backoff * 2).clamp(1, 15);
            }
        }
        // ждём, но просыпаемся сразу, если пользователь вернулся в приложение
        if backoff > 0 {
            let sleep = tokio::time::sleep(Duration::from_secs(backoff));
            tokio::pin!(sleep);
            loop {
                tokio::select! {
                    _ = &mut sleep => break,
                    m = outbox.recv() => match m {
                        Some(s) if s == WAKE => { backoff = 0; break; }
                        Some(_) => continue, // пакеты для старой сессии не нужны
                        None => return,
                    }
                }
            }
        }
    }
}

async fn session(
    app: &AppHandle,
    token: &str,
    outbox: &mut UnboundedReceiver<String>,
    resume: &mut Resume,
) -> Result<End, BoxErr> {
    let url = match &resume.url {
        Some(u) if resume.session_id.is_some() => format!("{}/?v=10&encoding=json", u.trim_end_matches('/')),
        _ => URL.to_string(),
    };
    let (ws, _) = tokio::time::timeout(Duration::from_secs(10), connect_async(&url))
        .await
        .map_err(|_| "таймаут подключения")??;
    let (mut tx, mut rx) = ws.split();

    // 1. HELLO -> интервал heartbeat
    let hello: Value = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            match rx.next().await {
                Some(Ok(Message::Text(t))) => return serde_json::from_str::<Value>(&t).map_err(BoxErr::from),
                Some(Ok(_)) => continue,
                Some(Err(e)) => return Err(e.into()),
                None => return Err("соединение закрыто".into()),
            }
        }
    })
    .await
    .map_err(|_| "нет HELLO")??;
    let interval = hello["d"]["heartbeat_interval"].as_u64().unwrap_or(41_250);

    let raw_token = token.trim_start_matches("Bot ");
    // 2. RESUME, если есть сессия, иначе IDENTIFY
    if let Some(sid) = &resume.session_id {
        let d = json!({ "token": raw_token, "session_id": sid, "seq": resume.seq });
        tx.send(Message::Text(json!({ "op": 6, "d": d }).to_string())).await?;
    } else {
        let mut d = json!({
            "token": raw_token,
            "properties": { "os": std::env::consts::OS, "browser": "pocketcord", "device": "pocketcord" },
            "compress": false,
            "large_threshold": 50
        });
        if token.starts_with("Bot ") {
            d["intents"] = json!(BOT_INTENTS);
        }
        tx.send(Message::Text(json!({ "op": 2, "d": d }).to_string())).await?;
    }

    let mut hb = tokio::time::interval(Duration::from_millis(interval));
    // после «заморозки» процесса не палим пачкой пропущенных тиков — связь проверяет WAKE
    hb.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    hb.tick().await; // первый тик срабатывает сразу
    let mut acked = true;
    // после WAKE ждём ответа на heartbeat не дольше 5 секунд
    let mut wake_deadline: Option<tokio::time::Instant> = None;

    loop {
        tokio::select! {
            _ = hb.tick() => {
                if !acked {
                    return Ok(End::Reconnect); // «зомби»-соединение
                }
                acked = false;
                tx.send(Message::Text(json!({ "op": 1, "d": resume.seq }).to_string())).await?;
            }
            _ = async { tokio::time::sleep_until(wake_deadline.unwrap()).await }, if wake_deadline.is_some() => {
                if !acked {
                    return Ok(End::Reconnect); // после сна соединение мёртвое — сразу заново
                }
                wake_deadline = None;
            }
            Some(out) = outbox.recv() => {
                if out == WAKE {
                    acked = false;
                    wake_deadline = Some(tokio::time::Instant::now() + Duration::from_secs(5));
                    if tx.send(Message::Text(json!({ "op": 1, "d": resume.seq }).to_string())).await.is_err() {
                        return Ok(End::Reconnect);
                    }
                } else {
                    tx.send(Message::Text(out)).await?;
                }
            }
            msg = rx.next() => {
                let text = match msg {
                    Some(Ok(Message::Text(t))) => t,
                    Some(Ok(Message::Close(frame))) => {
                        let code = frame.map(|f| u16::from(f.code)).unwrap_or(1000);
                        // 4004 неверный токен, 4010-4014 — неверные шарды/интенты
                        return Ok(match code {
                            4004 => End::Fatal("Неверный токен".into()),
                            4013 | 4014 => End::Fatal("Боту не выданы привилегированные интенты (Message Content)".into()),
                            // неверный seq / сессия истекла — следующий раз через IDENTIFY
                            4007 | 4009 => { *resume = Resume::default(); End::Reconnect }
                            _ => End::Reconnect,
                        });
                    }
                    Some(Ok(_)) => continue,
                    Some(Err(e)) => return Err(e.into()),
                    None => return Ok(End::Reconnect),
                };
                let v: Value = serde_json::from_str(&text)?;
                if !v["s"].is_null() {
                    resume.seq = v["s"].clone();
                }
                match v["op"].as_u64() {
                    Some(0) => {
                        let t = v["t"].as_str().unwrap_or("");
                        if t == "RESUMED" {
                            status(app, "ready", json!({ "resumed": true }));
                        } else if t == "READY" {
                            let d = &v["d"];
                            resume.session_id = d["session_id"].as_str().map(String::from);
                            resume.url = d["resume_gateway_url"].as_str().map(String::from);
                            // свой статус: из настроек или активной сессии
                            let me_status = d["user_settings"]["status"].as_str()
                                .or_else(|| d["sessions"][0]["status"].as_str())
                                .unwrap_or("");
                            status(app, "ready", json!({ "user": d["user"], "status": me_status }));
                            // статусы друзей (пользовательский токен)
                            let list: Vec<Value> = d["presences"].as_array().into_iter().flatten()
                                .filter_map(|p| compact_presence(p)).collect();
                            if !list.is_empty() {
                                let _ = app.emit("discord", json!({ "t": "PRESENCES", "d": list }));
                            }
                            // мои роли на серверах — чтобы упоминание роли тоже давало уведомление
                            let mut roles = serde_json::Map::new();
                            let guilds = d["guilds"].as_array().cloned().unwrap_or_default();
                            let merged = d["merged_members"].as_array().cloned().unwrap_or_default();
                            for (i, g) in guilds.iter().enumerate() {
                                if let Some(id) = g["id"].as_str() {
                                    roles.insert(id.to_string(), merged.get(i).map(|m| m[0]["roles"].clone()).unwrap_or(json!([])));
                                }
                            }
                            let _ = app.emit("discord", json!({ "t": "MY_ROLES", "d": roles }));
                            // непрочитанное и упоминания с прошлого раза (синхронно с официальным Discord)
                            let _ = app.emit("discord", json!({ "t": "READ_STATE", "d": read_state(d) }));
                            // кто сидит в голосовых каналах
                            let _ = app.emit("discord", json!({ "t": "VOICE_STATES", "d": voice_states(&guilds) }));
                            // настройки уведомлений (заглушенные серверы/каналы) — для шторки
                            let ugs = &d["user_guild_settings"];
                            let entries = if ugs.is_array() { ugs.clone() } else { ugs["entries"].clone() };
                            if let Some(arr) = entries.as_array() {
                                let list: Vec<Value> = arr.iter().map(compact_guild_settings).collect();
                                let _ = app.emit("discord", json!({ "t": "GUILD_SETTINGS", "d": list }));
                            }
                        } else if t == "USER_GUILD_SETTINGS_UPDATE" {
                            let _ = app.emit("discord", json!({ "t": "GUILD_SETTINGS", "d": [compact_guild_settings(&v["d"])] }));
                        } else if t == "READY_SUPPLEMENTAL" {
                            // у пользовательских аккаунтов голосовые состояния приходят здесь
                            let sg = v["d"]["guilds"].as_array().cloned().unwrap_or_default();
                            let vs = voice_states(&sg);
                            if vs.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
                                let _ = app.emit("discord", json!({ "t": "VOICE_STATES", "d": vs }));
                            }
                            // друзья + участники серверов, которых Discord считает «важными»
                            let mp = &v["d"]["merged_presences"];
                            let mut list: Vec<Value> = mp["friends"].as_array().into_iter().flatten()
                                .filter_map(|p| compact_presence(p)).collect();
                            for g in mp["guilds"].as_array().into_iter().flatten() {
                                list.extend(g.as_array().into_iter().flatten().filter_map(|p| compact_presence(p)));
                            }
                            if !list.is_empty() {
                                let _ = app.emit("discord", json!({ "t": "PRESENCES", "d": list }));
                            }
                        } else if t == "PRESENCE_UPDATE" {
                            if let Some(p) = compact_presence(&v["d"]) {
                                let _ = app.emit("discord", json!({ "t": "PRESENCES", "d": [p] }));
                            }
                        } else if FORWARD.contains(&t) {
                            let _ = app.emit("discord", json!({ "t": t, "d": v["d"] }));
                        }
                    }
                    Some(1) => {
                        tx.send(Message::Text(json!({ "op": 1, "d": resume.seq }).to_string())).await?;
                    }
                    Some(11) => { acked = true; wake_deadline = None; }
                    Some(7) => return Ok(End::Reconnect), // Discord просит переподключиться — RESUME
                    Some(9) => {
                        // сессию нельзя возобновить — новый IDENTIFY (Discord просит подождать 1–5 с)
                        if !v["d"].as_bool().unwrap_or(false) {
                            *resume = Resume::default();
                            tokio::time::sleep(Duration::from_millis(1500)).await;
                        }
                        return Ok(End::Reconnect);
                    }
                    _ => {}
                }
            }
        }
    }
}
