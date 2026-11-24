//! Pocketcord: Rust-ядро. Вся сеть (REST + Gateway) живёт здесь,
//! интерфейс (ui/) только вызывает команды и слушает события.

mod gateway;
mod rest;

use reqwest::Method;
use rest::Api;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{async_runtime::JoinHandle, AppHandle, Manager, State};

#[derive(Default)]
struct AppState {
    api: RwLock<Option<Arc<Api>>>,
    gateway: Mutex<Option<JoinHandle<()>>>,
    /// Очередь пакетов в Gateway (подписка на список участников и т.п.)
    gw_tx: Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>,
}

type R<T = Value> = Result<T, String>;

fn api(state: &State<'_, AppState>) -> R<Arc<Api>> {
    state
        .api
        .read()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "не выполнен вход".to_string())
}

/// Snowflake-ID — только цифры (защита от подстановки в путь).
fn sf(s: &str) -> R<&str> {
    if !s.is_empty() && s.len() <= 24 && s.bytes().all(|b| b.is_ascii_digit()) {
        Ok(s)
    } else {
        Err(format!("неверный id: {s}"))
    }
}

fn pct(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~:".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

fn token_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("session.token"))
}

async fn start(app: &AppHandle, state: &State<'_, AppState>, token: String) -> R {
    let client = Arc::new(Api::new(token.clone()));
    let mut me = client.get("/users/@me").await?;
    me["is_bot_session"] = json!(client.is_bot());
    *state.api.write().map_err(|e| e.to_string())? = Some(client);

    let (gtx, grx) = tokio::sync::mpsc::unbounded_channel::<String>();
    *state.gw_tx.lock().map_err(|e| e.to_string())? = Some(gtx);
    let handle = tauri::async_runtime::spawn(gateway::run(app.clone(), token, grx));
    if let Some(old) = state.gateway.lock().map_err(|e| e.to_string())?.replace(handle) {
        old.abort();
    }
    Ok(me)
}

#[tauri::command]
async fn login(app: AppHandle, state: State<'_, AppState>, token: String) -> R {
    // Чистим то, что часто прилипает при копировании: пробелы, переносы, кавычки.
    let raw = token.trim().trim_matches('"');
    let (bot, rest) = match raw.strip_prefix("Bot ") {
        Some(r) => (true, r),
        None => (false, raw),
    };
    let clean: String = rest
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '"' && *c != '\'')
        .collect();
    let token = if bot { format!("Bot {clean}") } else { clean };
    if token.len() < 20 {
        return Err("токен слишком короткий".into());
    }
    let me = start(&app, &state, token.clone()).await?;
    if let Some(p) = token_file(&app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(p, &token);
    }
    Ok(me)
}

#[tauri::command]
async fn restore(app: AppHandle, state: State<'_, AppState>) -> R {
    let Some(token) = token_file(&app).and_then(|p| std::fs::read_to_string(p).ok()) else {
        return Ok(Value::Null);
    };
    start(&app, &state, token.trim().to_string()).await
}

