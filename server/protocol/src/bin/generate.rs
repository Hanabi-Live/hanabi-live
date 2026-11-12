use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

/// The game library's package, which the data package imports the game library's schemas from.
const GAME_LIBRARY: &str = "@hanabi-live/game";

/// Integer literals with at least this many digits get separators, in groups of `DIGIT_GROUP`.
const MIN_SEPARATED_DIGITS: usize = 5;
const DIGIT_GROUP: usize = 3;

fn literal(value: &Value) -> String {
    let Some(number) = value.as_i64() else {
        return value.to_string();
    };
    let raw = number.to_string();
    let digits = raw.trim_start_matches('-');
    if digits.len() < MIN_SEPARATED_DIGITS {
        return raw;
    }
    let mut result = if number < 0 {
        "-".into()
    } else {
        String::new()
    };
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(DIGIT_GROUP) {
            result.push('_');
        }
        result.push(digit);
    }
    result
}

// Only emit the JSON Schema subset actually used by our DTOs. Fail closed when a
// future annotation needs a new translation rather than silently dropping a rule.
fn expression(schema: &Value) -> Result<String> {
    // Any JSON value, such as an imported game that the server validates itself. A documented
    // field's schema carries only its description.
    if *schema == Value::Bool(true)
        || schema.as_object().is_some_and(|object| {
            !object.is_empty()
                && object
                    .keys()
                    .all(|key| matches!(key.as_str(), "description" | "title"))
        })
    {
        return Ok("z.unknown()".into());
    }
    let object = schema.as_object().context("Expected a schema object")?;
    // The schemas omit null, so each one has a single type.
    ensure!(
        !object.get("type").is_some_and(Value::is_array),
        "Only single types are supported"
    );
    for key in object.keys() {
        ensure!(
            [
                "$schema",
                "$defs",
                "$ref",
                "title",
                "description",
                "type",
                "format",
                "properties",
                "required",
                "additionalProperties",
                "items",
                "enum",
                "const",
                "oneOf",
                "minimum",
                "maximum",
                "minLength",
                "maxLength",
                "minItems",
                "maxItems",
                "default",
                "x-brand",
                "x-date",
                "pattern",
            ]
            .contains(&key.as_str()),
            "Unsupported schema keyword: {key}"
        );
    }
    let mut result = if let Some(variants) = schema["oneOf"].as_array() {
        ensure!(variants.len() >= 2, "Union needs multiple variants");
        // Serde's internally tagged enums give every variant the same required string tag.
        let discriminator = variants[0]["properties"]
            .as_object()
            .into_iter()
            .flatten()
            .find(|(name, _)| {
                variants.iter().all(|variant| {
                    variant["properties"][name.as_str()]["const"].is_string()
                        && variant["required"]
                            .as_array()
                            .is_some_and(|required| required.iter().any(|value| value == *name))
                })
            })
            .map(|(name, _)| name.clone())
            .context("Only tagged disjoint unions are supported")?;
        let mut tags = BTreeSet::new();
        for variant in variants {
            ensure!(
                tags.insert(variant["properties"][&discriminator]["const"].to_string()),
                "Duplicate union discriminator"
            );
        }
        let variants = variants
            .iter()
            .map(expression)
            .collect::<Result<Vec<_>>>()?;
        format!(
            "z.discriminatedUnion({},[{}])",
            serde_json::to_string(&discriminator)?,
            variants.join(",")
        )
    } else if let Some(value) = schema.get("const") {
        ensure!(
            value.is_string() || value.is_i64() || value.is_boolean(),
            "Only string, integer, and boolean constants are supported"
        );
        format!("z.literal({value})")
    } else if let Some(reference) = schema["$ref"].as_str() {
        let name = reference
            .strip_prefix("#/$defs/")
            .context("Only local schema references are supported")?;
        variable(name)
    } else if let Some(values) = schema["enum"].as_array() {
        ensure!(!values.is_empty(), "Empty enum");
        if values.len() == 1 {
            format!("z.literal({})", values[0])
        } else if values.iter().all(Value::is_i64) {
            // The listed integers already bound the value, so no range is appended below.
            format!("z.literal({})", serde_json::to_string(values)?)
        } else {
            ensure!(
                values.iter().all(Value::is_string),
                "Non-string enums need an explicit translation"
            );
            format!("z.enum({})", serde_json::to_string(values)?)
        }
    } else {
        match schema["type"].as_str().context("Missing schema type")? {
            "string" => "z.string()".into(),
            "integer" => {
                ensure!(
                    schema["minimum"]
                        .as_i64()
                        .is_some_and(|value| value >= -hanabi_protocol::MAX_SAFE_INTEGER)
                        && schema["maximum"]
                            .as_i64()
                            .is_some_and(|value| value <= hanabi_protocol::MAX_SAFE_INTEGER),
                    "Wire integers must declare JavaScript-safe bounds"
                );
                "z.number().int()".into()
            }
            "number" => {
                ensure!(
                    schema["format"] == "double",
                    "Wire numbers must be finite doubles"
                );
                "z.number()".into()
            }
            "boolean" => "z.boolean()".into(),
            // A map, such as variant names keyed by ID: string keys, each with a value of one schema.
            "object" if schema["additionalProperties"].is_object() => {
                ensure!(
                    schema.get("properties").is_none() && schema.get("required").is_none(),
                    "Maps cannot also have named fields"
                );
                format!(
                    "z.record(z.string(), {})",
                    expression(&schema["additionalProperties"])?
                )
            }
            "array" => format!("z.array({})", expression(&schema["items"])?),
            "object" => {
                ensure!(
                    schema["additionalProperties"] == false,
                    "Wire objects must reject unknown fields"
                );
                let required = schema["required"].as_array().cloned().unwrap_or_default();
                let mut fields = Vec::new();
                let empty = serde_json::Map::new();
                let properties = match schema.get("properties") {
                    Some(value) => value.as_object().context("Invalid object properties")?,
                    None => &empty,
                };
                for (name, property) in properties {
                    let mut field = expression(property)?;
                    if let Some(default) = property.get("default") {
                        ensure!(
                            !required.iter().any(|value| value == name),
                            "Required fields cannot acquire client-only defaults"
                        );
                        write!(field, ".default({})", default_literal(default))?;
                    } else if !required.iter().any(|value| value == name) {
                        field.push_str(".optional()");
                    }
                    fields.push(format!(
                        "{}{}: {field}",
                        doc_comment(property),
                        serde_json::to_string(name)?
                    ));
                }
                format!("z.strictObject({{{}}})", fields.join(","))
            }
            other => bail!("Unsupported schema type: {other}"),
        }
    };
    let enumerated = schema.get("enum").is_some();
    for (keyword, method) in [
        ("minimum", "min"),
        ("maximum", "max"),
        ("minLength", "min"),
        ("maxLength", "max"),
        ("minItems", "min"),
        ("maxItems", "max"),
    ] {
        if let Some(value) = schema.get(keyword)
            && !enumerated
        {
            write!(result, ".{method}({})", literal(value))?;
        }
    }
    if let Some(format) = schema["format"].as_str() {
        match format {
            "int8" | "int16" | "int32" | "int64" | "uint8" | "uint16" | "uint32" | "uint64"
            | "double" => {}
            other => bail!("Unsupported schema format: {other}"),
        }
    }
    if schema.get("x-date").is_some() {
        // Timestamps have exactly the form that the server writes: RFC 3339 in UTC, with
        // milliseconds.
        ensure!(
            result == "z.string()",
            "Dates are strings without other constraints"
        );
        result = format!(
            "z.iso.datetime({{ precision: {} }})",
            hanabi_protocol::TIMESTAMP_FRACTION_DIGITS
        );
    } else {
        ensure!(
            schema.get("pattern").is_none(),
            "Only timestamps can have a pattern"
        );
    }
    if let Some(brand) = schema.get("x-brand") {
        write!(result, ".brand<{brand}>()")?;
    }
    // Clients do not change what they receive or send, so every object and list is readonly.
    if matches!(schema["type"].as_str(), Some("object" | "array")) {
        result.push_str(".readonly()");
    }
    Ok(result)
}

