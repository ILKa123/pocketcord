//! Тонкий асинхронный клиент Discord REST API v10.

use reqwest::{header, multipart::Form, Client, Method, Response, StatusCode};
use serde_json::Value;
use std::time::Duration;

const API: &str = "https://discord.com/api/v10";

pub struct Api {
    http: Client,
    token: String,
}

async fn parse(resp: Response) -> Result<Value, String> {
    let status = resp.status();
    if status == StatusCode::NO_CONTENT {
        return Ok(Value::Null);
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v["message"].as_str().map(str::to_owned))
            .unwrap_or(text);
        return Err(format!("{}: {}", status.as_u16(), msg));
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}

impl Api {
    pub fn new(token: String) -> Self {
        let ua = if token.starts_with("Bot ") {
            "DiscordBot (https://github.com/pocketcord, 0.1)"
        } else {
            "Pocketcord/0.1"
        };
        let http = Client::builder()
            .user_agent(ua)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_nodelay(true)
            .timeout(Duration::from_secs(30))
            .build()
            .expect("http client");
        Self { http, token }
    }

    pub fn is_bot(&self) -> bool {
        self.token.starts_with("Bot ")
    }

    /// Запрос с автоматическим ожиданием при 429 (rate limit).
    pub async fn req(&self, method: Method, path: &str, body: Option<Value>) -> Result<Value, String> {
        let url = format!("{API}{path}");
        for _ in 0..4 {
            let mut rb = self
                .http
                .request(method.clone(), &url)
                .header(header::AUTHORIZATION, &self.token);
            if let Some(b) = &body {
                rb = rb.json(b);
            } else if method == Method::PUT || method == Method::POST {
                rb = rb.header(header::CONTENT_LENGTH, "0");
            }
            let resp = rb.send().await.map_err(|e| format!("сеть: {e}"))?;
            if resp.status() == StatusCode::TOO_MANY_REQUESTS {
                let v: Value = resp.json().await.unwrap_or(Value::Null);
                let secs = v["retry_after"].as_f64().unwrap_or(1.0).clamp(0.05, 30.0);
                tokio::time::sleep(Duration::from_secs_f64(secs)).await;
                continue;
            }
            return parse(resp).await;
        }
        Err("слишком много запросов, попробуйте позже".into())
    }

    pub async fn get(&self, path: &str) -> Result<Value, String> {
        self.req(Method::GET, path, None).await
    }

    /// Отправка файлов (multipart/form-data).
    pub async fn multipart(&self, path: &str, form: Form) -> Result<Value, String> {
        let resp = self
            .http
            .post(format!("{API}{path}"))
            .header(header::AUTHORIZATION, &self.token)
            .multipart(form)
            .timeout(Duration::from_secs(180))
            .send()
            .await
            .map_err(|e| format!("сеть: {e}"))?;
        parse(resp).await
    }
}
