// Handler for test chat via admin API
use crate::admin::error::AdminError;
use crate::admin::state::AdminState;
use crate::proxy::protocol::get_adapter;
use crate::services::log_service::{insert_test_usage_log, TestUsageLogInput};
use axum::extract::{Json, State};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize)]
pub struct TestChatRequest {
    pub entry_id: String,
    pub messages: Vec<TestChatMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct TestChatResponse {
    pub content: String,
    pub latency_ms: u64,
    pub usage: Option<TestChatUsage>,
}

#[derive(Debug, Serialize)]
pub struct TestChatUsage {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
}

fn record_test_chat(
    db: &crate::database::Database,
    app_handle: Option<&tauri::AppHandle>,
    entry: &crate::database::ApiEntry,
    channel: &crate::database::Channel,
    prompt_tokens: i64,
    completion_tokens: i64,
    latency_ms: i64,
    status_code: i32,
    success: bool,
    error_message: Option<&str>,
    error_kind: Option<&str>,
    response_ms: Option<&str>,
    error_preview: Option<&str>,
) {
    insert_test_usage_log(
        db,
        app_handle,
        TestUsageLogInput {
            entry,
            channel,
            operation: "test_chat",
            log_group: "test_chat",
            prompt_tokens,
            completion_tokens,
            latency_ms,
            status_code,
            success,
            error_message,
            error_kind,
            response_ms,
            error_preview,
        },
    );
}

pub async fn test_chat(
    State(state): State<AdminState>,
    Json(payload): Json<TestChatRequest>,
) -> Result<Json<TestChatResponse>, AdminError> {
    // Ensure runtime is available
    let runtime = state
        .runtime
        .as_ref()
        .ok_or_else(|| AdminError::BadRequest("Admin runtime not initialized".to_string()))?;
    let db = runtime.db.clone();

    // Get all entries for routing (including disabled)
    let entries = db.get_entries_for_routing_all()?;
    let entry = entries
        .iter()
        .find(|e| e.id == payload.entry_id)
        .ok_or_else(|| AdminError::NotFound(format!("Entry {} not found", payload.entry_id)))?
        .clone();

    // Get channel info
    let channel = db.get_channel(&entry.channel_id)?;

    // Get protocol adapter
    let adapter = get_adapter(&channel.api_type);

    // Build URL and request body
    let url = adapter.build_chat_url(&channel.base_url, &entry.model);
    let mut upstream_body = json!({
        "model": entry.model,
        "messages": payload.messages,
        "stream": false,
    });
    adapter.transform_request(&mut upstream_body, &entry.model);

    let start = Instant::now();
    let client = reqwest::Client::new();
    let request = adapter
        .apply_auth(client.post(&url), &channel.api_key)
        .json(&upstream_body);
    let response = match request.send().await {
        Ok(response) => response,
        Err(e) => {
            let latency_ms = start.elapsed().as_millis() as i64;
            let message = format!("Network request failed: {e}");
            record_test_chat(
                &db,
                state.app_handle.as_ref(),
                &entry,
                &channel,
                0,
                0,
                latency_ms,
                502,
                false,
                Some(&message),
                Some("network_error"),
                Some("X"),
                None,
            );
            return Err(AdminError::Internal(message));
        }
    };

    if !response.status().is_success() {
        let latency_ms = start.elapsed().as_millis() as i64;
        let status = response.status();
        let status_code = status.as_u16() as i32;
        let body = response.text().await.unwrap_or_default();
        let message = format!("Upstream error {status}: {body}");
        let log_message = format!("upstream_http_{}", status.as_u16());
        let error_preview = body.chars().take(500).collect::<String>();
        record_test_chat(
            &db,
            state.app_handle.as_ref(),
            &entry,
            &channel,
            0,
            0,
            latency_ms,
            status_code,
            false,
            Some(&log_message),
            Some("http_error"),
            Some("X"),
            Some(&error_preview),
        );
        return Err(AdminError::Internal(message));
    }

    let latency_ms = start.elapsed().as_millis() as u64;
    let mut json_body: serde_json::Value = match response.json().await {
        Ok(body) => body,
        Err(e) => {
            let message = format!("Failed to parse response: {e}");
            record_test_chat(
                &db,
                state.app_handle.as_ref(),
                &entry,
                &channel,
                0,
                0,
                latency_ms as i64,
                502,
                false,
                Some(&message),
                Some("parse_error"),
                Some("X"),
                None,
            );
            return Err(AdminError::Internal(message));
        }
    };
    // Transform response if needed (e.g., Claude -> OpenAI format)
    adapter.transform_response(&mut json_body);

    // Extract content
    let content = json_body
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    if content.trim().is_empty() {
        let message = "empty_response_content";
        record_test_chat(
            &db,
            state.app_handle.as_ref(),
            &entry,
            &channel,
            0,
            0,
            latency_ms as i64,
            200,
            false,
            Some(message),
            Some("empty_content"),
            Some("X"),
            None,
        );
        return Err(AdminError::Internal(message.to_string()));
    }

    // Extract usage if present
    let usage = json_body.get("usage").map(|u| TestChatUsage {
        prompt_tokens: u.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0),
        completion_tokens: u
            .get("completion_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        total_tokens: u.get("total_tokens").and_then(|v| v.as_i64()).unwrap_or(0),
    });

    let response_ms = latency_ms.to_string();
    record_test_chat(
        &db,
        state.app_handle.as_ref(),
        &entry,
        &channel,
        usage.as_ref().map(|u| u.prompt_tokens).unwrap_or(0),
        usage.as_ref().map(|u| u.completion_tokens).unwrap_or(0),
        latency_ms as i64,
        200,
        true,
        None,
        None,
        Some(&response_ms),
        None,
    );

    Ok(Json(TestChatResponse {
        content,
        latency_ms,
        usage,
    }))
}
