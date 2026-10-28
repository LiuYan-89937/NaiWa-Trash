use crate::{model::*, platform, store::Store};
use std::path::PathBuf;

pub struct Service {
    pub runtime: RuntimeConfig,
    store: Store,
    document: Document,
    trash: Option<TrashSnapshot>,
    problem: Option<String>,
    last_attempt: Option<u64>,
}

impl Service {
    pub fn new(store: Store, defaults: Defaults) -> Result<Self, String> {
        let document = store.load(&defaults)?;
        Ok(Self { runtime: defaults.runtime, store, document, trash: None,
            problem: None, last_attempt: None })
    }

    pub fn state(&self) -> AppSnapshot {
        AppSnapshot {
            settings: self.document.settings.clone(), lifetime_items: self.document.lifetime_items,
            cleanup_runs: self.document.cleanup_runs, last_cleanup_at: self.document.last_cleanup_at,
            history: self.document.history.clone(), trash: self.trash.clone(), problem: self.problem.clone(),
        }
    }

    fn record(&mut self, kind: &str, message: String) {
        self.document.history.insert(0, HistoryEntry { at: now(), kind: kind.into(), message });
        self.document.history.truncate(self.runtime.history_limit);
    }

    fn persist(&mut self) -> Option<String> {
        self.store.save(&self.document).err().map(|error| {
            let message = format!("操作已执行，但记录保存失败：{error}");
            self.problem = Some(message.clone());
            message
        })
    }

    pub fn settings(&mut self, settings: Settings) -> Result<AppSnapshot, String> {
        settings.validate()?;
        let mut updated = self.document.clone();
        if updated.settings.cleanup != settings.cleanup {
            updated.cycle_started_at = now();
        }
        updated.settings = settings;
        self.store.save(&updated)?;
        self.document = updated;
        self.last_attempt = None;
        Ok(self.state())
    }

    pub fn refresh(&mut self) -> Result<TrashSnapshot, String> {
        match platform::snapshot() {
            Ok(snapshot) => {
                self.trash = Some(snapshot.clone());
                self.problem = snapshot.detail.clone();
                Ok(snapshot)
            }
            Err(error) => { self.problem = Some(error.clone()); Err(error) }
        }
    }

    pub fn feed(&mut self, paths: Vec<PathBuf>) -> FeedReceipt {
        // Parent/child drops are one operation: moving the parent already moves its contents.
        // Do not canonicalize symlinks; recycling a link must not recycle its target.
        let mut paths = paths;
        paths.sort();
        paths.dedup();
        let roots: Vec<_> = paths.iter().filter(|path|
            !paths.iter().any(|parent| parent != *path && path.starts_with(parent))
        ).cloned().collect();
        let mut accepted = Vec::new();
        let mut failures = Vec::new();
        for path in roots {
            let name = path.file_name().unwrap_or(path.as_os_str()).to_string_lossy().to_string();
            match platform::recycle(&path) {
                Ok(()) => accepted.push(name),
                Err(message) => failures.push(ItemFailure { name, message }),
            }
        }
        let count = accepted.len() as u64;
        self.document.lifetime_items = self.document.lifetime_items.saturating_add(count);
        if count > 0 { self.record("feed", format!("已将 {count} 项移入系统废纸篓。")); }
        for failure in &failures {
            self.record("error", format!("{}：{}", failure.name, failure.message));
        }
        let reaction = if count == 0 { None } else {
            let policy = &self.document.settings.reactions;
            let probability = (policy.laugh_base + policy.laugh_per_extra_item * (count - 1) as f64)
                .min(policy.laugh_cap);
            Some(if rand::random::<f64>() < probability {
                "laugh".into()
            } else {
                let pool = &self.runtime.reaction_actions;
                pool[rand::random_range(0..pool.len())].clone()
            })
        };
        let warning = self.persist();
        FeedReceipt { accepted, failures, reaction, warning }
    }

    pub fn cleanup(&mut self, reason: &str) -> Result<CleanupReceipt, String> {
        self.last_attempt = Some(now());
        let before = self.refresh()?;
        if before.items == 0 {
            self.last_attempt = None;
            self.document.cycle_started_at = now();
            let warning = self.persist();
            return Ok(CleanupReceipt { removed_items: 0, remaining_items: 0,
                reason: reason.into(), warning });
        }
        if let Err(error) = platform::empty_all() {
            self.problem = Some(error.clone());
            self.record("error", format!("清理失败：{error}"));
            self.persist();
            return Err(error);
        }
        let after = self.refresh()?;
        self.last_attempt = None;
        let removed = before.items.saturating_sub(after.items);
        if removed > 0 {
            self.document.cleanup_runs = self.document.cleanup_runs.saturating_add(1);
            self.document.last_cleanup_at = Some(now());
            self.document.cycle_started_at = now();
            self.record("cleanup", format!("已清理整个系统废纸篓：减少 {removed} 项，剩余 {} 项。触发条件：{reason}", after.items));
        }
        let warning = self.persist();
        Ok(CleanupReceipt { removed_items: removed, remaining_items: after.items,
            reason: reason.into(), warning })
    }

    pub fn tick(&mut self) -> Option<Result<CleanupReceipt, String>> {
        let policy = self.document.settings.cleanup.clone();
        if !policy.enabled || self.last_attempt.is_some_and(|t|
            now().saturating_sub(t) < self.runtime.retry_seconds) {
            return None;
        }
        let snapshot = match self.refresh() {
            Ok(snapshot) => snapshot,
            Err(error) => { self.last_attempt = Some(now()); return Some(Err(error)); }
        };
        let reason = if policy.item_limit.is_some_and(|n| snapshot.items >= n) {
            Some("达到项目数量阈值")
        } else if policy.size_limit_mib.is_some_and(|n|
            snapshot.bytes.is_some_and(|bytes| bytes >= n * 1024 * 1024)) {
            Some("达到容量阈值")
        } else if policy.interval_hours.is_some_and(|hours|
            now().saturating_sub(self.document.cycle_started_at) as f64 >= hours * 3600.0) {
            Some("达到定时清理间隔")
        } else { None };
        reason.map(|reason| self.cleanup(reason))
    }
}
