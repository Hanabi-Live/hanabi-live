use serde::Serialize;
use serde_json::{Value, json};
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
pub fn recovery() -> Value {
    let operations = STORAGE_METRICS.snapshot();
    let pending: u64 = operations
        .as_object()
        .into_iter()
        .flat_map(|o| o.values())
        .map(|v| v["inFlight"].as_u64().unwrap_or(0))
        .sum();
    json!({"operations":operations,"encodedBytes":ENCODED_BYTES.load(Ordering::Relaxed),
        "failedCheckpoints":FAILED_CHECKPOINTS.load(Ordering::Relaxed),"pendingTransactions":pending})
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
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Metric {
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
    pub fn snapshot(&self) -> Value {
        json!(
            *self
                .0
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
        )
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

pub async fn memory() -> anyhow::Result<Value> {
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
    Ok(json!({"residentBytes":field("VmRSS:")?,"virtualBytes":field("VmSize:")?}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn completion_and_cancellation_are_recorded() {
        let metrics = Metrics::default();
        let mut success = metrics.start("checkpoint");
        let failed = metrics.start("checkpoint");
        assert_eq!(metrics.snapshot()["checkpoint"]["inFlight"], 2);
        success.success();
        drop(success);
        drop(failed);
        let report = metrics.snapshot();
        assert_eq!(report["checkpoint"]["inFlight"], 0);
        assert_eq!(report["checkpoint"]["completed"], 2);
        assert_eq!(report["checkpoint"]["failed"], 1);
        assert_eq!(report["checkpoint"]["durationBucketsSeconds"]["+Inf"], 2);
    }
}
