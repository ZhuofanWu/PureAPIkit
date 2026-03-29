use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Method,
};
use serde::{Deserialize, Serialize};
use tauri::{LogicalSize, WebviewWindowBuilder};

const WINDOW_WIDTH_RATIO: f64 = 0.72;
const WINDOW_HEIGHT_RATIO: f64 = 0.78;
const WINDOW_MIN_WIDTH: f64 = 960.0;
const WINDOW_MIN_HEIGHT: f64 = 640.0;
const WINDOW_MAX_WIDTH: f64 = 1600.0;
const WINDOW_MAX_HEIGHT: f64 = 980.0;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendRequestPayload {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SendResponsePayload {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    duration_ms: u128,
}

fn parse_method(method: &str) -> Result<Method, String> {
    match method {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        "PUT" => Ok(Method::PUT),
        "DELETE" => Ok(Method::DELETE),
        _ => Err("Only GET, POST, PUT, and DELETE are supported.".into()),
    }
}

fn parse_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut header_map = HeaderMap::new();

    for (key, value) in headers {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|_| format!("Invalid header name: {key}"))?;
        let header_value =
            HeaderValue::from_str(value).map_err(|_| format!("Invalid header value for: {key}"))?;

        header_map.insert(name, header_value);
    }

    Ok(header_map)
}

fn map_request_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        return "Request timed out.".into();
    }

    if error.is_connect() {
        return format!("Connection failed: {error}");
    }

    format!("Request failed: {error}")
}

fn clamp_window_dimension(available: f64, ratio: f64, min: f64, max: f64) -> f64 {
    let desired = available * ratio;
    desired.min(max).max(min.min(available))
}

fn compute_startup_window_size<R: tauri::Runtime>(app: &tauri::App<R>) -> LogicalSize<f64> {
    let fallback_width = 1280.0;
    let fallback_height = 820.0;

    let Ok(Some(monitor)) = app.primary_monitor() else {
        return LogicalSize::new(fallback_width, fallback_height);
    };

    let available_size = monitor
        .work_area()
        .size
        .to_logical::<f64>(monitor.scale_factor());

    LogicalSize::new(
        clamp_window_dimension(
            available_size.width,
            WINDOW_WIDTH_RATIO,
            WINDOW_MIN_WIDTH,
            WINDOW_MAX_WIDTH,
        ),
        clamp_window_dimension(
            available_size.height,
            WINDOW_HEIGHT_RATIO,
            WINDOW_MIN_HEIGHT,
            WINDOW_MAX_HEIGHT,
        ),
    )
}

#[tauri::command]
async fn send_request(request: SendRequestPayload) -> Result<SendResponsePayload, String> {
    let method = parse_method(&request.method)?;
    let url = request.url.trim();

    if url.is_empty() {
        return Err("URL is required.".into());
    }

    let headers = parse_headers(&request.headers)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let started_at = Instant::now();
    let mut builder = client.request(method.clone(), url).headers(headers);

    if method != Method::GET {
        builder = builder.body(request.body.unwrap_or_default());
    }

    let response = builder.send().await.map_err(map_request_error)?;
    let status = response.status();
    let response_headers = response.headers().clone();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Failed to read response body: {error}"))?;

    let mut response_headers_map = HashMap::new();

    for (name, value) in &response_headers {
        let value = value
            .to_str()
            .map(str::to_owned)
            .unwrap_or_else(|_| format!("<{} bytes>", value.as_bytes().len()));

        response_headers_map
            .entry(name.to_string())
            .and_modify(|current: &mut String| {
                current.push('\n');
                current.push_str(&value);
            })
            .or_insert(value);
    }

    Ok(SendResponsePayload {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers: response_headers_map,
        body,
        duration_ms: started_at.elapsed().as_millis(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window_config = match app.config().app.windows.first() {
                Some(window_config) => window_config,
                None => return Ok(()),
            };
            let window_size = compute_startup_window_size(app);

            WebviewWindowBuilder::from_config(app, window_config)?
                .inner_size(window_size.width, window_size.height)
                .min_inner_size(
                    WINDOW_MIN_WIDTH.min(window_size.width),
                    WINDOW_MIN_HEIGHT.min(window_size.height),
                )
                .center()
                .build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![send_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
