use hanabi_protocol::PublicVariant;
use serde_json::Value;
use std::{collections::BTreeMap, sync::LazyLock};

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
pub(super) fn names() -> BTreeMap<String, String> {
    VARIANTS
        .iter()
        .map(|v| {
            (
                v["id"].to_string(),
                v["name"].as_str().expect("variant name").into(),
            )
        })
        .collect()
}
pub(super) fn metadata() -> BTreeMap<String, PublicVariant> {
    let text = |value: &Value| value.as_str().expect("catalog text").to_owned();
    VARIANTS
        .iter()
        .map(|v| {
            let variant = PublicVariant {
                name: text(&v["name"]),
                suits: v["suits"]
                    .as_array()
                    .expect("catalog suits")
                    .iter()
                    .map(text)
                    .collect(),
                stack_size: u8::try_from(stack(v)).expect("catalog stack size"),
                max_score: u32::try_from(max_score(v)).expect("catalog max score"),
            };
            (v["id"].to_string(), variant)
        })
        .collect()
}