/// The schema's description, which comes from the Rust doc comment, as `JSDoc` with the same line
/// breaks.
fn doc_comment(schema: &Value) -> String {
    schema
        .get("description")
        .and_then(Value::as_str)
        .map_or_else(String::new, jsdoc)
}

/// Text as a `JSDoc` comment, with the same line breaks. Rust's doc attributes start each line with
/// the space after `///`, which is removed.
fn jsdoc(text: &str) -> String {
    if text.trim().is_empty() {
        return String::new();
    }
    let lines = text
        .replace("*/", "*\\/")
        .lines()
        .map(|line| line.strip_prefix(' ').unwrap_or(line))
        .map(|line| {
            if line.is_empty() {
                " *".to_owned()
            } else {
                format!(" * {line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("\n/**\n{lines}\n */\n")
}

/// Writes whole floats, including those nested in object defaults, as JavaScript integers.
#[expect(
    clippy::cast_possible_truncation,
    reason = "only whole floats within the safe integer range are converted"
)]
fn whole_floats_as_integers(value: &Value) -> Value {
    match value {
        Value::Number(number) if number.is_f64() => number
            .as_f64()
            .filter(|number| number % 1.0 == 0.0 && number.abs() <= MAX_SAFE_INTEGER_F64)
            .map_or_else(|| value.clone(), |number| Value::from(number as i64)),
        Value::Array(values) => values.iter().map(whole_floats_as_integers).collect(),
        Value::Object(object) => object
            .iter()
            .map(|(key, value)| (key.clone(), whole_floats_as_integers(value)))
            .collect(),
        _ => value.clone(),
    }
}

#[expect(
    clippy::cast_precision_loss,
    reason = "a float represents MAX_SAFE_INTEGER exactly"
)]
const MAX_SAFE_INTEGER_F64: f64 = hanabi_protocol::MAX_SAFE_INTEGER as f64;

