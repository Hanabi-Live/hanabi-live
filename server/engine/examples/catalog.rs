//! Prints the variants the rules use, and the rules that clients build each one from, as JSON. A
//! test compares them with the game library's.

fn main() -> anyhow::Result<()> {
    let variants = hanabi_engine::variants();
    let rules = variants
        .iter()
        .map(hanabi_engine::variant_rules)
        .collect::<anyhow::Result<Vec<_>>>()?;
    println!(
        "{}",
        serde_json::json!({
            "variants": variants,
            "rules": rules,
        })
    );
    Ok(())
}
