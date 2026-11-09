use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{
        Arc, LazyLock, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};

pub static COMMAND_METRICS: LazyLock<Metrics> = LazyLock::new(Metrics::default);
pub static STORAGE_METRICS: LazyLock<Metrics> = LazyLock::new(Metrics::default);
static ENCODED_BYTES: AtomicU64 = AtomicU64::new(0);
static FAILED_CHECKPOINTS: AtomicU64 = AtomicU64::new(0);
pub fn record_checkpoint(bytes: usize) {
    ENCODED_BYTES.fetch_add(bytes as u64, Ordering::Relaxed);
}
pub fn record_checkpoint_failure() {
    FAILED_CHECKPOINTS.fetch_add(1, Ordering::Relaxed);
}
/// The state of live-table storage, which a deployment checks before it calls a server healthy.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    operations: BTreeMap<String, Metric>,
    encoded_bytes: u64,
    failed_checkpoints: u64,
    pending_transactions: u64,
    storage_initialized: bool,
    authority: &'static str,
    state_healthy: bool,
    frozen_tables: usize,
}
pub fn recovery(state_healthy: bool, frozen_tables: usize) -> Recovery {
    let operations = STORAGE_METRICS.snapshot();
    let pending_transactions = operations.values().map(|metric| metric.in_flight).sum();
    Recovery {
        operations,
        encoded_bytes: ENCODED_BYTES.load(Ordering::Relaxed),
        failed_checkpoints: FAILED_CHECKPOINTS.load(Ordering::Relaxed),
        pending_transactions,
        storage_initialized: true,
        authority: "PostgreSQL",
        state_healthy,
        frozen_tables,
    }
}

const LIMITS: [f64; 10] = [
    0.001,
    0.005,
    0.01,
    0.05,
    0.1,
    0.5,
    1.0,
    5.0,
    10.0,
    f64::INFINITY,
];
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    in_flight: u64,
    completed: u64,
    failed: u64,
    total_duration_seconds: f64,
    max_duration_seconds: f64,
    duration_buckets_seconds: BTreeMap<String, u64>,
}
#[derive(Clone, Default)]
pub struct Metrics(Arc<Mutex<BTreeMap<String, Metric>>>);
pub struct Measurement {
    metrics: Metrics,
    name: String,
    started: Instant,
    failed: bool,
}
impl Metrics {
    pub fn start(&self, name: &str) -> Measurement {
        let mut metrics = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let metric = metrics.entry(name.into()).or_insert_with(|| Metric {
            duration_buckets_seconds: LIMITS.iter().map(|limit| (bucket(*limit), 0)).collect(),
            ..Metric::default()
        });
        metric.in_flight += 1;
        Measurement {
            metrics: self.clone(),
            name: name.into(),
            started: Instant::now(),
            failed: true,
        }
    }
    pub fn snapshot(&self) -> BTreeMap<String, Metric> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }
}
impl Measurement {
    pub fn success(&mut self) {
        self.failed = false;
    }
}
impl Drop for Measurement {
    fn drop(&mut self) {
        let duration = self.started.elapsed().as_secs_f64();
        let mut metrics = self
            .metrics
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let metric = metrics.get_mut(&self.name).expect("registered operation");
        metric.in_flight -= 1;
        metric.completed += 1;
        if self.failed {
            metric.failed += 1;
        }
        metric.total_duration_seconds += duration;
        metric.max_duration_seconds = metric.max_duration_seconds.max(duration);
        for limit in LIMITS {
            if duration <= limit {
                *metric
                    .duration_buckets_seconds
                    .get_mut(&bucket(limit))
                    .expect("bucket") += 1;
            }
        }
    }
}
fn bucket(limit: f64) -> String {
    if limit.is_infinite() {
        "+Inf".into()
    } else {
        limit.to_string()
    }
}

/// `/proc/self/status` reports memory in KiB.
const BYTES_PER_KIB: u64 = crate::KIB as u64;

/// The server process's memory.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    resident_bytes: u64,
    virtual_bytes: u64,
}

pub async fn memory() -> anyhow::Result<Memory> {
    let status = tokio::fs::read_to_string("/proc/self/status").await?;
    let field = |name: &str| -> anyhow::Result<u64> {
        let line = status
            .lines()
            .find(|line| line.starts_with(name))
            .ok_or_else(|| anyhow::anyhow!("Process memory field unavailable: {name}"))?;
        Ok(line
            .split_whitespace()
            .nth(1)
            .ok_or_else(|| anyhow::anyhow!("Invalid memory report"))?
            .parse::<u64>()?
            * BYTES_PER_KIB)
    };
    Ok(Memory {
        resident_bytes: field("VmRSS:")?,
        virtual_bytes: field("VmSize:")?,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn completion_and_cancellation_are_recorded() {
        let metrics = Metrics::default();
        let mut success = metrics.start("checkpoint");
        let failed = metrics.start("checkpoint");
        assert_eq!(metrics.snapshot()["checkpoint"].in_flight, 2);
        success.success();
        drop(success);
        drop(failed);
        let report = &metrics.snapshot()["checkpoint"];
        assert_eq!(report.in_flight, 0);
        assert_eq!(report.completed, 2);
        assert_eq!(report.failed, 1);
        assert_eq!(report.duration_buckets_seconds["+Inf"], 2);
    }
}
