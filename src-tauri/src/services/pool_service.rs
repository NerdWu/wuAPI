use crate::database::dao::PaginatedResult;
use crate::database::{ApiEntry, Database, EntryCatalogMetaInput};
use crate::error::AppError;
use crate::proxy::protocol::get_adapter;
use crate::services::log_service::{extract_usage_tokens, insert_test_usage_log, TestUsageLogInput};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Instant;

#[derive(Deserialize)]
pub struct CreateEntryParams {
    pub channel_id: String,
    pub model: String,
    pub display_name: Option<String>,
    #[serde(default)]
    pub provider_logo: String,
    #[serde(default)]
    pub release_date: String,
    #[serde(default)]
    pub model_meta_zh: String,
    #[serde(default)]
    pub model_meta_en: String,
    #[serde(default)]
    pub group_name: Option<String>,
}

#[derive(Deserialize)]
pub struct CatalogMetaUpdate {
    pub id: String,
    pub display_name: String,
    pub provider_logo: String,
    pub release_date: String,
    pub model_meta_zh: String,
    pub model_meta_en: String,
}

#[derive(Serialize)]
pub struct TestLatencyResult {
    pub status: String,
    pub response_ms: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_detail: Option<String>,
}

/// List all API entries from the database.
pub fn list_entries(db: &Database) -> Result<Vec<ApiEntry>, AppError> {
    db.list_entries()
}

pub fn list_entries_paginated(
    db: &Database,
    page: i32,
    page_size: i32,
    group_name: Option<&str>,
    search: Option<&str>,
    channel_id: Option<&str>,
) -> Result<PaginatedResult<ApiEntry>, AppError> {
    db.list_entries_paginated(page, page_size, group_name, search, channel_id)
}

/// Toggle an entry's enabled state.
/// When enabling, clears cooldown and failure count for a fresh start.
pub fn toggle_entry(
    db: &Database,
    failure_counts: &std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<String, u32>>>,
    id: &str,
    enabled: bool,
) -> Result<(), AppError> {
    toggle_entry_inner(db, failure_counts, id, enabled)
}

/// Batch toggle entries — single IPC call to avoid N concurrent IPC calls.
pub fn batch_toggle_entries(
    db: &Database,
    failure_counts: &std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<String, u32>>>,
    ids: &[String],
    enabled: bool,
) -> Result<(), AppError> {
    for id in ids {
        toggle_entry_inner(db, failure_counts, id, enabled)?;
    }
    Ok(())
}

fn toggle_entry_inner(
    db: &Database,
    failure_counts: &std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<String, u32>>>,
    id: &str,
    enabled: bool,
) -> Result<(), AppError> {
    db.toggle_entry(id, enabled)?;
    if enabled {
        let _ = db.set_entry_cooldown(id, None);
        if let Ok(mut counts) = failure_counts.try_write() {
            counts.remove(id);
        }
    }
    Ok(())
}

/// Reorder entries by the given ordered IDs.
pub fn reorder_entries(db: &Database, ordered_ids: &[String]) -> Result<(), AppError> {
    db.reorder_entries(ordered_ids)
}

/// Delete an entry by ID.
pub fn delete_entry(db: &Database, id: &str) -> Result<(), AppError> {
    db.delete_entry(id)
}

/// Create a new API entry. Also syncs channel model list.
pub fn create_entry(db: &Database, params: CreateEntryParams) -> Result<ApiEntry, AppError> {
    let display_name = params.display_name.as_deref().unwrap_or(&params.model);
    let group_name = params.group_name.as_deref().unwrap_or("auto");
    let entry = db.create_entry_auto(
        &params.channel_id,
        &params.model,
        display_name,
        &params.provider_logo,
        &params.release_date,
        &params.model_meta_zh,
        &params.model_meta_en,
        group_name,
    )?;
    let _ = db.add_channel_model_if_missing(
        &params.channel_id,
        &params.model,
        entry.owned_by.as_deref(),
    );
    Ok(entry)
}

/// Convert command-layer catalog meta updates to database-layer inputs.
fn to_catalog_meta_inputs(items: Vec<CatalogMetaUpdate>) -> Vec<EntryCatalogMetaInput> {
    items
        .into_iter()
        .map(|item| EntryCatalogMetaInput {
            id: item.id,
            display_name: item.display_name,
            provider_logo: item.provider_logo,
            release_date: item.release_date,
            model_meta_zh: item.model_meta_zh,
            model_meta_en: item.model_meta_en,
        })
        .collect()
}

/// Backfill catalog metadata for multiple entries.
pub fn backfill_entry_catalog_meta(
    db: &Database,
    items: Vec<CatalogMetaUpdate>,
) -> Result<(), AppError> {
    let inputs = to_catalog_meta_inputs(items);
    db.backfill_entry_catalog_meta(&inputs)
}

fn truncate_for_log(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect::<String>()
}