#[tauri::command]
async fn logout(app: AppHandle, state: State<'_, AppState>) -> R<()> {
    if let Some(h) = state.gateway.lock().map_err(|e| e.to_string())?.take() {
        h.abort();
    }
    *state.gw_tx.lock().map_err(|e| e.to_string())? = None;
    *state.api.write().map_err(|e| e.to_string())? = None;
    if let Some(p) = token_file(&app) {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

#[tauri::command]
async fn guilds(state: State<'_, AppState>) -> R {
    api(&state)?.get("/users/@me/guilds?with_counts=false").await
}

#[tauri::command]
async fn dms(state: State<'_, AppState>) -> R {
    api(&state)?.get("/users/@me/channels").await
}

#[tauri::command]
async fn channels(state: State<'_, AppState>, guild_id: String) -> R {
    api(&state)?.get(&format!("/guilds/{}/channels", sf(&guild_id)?)).await
}

#[tauri::command]
async fn messages(
    state: State<'_, AppState>,
    channel_id: String,
    before: Option<String>,
    around: Option<String>,
) -> R {
    let mut path = format!("/channels/{}/messages?limit=50", sf(&channel_id)?);
    if let Some(b) = before {
        path.push_str(&format!("&before={}", sf(&b)?));
    } else if let Some(a) = around {
        path.push_str(&format!("&around={}", sf(&a)?));
    }
    api(&state)?.get(&path).await
}

#[tauri::command]
async fn pins(state: State<'_, AppState>, channel_id: String) -> R {
    api(&state)?.get(&format!("/channels/{}/pins", sf(&channel_id)?)).await
}

fn message_body(content: String, reply_to: Option<String>, nonce: Option<String>) -> R {
    let mut body = json!({ "content": content });
    if let Some(n) = nonce {
        // nonce связывает «отправляется…» в UI с событием MESSAGE_CREATE
        body["nonce"] = json!(n.chars().filter(char::is_ascii_digit).take(25).collect::<String>());
    }
    if let Some(r) = reply_to {
        body["message_reference"] = json!({ "message_id": sf(&r)?, "fail_if_not_exists": false });
    }
    Ok(body)
}

#[tauri::command]
async fn send_message(
    state: State<'_, AppState>,
    channel_id: String,
    content: String,
    reply_to: Option<String>,
    nonce: Option<String>,
) -> R {
    let body = message_body(content, reply_to, nonce)?;
    api(&state)?
        .req(Method::POST, &format!("/channels/{}/messages", sf(&channel_id)?), Some(body))
        .await
}

#[derive(serde::Deserialize)]
struct UploadFile {
    name: String,
    mime: Option<String>,
    /// содержимое в base64
    data: String,
}

/// Сообщение с файлами (кнопка «+»).
#[tauri::command]
async fn upload(
    state: State<'_, AppState>,
    channel_id: String,
    content: String,
    reply_to: Option<String>,
    nonce: Option<String>,
    files: Vec<UploadFile>,
) -> R {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use reqwest::multipart::{Form, Part};

    if files.is_empty() || files.len() > 10 {
        return Err("можно прикрепить от 1 до 10 файлов".into());
    }
    let mut payload = message_body(content, reply_to, nonce)?;
    let mut meta = Vec::new();
    let mut form = Form::new();
    for (i, f) in files.into_iter().enumerate() {
        let bytes = STANDARD
            .decode(f.data.as_bytes())
            .map_err(|e| format!("файл {}: {e}", f.name))?;
        meta.push(json!({ "id": i, "filename": f.name }));
        let mut part = Part::bytes(bytes).file_name(f.name);
        if let Some(m) = f.mime.filter(|m| !m.is_empty()) {
            part = part.mime_str(&m).map_err(|e| e.to_string())?;
        }
        form = form.part(format!("files[{i}]"), part);
    }
    payload["attachments"] = json!(meta);
    form = form.text("payload_json", payload.to_string());
    api(&state)?
        .multipart(&format!("/channels/{}/messages", sf(&channel_id)?), form)
        .await
}

/// Поиск сообщений по серверу или в ЛС (только для пользовательского токена).
#[tauri::command]
async fn search(
    state: State<'_, AppState>,
    guild_id: Option<String>,
    channel_id: Option<String>,
    query: String,
    offset: Option<u32>,
) -> R {
    let base = match (&guild_id, &channel_id) {
        (Some(g), _) => format!("/guilds/{}/messages/search", sf(g)?),
        (None, Some(c)) => format!("/channels/{}/messages/search", sf(c)?),
        _ => return Err("не указано, где искать".into()),
    };
    let mut path = format!("{base}?content={}", pct(query.trim()));
    if let Some(o) = offset {
        path.push_str(&format!("&offset={o}"));
    }
    api(&state)?.get(&path).await
}

/// Профиль пользователя (баннер, «о себе», общие сервера/друзья).
#[tauri::command]
async fn profile(state: State<'_, AppState>, user_id: String, guild_id: Option<String>) -> R {
    let api = api(&state)?;
    let uid = sf(&user_id)?;
    if !api.is_bot() {
        let mut path = format!(
            "/users/{uid}/profile?with_mutual_guilds=true&with_mutual_friends=true&with_mutual_friends_count=true"
        );
        if let Some(g) = &guild_id {
            path.push_str(&format!("&guild_id={}", sf(g)?));
        }
        if let Ok(v) = api.get(&path).await {
            return Ok(v);
        }
    }
    let user = api.get(&format!("/users/{uid}")).await?;
    Ok(json!({ "user": user }))
}

#[tauri::command]
async fn guild_emojis(state: State<'_, AppState>, guild_id: String) -> R {
    api(&state)?.get(&format!("/guilds/{}/emojis", sf(&guild_id)?)).await
}

/// GIF через встроенный поиск Discord (Tenor). Без запроса — популярные.
#[tauri::command]
async fn gifs(state: State<'_, AppState>, query: Option<String>) -> R {
    let path = match query.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        Some(q) => format!("/gifs/search?q={}&media_format=mp4&provider=tenor&locale=ru", pct(q)),
        None => "/gifs/trending-gifs?media_format=mp4&locale=ru".to_string(),
    };
    api(&state)?.get(&path).await
}

/// Плитки категорий GIF, как в Discord: {categories: [{name, src}], gifs: [...]}.
#[tauri::command]
async fn gif_categories(state: State<'_, AppState>) -> R {
    api(&state)?.get("/gifs/trending?provider=tenor&locale=ru&media_format=mp4").await
}

/// Сервер целиком (нужны роли: названия, цвета, порядок).
#[tauri::command]
async fn guild_info(state: State<'_, AppState>, guild_id: String) -> R {
    api(&state)?.get(&format!("/guilds/{}", sf(&guild_id)?)).await
}

/// Участники через REST — для ботов (нужен Server Members Intent).
#[tauri::command]
async fn guild_members(state: State<'_, AppState>, guild_id: String) -> R {
    api(&state)?
        .get(&format!("/guilds/{}/members?limit=1000", sf(&guild_id)?))
        .await
}

/// Подписка на список участников канала (как правая панель на ПК).
/// Ответ приходит событием GUILD_MEMBER_LIST_UPDATE. Только для аккаунта.
/// Запрос к API для управления своими серверами (каналы, роли, участники, название/иконка)
/// и своим профилем. Разрешены только пути серверов, каналов и /users/@me.
#[tauri::command]
async fn api_request(state: State<'_, AppState>, method: String, path: String, body: Option<Value>) -> R {
    // + свой профиль (имя, аватар, «обо мне», местоимения) для вкладки «Профиль» в настройках
    let ok_path = (path.starts_with("/guilds/") || path.starts_with("/channels/")
        || path == "/users/@me" || path == "/users/@me/profile"
        // «Часто используемые» эмодзи аккаунта — только чтение
        || (path == "/users/@me/settings-proto/2" && method == "GET"))
        && !path.contains("..") && !path.contains("://") && path.is_ascii();
    if !ok_path {
        return Err("недопустимый путь".into());
    }
    let m = match method.as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        "PATCH" => Method::PATCH,
        "PUT" => Method::PUT,
        "DELETE" => Method::DELETE,
        _ => return Err("недопустимый метод".into()),
    };
    api(&state)?.req(m, &path, body).await
}

