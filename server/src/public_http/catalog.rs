use serde_json::{Value, json};
use std::sync::LazyLock;

// Metadata only: deck construction and card counts belong to the engine adapter.
static VARIANTS: LazyLock<Vec<Value>> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../packages/game/src/json/variants.json"
    ))
    .expect("checked-in variant catalog")
});
static CHARACTERS: LazyLock<Vec<Value>> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../packages/game/src/json/characters.json"
    ))
    .expect("checked-in character catalog")
});
pub(super) fn variants() -> &'static [Value] {
    &VARIANTS
}
pub(super) fn variant(id: i64) -> Option<&'static Value> {
    VARIANTS.iter().find(|v| v["id"].as_i64() == Some(id))
}
pub(super) fn stack(v: &Value) -> i64 {
    v["stackSize"].as_i64().unwrap_or(5)
}
pub(super) fn max_score(v: &Value) -> i64 {
    stack(v) * v["suits"].as_array().expect("catalog suits").len() as i64
}
pub(super) fn character(id: i64) -> Option<&'static str> {
    CHARACTERS
        .iter()
        .find(|v| v["id"].as_i64() == Some(id))
        .and_then(|v| v["name"].as_str())
}
pub(super) fn metadata(full: bool) -> Value {
    VARIANTS.iter().map(|v| {
        (v["id"].to_string(), if full {
            json!({"name":v["name"],"suits":v["suits"],"stackSize":stack(v),"maxScore":max_score(v)})
        } else { v["name"].clone() })
    }).collect()
}
