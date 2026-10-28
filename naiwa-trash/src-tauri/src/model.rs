use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

#[derive(Clone, Deserialize)]
pub struct Defaults {
    pub settings: Settings,
    pub runtime: RuntimeConfig,
}

#[derive(Clone, Deserialize)]
pub struct RuntimeConfig {
    pub monitor_seconds: u64,
    pub retry_seconds: u64,
    pub history_limit: usize,
    pub max_pending_drops: usize,
    pub drop_ttl_seconds: u64,
    pub feed_reaction: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub cleanup: CleanupPolicy,
    pub pet_scale: f64,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct CleanupPolicy {
    pub enabled: bool,
    pub interval_hours: Option<f64>,
    pub item_limit: Option<u64>,
    pub size_limit_mib: Option<u64>,
}

impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !self.pet_scale.is_finite() || !(0.6..=1.5).contains(&self.pet_scale) {
            return Err("奶蛙大小应在 60% 到 150% 之间。".into());
        }
        if self.cleanup.interval_hours.is_some_and(|n| !n.is_finite() || n < 0.01 || n > 8760.0)
            || self.cleanup.item_limit == Some(0)
            || self.cleanup.size_limit_mib.is_some_and(|n| n == 0 || n > u64::MAX / (1024 * 1024)) {
            return Err("清理间隔须为 0.01 至 8760 小时；数量和容量阈值须大于零。".into());
        }
        if self.cleanup.enabled && self.cleanup.interval_hours.is_none()
            && self.cleanup.item_limit.is_none() && self.cleanup.size_limit_mib.is_none() {
            return Err("启用自动清理时，至少选择一个触发条件。".into());
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub at: u64,
    pub kind: String,
    pub message: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Document {
    pub settings: Settings,
    pub lifetime_items: u64,
    pub cleanup_runs: u64,
    pub last_cleanup_at: Option<u64>,
    pub cycle_started_at: u64,
    pub history: Vec<HistoryEntry>,
}

#[derive(Clone, Serialize)]
pub struct TrashSnapshot {
    pub items: u64,
    pub bytes: Option<u64>,
    pub measured_at: u64,
    pub detail: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct AppSnapshot {
    pub settings: Settings,
    pub lifetime_items: u64,
    pub cleanup_runs: u64,
    pub last_cleanup_at: Option<u64>,
    pub history: Vec<HistoryEntry>,
    pub trash: Option<TrashSnapshot>,
    pub problem: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct ItemFailure {
    pub name: String,
    pub message: String,
}

#[derive(Clone, Serialize)]
pub struct FeedReceipt {
    pub accepted: Vec<String>,
    pub failures: Vec<ItemFailure>,
    pub reaction: Option<String>,
    pub warning: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct CleanupReceipt {
    pub removed_items: u64,
    pub remaining_items: u64,
    pub reason: String,
    pub warning: Option<String>,
}