/// Writes a field's default as TypeScript, with whole floats written without a zero fraction.
fn default_literal(default: &Value) -> String {
    whole_floats_as_integers(default).to_string()
}

fn variable(name: &str) -> String {
    format!("{}{}Schema", name[..1].to_lowercase(), &name[1..])
}

fn clean_schema(mut schema: Value) -> Value {
    for key in ["$schema", "$defs", "title"] {
        schema
            .as_object_mut()
            .expect("a schema is an object")
            .remove(key);
    }
    schema
}

fn references(schema: &Value, output: &mut BTreeSet<String>) -> Result<()> {
    match schema {
        Value::Object(object) => {
            if let Some(reference) = object.get("$ref") {
                let name = reference
                    .as_str()
                    .and_then(|value| value.strip_prefix("#/$defs/"))
                    .context("Only local schema references are supported")?;
                output.insert(name.into());
            }
            for value in object.values() {
                references(value, output)?;
            }
        }
        Value::Array(values) => {
            for value in values {
                references(value, output)?;
            }
        }
        _ => {}
    }
    Ok(())
}

/// Writes the schemas a module defines, each after the schemas it references. Schemas that another
/// package defines are recorded as imports instead.
struct Module<'a> {
    definitions: &'a BTreeMap<String, Value>,
    exported: BTreeSet<String>,
    external: BTreeSet<String>,
    imported: BTreeSet<String>,
    active: BTreeSet<String>,
    emitted: BTreeSet<String>,
    output: String,
}

impl<'a> Module<'a> {
    fn new(
        definitions: &'a BTreeMap<String, Value>,
        exported: BTreeSet<String>,
        external: BTreeSet<String>,
    ) -> Self {
        Self {
            definitions,
            exported,
            external,
            imported: BTreeSet::new(),
            active: BTreeSet::new(),
            emitted: BTreeSet::new(),
            output: String::new(),
        }
    }