fn record_latency_test(
    db: &Database,
    entry: &ApiEntry,
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
        None,
        TestUsageLogInput {
            entry,
            channel,
            operation: "test_latency",
            log_group: "pool_latency_test",
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

/// Test latency for a specific entry.
pub async fn test_entry_latency(
    db: &Database,
    entry_id: &str,
) -> Result<TestLatencyResult, AppError> {
    let entries = db.get_entries_for_routing_all()?;
    let entry = entries
        .iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| AppError::NotFound(format!("Entry {entry_id} not found")))?
        .clone();

    let channel = db.get_channel(&entry.channel_id)?;
    if !channel.enabled {
        let error_detail = "Channel disabled".to_string();
        let _ = db.update_entry_response_ms(entry_id, "X");
        let _ = db.toggle_entry(entry_id, false);
        record_latency_test(
            db,
            &entry,
            &channel,
            0,
            0,
            0,
            400,
            false,
            Some(&error_detail),
            Some("channel_disabled"),
            Some("X"),
            None,
        );
        return Ok(TestLatencyResult {
            status: "disabled".to_string(),
            response_ms: "X".to_string(),
            error_detail: Some(error_detail),
        });
    }

    let adapter = get_adapter(&channel.api_type);
    let url = adapter.build_chat_url(&channel.base_url, &entry.model);

    let mut upstream_body = json!({
        "model": entry.model,
        "messages": [{"role": "user", "content": "请只回复 OK"}],
        "max_tokens": 10,
        "temperature": 0.0,
        "stream": false,
    });
    adapter.transform_request(&mut upstream_body, &entry.model);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| AppError::Network(format!("HTTP client: {e}")))?;

    let request = adapter
        .apply_auth(client.post(&url), &channel.api_key)
        .json(&upstream_body);

    let start = Instant::now();
    let response = match request.send().await {
        Ok(response) => response,
        Err(e) => {
            let latency_ms = start.elapsed().as_millis() as i64;
            let error_detail = format!("Request failed: {e}");
            let _ = db.update_entry_response_ms(entry_id, "X");
            let _ = db.toggle_entry(entry_id, false);
            record_latency_test(
                db,
                &entry,
                &channel,
                0,
                0,
                latency_ms,
                502,
                false,
                Some(&error_detail),
                Some("network_error"),
                Some("X"),
                None,
            );
            return Ok(TestLatencyResult {
                status: "failed".to_string(),
                response_ms: "X".to_string(),
                error_detail: Some(error_detail),
            });
        }
    };

    let latency_ms = start.elapsed().as_millis() as u64;
    let status = response.status();

    if status.as_u16() != 200 {
        let status_code = status.as_u16() as i32;
        let body = response.text().await.unwrap_or_default();
        let error_detail = format!("Upstream HTTP {status}");
        let error_preview = truncate_for_log(&body, 500);
        let _ = db.update_entry_response_ms(entry_id, "X");
        let _ = db.toggle_entry(entry_id, false);
        record_latency_test(
            db,
            &entry,
            &channel,
            0,
            0,
            latency_ms as i64,
            status_code,
            false,
            Some(&error_detail),
            Some("http_error"),
            Some("X"),
            Some(&error_preview),
        );
        return Ok(TestLatencyResult {
            status: "failed".to_string(),
            response_ms: "X".to_string(),
            error_detail: Some(error_detail),
        });
    }

    let body = match response.text().await {
        Ok(body) => body,
        Err(e) => {
            let error_detail = format!("Read response failed: {e}");
            let _ = db.update_entry_response_ms(entry_id, "X");
            let _ = db.toggle_entry(entry_id, false);
            record_latency_test(
                db,
                &entry,
                &channel,
                0,
                0,
                latency_ms as i64,
                502,
                false,
                Some(&error_detail),
                Some("read_error"),
                Some("X"),
                None,
            );
            return Ok(TestLatencyResult {
                status: "failed".to_string(),
                response_ms: "X".to_string(),
                error_detail: Some(error_detail),
            });
        }
    };

    if body.trim().is_empty() {
        let error_detail = "Empty response".to_string();
        let _ = db.update_entry_response_ms(entry_id, "X");
        let _ = db.toggle_entry(entry_id, false);
        record_latency_test(
            db,
            &entry,
            &channel,
            0,
            0,
            latency_ms as i64,
            200,
            false,
            Some(&error_detail),
            Some("empty_response"),
            Some("X"),
            None,
        );
        return Ok(TestLatencyResult {
            status: "failed".to_string(),
            response_ms: "X".to_string(),
            error_detail: Some(error_detail),
        });
    }

    let parsed_body = serde_json::from_str::<serde_json::Value>(&body).ok();
    let (prompt_tokens, completion_tokens) = parsed_body
        .as_ref()
        .map(extract_usage_tokens)
        .unwrap_or((0, 0));
    let response_ms = latency_ms.to_string();
    db.update_entry_response_ms(entry_id, &response_ms)?;
    record_latency_test(
        db,
        &entry,
        &channel,
        prompt_tokens,
        completion_tokens,
        latency_ms as i64,
        200,
        true,
        None,
        None,
        Some(&response_ms),
        None,
    );

    Ok(TestLatencyResult {
        status: "ok".to_string(),
        response_ms,
        error_detail: None,
    })
}

/// Update response time for an entry.
pub fn update_entry_response_ms(
    db: &Database,
    entry_id: &str,
    response_ms: &str,
) -> Result<(), AppError> {
    db.update_entry_response_ms(entry_id, response_ms)
}

/// Get all distinct group names from the database.
pub fn get_all_groups(db: &Database) -> Result<Vec<String>, AppError> {
    db.get_all_group_names()
}

/// Update the group_name for a specific entry.
pub fn update_entry_group(db: &Database, id: &str, group_name: &str) -> Result<(), AppError> {
    db.update_entry_group(id, group_name)
}