/// Поиск участников сервера по началу ника (op 8) — для подсказок при наборе «@».
/// Ответ приходит событием GUILD_MEMBERS_CHUNK.
#[tauri::command]
async fn request_members(state: State<'_, AppState>, guild_id: String, query: Option<String>, user_ids: Option<Vec<String>>) -> R {
    let g = sf(&guild_id)?.to_string();
    let mut d = json!({ "guild_id": [g], "limit": 10, "presences": false });
    if let Some(ids) = user_ids {
        let ids: Vec<String> = ids.iter().filter_map(|u| sf(u).ok().map(|s| s.to_string())).take(100).collect();
        d["user_ids"] = json!(ids);
        d.as_object_mut().unwrap().remove("limit");
    } else {
        d["query"] = json!(query.unwrap_or_default());
    }
    let packet = json!({ "op": 8, "d": d }).to_string();
    if let Some(tx) = state.gw_tx.lock().map_err(|e| e.to_string())?.as_ref() {
        let _ = tx.send(packet);
    }
    Ok(Value::Null)
}

/// Приложение снова на экране: проверить соединение сразу, а не ждать heartbeat (до 41 с).
#[tauri::command]
async fn gateway_wake(state: State<'_, AppState>) -> R {
    if let Some(tx) = state.gw_tx.lock().map_err(|e| e.to_string())?.as_ref() {
        let _ = tx.send(gateway::WAKE.to_string());
    }
    Ok(Value::Null)
}