    fn emit(&mut self, name: &str) -> Result<()> {
        if self.external.contains(name) {
            self.imported.insert(name.into());
            return Ok(());
        }
        if self.emitted.contains(name) {
            return Ok(());
        }
        ensure!(
            self.active.insert(name.into()),
            "Recursive wire schemas require an explicit generator implementation"
        );
        let schema = self
            .definitions
            .get(name)
            .with_context(|| format!("Missing schema definition: {name}"))?;
        let mut dependencies = BTreeSet::new();
        references(schema, &mut dependencies)?;
        for dependency in dependencies {
            self.emit(&dependency)?;
        }
        writeln!(
            self.output,
            "{}{}const {} = {};",
            doc_comment(schema),
            if self.exported.contains(name) {
                "export "
            } else {
                ""
            },
            variable(name),
            expression(schema).with_context(|| format!("Cannot translate the {name} schema"))?
        )?;
        self.active.remove(name);
        self.emitted.insert(name.into());
        Ok(())
    }

    /// Imports the schemas that another package defines.
    fn schema_imports(&self, package: &str) -> String {
        if self.imported.is_empty() {
            return String::new();
        }
        let names = self
            .imported
            .iter()
            .map(|name| variable(name))
            .collect::<Vec<_>>()
            .join(", ");
        format!("import {{ {names} }} from \"{package}\";\n")
    }
}

/// The schemas the game library writes and exports: those it needs, and the schemas they reference.
fn game_library_schemas(definitions: &BTreeMap<String, Value>) -> Result<BTreeSet<String>> {
    let mut module = Module::new(definitions, BTreeSet::new(), BTreeSet::new());
    for name in hanabi_protocol::game_library() {
        module.emit(name)?;
    }
    Ok(module.emitted)
}

/// Writes the schemas the game library needs.
fn game_library(definitions: &BTreeMap<String, Value>) -> Result<()> {
    let mut module = Module::new(
        definitions,
        game_library_schemas(definitions)?,
        BTreeSet::new(),
    );
    for name in hanabi_protocol::game_library() {
        module.emit(name)?;
    }
    println!("import * as z from \"zod\";\n");
    print!("{}", game_library_constants());
    print!("{}", module.output);
    Ok(())
}

/// The protocol's limits that the data package exports under the same names.
fn data_constants() -> String {
    exported_constants(&[
        ("MAX_VOLUME", hanabi_protocol::MAX_VOLUME.to_string()),
        (
            "MAX_H_GROUP_LEVEL",
            hanabi_protocol::MAX_H_GROUP_LEVEL.to_string(),
        ),
        (
            "DEFAULT_PAGE_SIZE",
            hanabi_protocol::DEFAULT_PAGE_SIZE.to_string(),
        ),
        ("MAX_PAGE_SIZE", hanabi_protocol::MAX_PAGE_SIZE.to_string()),
        (
            "DEFAULT_MAX_PLAYERS",
            hanabi_protocol::DEFAULT_MAX_PLAYERS.to_string(),
        ),
        (
            "SECONDS_PER_MINUTE",
            hanabi_protocol::SECONDS_PER_MINUTE.to_string(),
        ),
        (
            "MAX_TIME_BASE_SECONDS",
            literal(&hanabi_protocol::MAX_TIME_BASE_SECONDS.into()),
        ),
        (
            "MAX_TIME_PER_TURN_SECONDS",
            literal(&hanabi_protocol::MAX_TIME_PER_TURN_SECONDS.into()),
        ),
        (
            "TYPING_TIMEOUT_MS",
            hanabi_protocol::TYPING_TIMEOUT_MS.to_string(),
        ),
        (
            "MAX_SEED_LENGTH",
            hanabi_protocol::MAX_SEED_LENGTH.to_string(),
        ),
        (
            "MAX_CHAT_LENGTH",
            hanabi_protocol::MAX_CHAT_LENGTH.to_string(),
        ),
        (
            "MAX_EFFICIENCY_MODIFIER",
            hanabi_protocol::MAX_EFFICIENCY_MODIFIER.to_string(),
        ),
        (
            "DEFAULT_TABLE_NAME_SUFFIX",
            serde_json::to_string(hanabi_protocol::DEFAULT_TABLE_NAME_SUFFIX)
                .expect("a string serializes"),
        ),
    ])
}

