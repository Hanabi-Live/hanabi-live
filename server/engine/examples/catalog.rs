//! Prints the variants the rules use, as JSON. A test compares them with the game library's.

fn main() -> anyhow::Result<()> {
    println!("{}", serde_json::to_string(hanabi_engine::variants())?);
    Ok(())
}