#[tauri::command]
async fn subscribe_members(state: State<'_, AppState>, guild_id: String, channel_id: String) -> R {
    let g = sf(&guild_id)?.to_string();
    let c = sf(&channel_id)?.to_string();
    let mut chans = serde_json::Map::new();
    chans.insert(c, json!([[0, 99]]));
    let mut subs = serde_json::Map::new();
    subs.insert(g, json!({ "typing": true, "activities": true, "threads": true, "channels": chans }));
    let packet = json!({ "op": 37, "d": { "subscriptions": subs } }).to_string();
    state
        .gw_tx
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .ok_or_else(|| "нет соединения".to_string())?
        .send(packet)
        .map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

/// Папки серверов из настроек аккаунта (те же, что в официальном Discord).
/// Для бота папок нет — возвращаем null, UI хранит их локально.
#[tauri::command]
async fn guild_folders(state: State<'_, AppState>) -> R {
    let api = api(&state)?;
    if api.is_bot() {
        return Ok(Value::Null);
    }
    let s = api.get("/users/@me/settings").await?;
    Ok(s["guild_folders"].clone())
}

#[tauri::command]
async fn save_folders(state: State<'_, AppState>, folders: Value) -> R {
    let api = api(&state)?;
    if api.is_bot() {
        return Ok(Value::Null);
    }
    if !folders.is_array() {
        return Err("неверный формат папок".into());
    }
    api.req(Method::PATCH, "/users/@me/settings", Some(json!({ "guild_folders": folders }))).await?;
    Ok(Value::Null)
}

/// Свой статус: online / idle / dnd / invisible.
/// Шлём op 3 в Gateway (сразу) и, для аккаунта, сохраняем в настройках — так статус
/// виден и в официальном Discord.
#[tauri::command]
async fn set_status(state: State<'_, AppState>, status: String) -> R {
    if !["online", "idle", "dnd", "invisible"].contains(&status.as_str()) {
        return Err("неизвестный статус".into());
    }
    let packet = json!({ "op": 3, "d": { "since": 0, "activities": [], "status": status, "afk": false } }).to_string();
    if let Some(tx) = state.gw_tx.lock().map_err(|e| e.to_string())?.as_ref() {
        let _ = tx.send(packet);
    }
    let api = api(&state)?;
    if !api.is_bot() {
        api.req(Method::PATCH, "/users/@me/settings", Some(json!({ "status": status }))).await?;
    }
    Ok(Value::Null)
}

/// Отметка «прочитано» — синхронизируется с официальным Discord.
#[tauri::command]
async fn ack(state: State<'_, AppState>, channel_id: String, message_id: String) -> R {
    let api = api(&state)?;
    if api.is_bot() {
        return Ok(Value::Null);
    }
    let path = format!("/channels/{}/messages/{}/ack", sf(&channel_id)?, sf(&message_id)?);
    api.req(Method::POST, &path, Some(json!({ "token": null }))).await
}

#[tauri::command]
async fn edit_message(state: State<'_, AppState>, channel_id: String, message_id: String, content: String) -> R {
    let path = format!("/channels/{}/messages/{}", sf(&channel_id)?, sf(&message_id)?);
    api(&state)?.req(Method::PATCH, &path, Some(json!({ "content": content }))).await
}

#[tauri::command]
async fn delete_message(state: State<'_, AppState>, channel_id: String, message_id: String) -> R {
    let path = format!("/channels/{}/messages/{}", sf(&channel_id)?, sf(&message_id)?);
    api(&state)?.req(Method::DELETE, &path, None).await
}

#[tauri::command]
async fn set_pin(state: State<'_, AppState>, channel_id: String, message_id: String, pinned: bool) -> R {
    let path = format!("/channels/{}/pins/{}", sf(&channel_id)?, sf(&message_id)?);
    let m = if pinned { Method::PUT } else { Method::DELETE };
    api(&state)?.req(m, &path, None).await
}

#[tauri::command]
async fn react(state: State<'_, AppState>, channel_id: String, message_id: String, emoji: String, add: bool) -> R {
    let path = format!(
        "/channels/{}/messages/{}/reactions/{}/@me",
        sf(&channel_id)?,
        sf(&message_id)?,
        pct(&emoji)
    );
    let m = if add { Method::PUT } else { Method::DELETE };
    api(&state)?.req(m, &path, None).await
}

#[tauri::command]
async fn typing(state: State<'_, AppState>, channel_id: String) -> R {
    let path = format!("/channels/{}/typing", sf(&channel_id)?);
    api(&state)?.req(Method::POST, &path, None).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            login,
            restore,
            logout,
            guilds,
            dms,
            channels,
            messages,
            pins,
            send_message,
            edit_message,
            delete_message,
            set_pin,
            react,
            typing,
            upload,
            search,
            profile,
            guild_emojis,
            gifs,
            gif_categories,
            gateway_wake,
            api_request,
            request_members,
            ack,
            guild_info,
            guild_members,
            subscribe_members,
            set_status,
            guild_folders,
            save_folders
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска приложения");
}