/// Writes each named value as an exported constant.
fn exported_constants(constants: &[(&str, String)]) -> String {
    let mut output = String::new();
    for (name, value) in constants {
        writeln!(output, "export const {name} = {value};")
            .expect("writing to a string cannot fail");
    }
    output
}

/// The protocol's constants that the game library exports under the same names.
fn game_library_constants() -> String {
    exported_constants(&[
        ("MIN_PLAYERS", hanabi_protocol::MIN_PLAYERS.to_string()),
        ("MAX_PLAYERS", hanabi_protocol::MAX_PLAYERS.to_string()),
        (
            "DEFAULT_VARIANT_NAME",
            serde_json::to_string(hanabi_protocol::DEFAULT_VARIANT_NAME)
                .expect("a string serializes"),
        ),
        ("MAX_SUITS", hanabi_protocol::MAX_SUITS.to_string()),
        ("MAX_DECK_SIZE", hanabi_protocol::MAX_DECK_SIZE.to_string()),
        ("MIN_RANK", hanabi_protocol::MIN_RANK.to_string()),
        ("MAX_RANK", hanabi_protocol::MAX_RANK.to_string()),
        (
            "DEFAULT_CARD_RANKS",
            format!(
                "{} as const",
                serde_json::to_string(
                    &(hanabi_protocol::MIN_RANK..=hanabi_protocol::MAX_RANK).collect::<Vec<_>>()
                )
                .expect("a list of ranks serializes")
            ),
        ),
        (
            "START_CARD_RANK",
            hanabi_protocol::START_CARD_RANK.to_string(),
        ),
        ("ODD_RANK_CLUE", hanabi_protocol::ODD_RANK_CLUE.to_string()),
        (
            "EVEN_RANK_CLUE",
            hanabi_protocol::EVEN_RANK_CLUE.to_string(),
        ),
        ("MAX_CLUES", hanabi_protocol::MAX_CLUES.to_string()),
        ("MAX_STRIKES", hanabi_protocol::MAX_STRIKES.to_string()),
        (
            "PANICKY_MAX_CLUES",
            hanabi_protocol::PANICKY_MAX_CLUES.to_string(),
        ),
    ])
}

