use hanabi_engine::Variant;
use hanabi_protocol::{PublicVariant, VariantNames};
use std::collections::BTreeMap;

// Metadata only: deck construction and card counts belong to the engine adapter.
pub(super) fn variants() -> &'static [Variant] {
    hanabi_engine::variants()
}
pub(super) fn variant(id: i64) -> Option<&'static Variant> {
    let id = u32::try_from(id).ok()?;
    hanabi_engine::get_variant_by_id(id).ok()
}
pub(super) fn character(id: i64) -> Option<&'static str> {
    hanabi_engine::characters()
        .iter()
        .find(|character| i64::from(character.id.0) == id)
        .map(|character| character.name.as_str())
}
pub(super) fn names() -> VariantNames {
    VariantNames(
        variants()
            .iter()
            .map(|v| (v.id.to_string(), v.name.clone()))
            .collect(),
    )
}
pub(super) fn metadata() -> BTreeMap<String, PublicVariant> {
    variants()
        .iter()
        .map(|v| {
            let variant = PublicVariant {
                name: v.name.clone(),
                // The catalog names each reversed suit by its suit's name with this suffix.
                suits: v
                    .suits
                    .iter()
                    .map(|suit| {
                        if suit.reversed {
                            format!("{} Reversed", suit.name)
                        } else {
                            suit.name.clone()
                        }
                    })
                    .collect(),
                stack_size: u8::try_from(v.stack_size).expect("catalog stack size"),
                max_score: v.max_score,
            };
            (v.id.to_string(), variant)
        })
        .collect()
}