fn main() -> Result<()> {
    let game = match std::env::args().nth(1).as_deref() {
        None => false,
        Some("--game") => true,
        Some(argument) => bail!("Unknown argument: {argument}"),
    };
    let mut definitions = BTreeMap::new();
    for (name, schema) in hanabi_protocol::schemas() {
        let mut entries = BTreeMap::from([(name, clean_schema(schema.clone()))]);
        if let Some(nested) = schema["$defs"].as_object() {
            entries.extend(
                nested
                    .iter()
                    .map(|(name, value)| (name.clone(), clean_schema(value.clone()))),
            );
        }
        for (name, value) in entries {
            if let Some(existing) = definitions.insert(name.clone(), value.clone()) {
                ensure!(
                    existing == value,
                    "Conflicting wire schema definition: {name}"
                );
            }
        }
    }
    println!("// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.");
    if game {
        return game_library(&definitions);
    }
    let client = hanabi_protocol::client_contracts();
    let server = hanabi_protocol::server_contracts();
    let exported: BTreeSet<String> = hanabi_protocol::exported()
        .into_iter()
        .map(String::from)
        .collect();
    let mut module = Module::new(
        &definitions,
        exported.clone(),
        game_library_schemas(&definitions)?,
    );
    for name in &exported {
        module.emit(name)?;
    }
    print!("{}", module.schema_imports(GAME_LIBRARY));
    println!("import * as z from \"zod\";\n");
    println!("{}", data_constants());
    print!("{}", module.output);
    for (name, contracts) in [
        ("CLIENT_COMMAND_SCHEMAS", client),
        ("SERVER_COMMAND_SCHEMAS", server),
    ] {
        println!("export const {name} = {{");
        for (command, contract) in contracts {
            println!(
                "{}: {},",
                serde_json::to_string(command)?,
                variable(contract)
            );
        }
        println!("}} as const;");
    }
    for (side, registry) in [("Client", "CLIENT"), ("Server", "SERVER")] {
        println!("export type {side}Command = keyof typeof {registry}_COMMAND_SCHEMAS;");
        println!(
            "export type {side}CommandData = {{ [Command in {side}Command]: z.infer<(typeof {registry}_COMMAND_SCHEMAS)[Command]> }};"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unsupported_validation_rules_fail_instead_of_being_dropped() {
        assert!(expression(&json!({"type":"string","pattern":"^safe$"})).is_err());
        assert!(expression(&json!({"type":"integer","format":"int64"})).is_err());
        assert!(expression(&json!({"type":"string","format":"new-format"})).is_err());
    }

    #[test]
    fn descriptions_become_jsdoc() {
        assert_eq!(
            doc_comment(&json!({"description":"First line.\n- An item ending */"})),
            "\n/**\n * First line.\n * - An item ending *\\/\n */\n"
        );
        assert_eq!(doc_comment(&json!({"type":"string"})), "");
    }

    #[test]
    fn maps_become_records() {
        assert_eq!(
            expression(&json!({"type":"object","additionalProperties":{"type":"string"}})).unwrap(),
            "z.record(z.string(), z.string()).readonly()"
        );
        assert!(
            expression(
                &json!({"type":"object","additionalProperties":{"type":"string"},
                "properties":{"id":{"type":"string"}}})
            )
            .is_err()
        );
    }

    #[test]
    fn boolean_constants_become_literals() {
        assert_eq!(
            expression(&json!({"type":"boolean","const":true})).unwrap(),
            "z.literal(true)"
        );
    }

    #[test]
    fn any_value_schemas_become_unknown() {
        assert_eq!(expression(&json!(true)).unwrap(), "z.unknown()");
        assert_eq!(
            expression(&json!({"description":"Any game"})).unwrap(),
            "z.unknown()"
        );
    }

    #[test]
    fn integer_enums_become_literal_unions_without_redundant_bounds() {
        assert_eq!(
            expression(&json!({"type":"integer","format":"uint8","minimum":0,"maximum":255,"enum":[0,1,2,3]}))
                .unwrap(),
            "z.literal([0,1,2,3])"
        );
    }

    #[test]
    fn single_types_and_floating_point_values() {
        assert!(expression(&json!({"type":["integer","null"]})).is_err());
        assert_eq!(
            expression(&json!({"type":"number","format":"double","minimum":0})).unwrap(),
            "z.number().min(0)"
        );
        assert!(expression(&json!({"type":["integer","string"]})).is_err());
    }

    #[test]
    fn unions_use_their_tag() {
        let variant = |tag: &str| {
            json!({"type":"object","additionalProperties":false,"required":["type"],
                "properties":{"type":{"type":"string","const":tag}}})
        };
        assert_eq!(
            expression(&json!({"oneOf":[variant("draw"),variant("play")]})).unwrap(),
            "z.discriminatedUnion(\"type\",[z.strictObject({\"type\": z.literal(\"draw\")}).readonly(),z.strictObject({\"type\": z.literal(\"play\")}).readonly()])"
        );
        assert!(expression(&json!({"oneOf":[variant("draw"),variant("draw")]})).is_err());
        assert!(expression(&json!({"anyOf":[{"type":"boolean"},{"const":-1}]})).is_err());
    }

    #[test]
    fn defaults_are_written_as_typescript() {
        assert_eq!(default_literal(&json!(2.0)), "2");
        assert_eq!(default_literal(&json!(2.5)), "2.5");
    }

    #[test]
    fn timestamps_have_exactly_the_servers_form() {
        assert_eq!(
            expression(&json!({"type":"string","x-date":true})).unwrap(),
            "z.iso.datetime({ precision: 3 })"
        );
        assert!(expression(&json!({"type":"string","pattern":"^a$"})).is_err());
        assert!(expression(&json!({"type":"integer","x-date":true})).is_err());
    }
}
