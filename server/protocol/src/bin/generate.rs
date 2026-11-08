use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

/// The wire enums that the game library declares. The data package declares the rest.
const GAME_LIBRARY_ENUMS: &[&str] = &["ClueType", "EndCondition"];

/// The game library's package, which the data package imports the game library's schemas from.
const GAME_LIBRARY: &str = "@hanabi-live/game";

/// Schemas the game library also needs. `--game` writes and exports these, with the schemas they
/// reference. The data package imports them rather than writing its own copies.
const GAME_LIBRARY_SCHEMAS: &[&str] = &[
    "CatalogCharacter",
    "CatalogColor",
    "CatalogSuit",
    "CatalogVariant",
    "CardNote",
    "CardOrder",
    "GameEvent",
    "GameOptions",
    "HypotheticalAction",
];

fn game_owned(name: &str) -> bool {
    GAME_LIBRARY_ENUMS.contains(&name)
}

fn wire_enum(name: &str) -> Result<&'static hanabi_protocol::WireEnum> {
    hanabi_protocol::WIRE_ENUMS
        .iter()
        .find(|wire| wire.name == name)
        .with_context(|| format!("Unknown wire enum: {name}"))
}

/// Declares the package's wire enums as TypeScript enums, with their members' values and docs.
fn enum_declarations(game: bool) -> String {
    let mut output = String::new();
    for wire in hanabi_protocol::WIRE_ENUMS {
        if game_owned(wire.name) != game {
            continue;
        }
        let members = wire
            .members
            .iter()
            .map(|member| {
                format!(
                    "{}{} = {},",
                    jsdoc(member.description),
                    member.name,
                    member.value
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        writeln!(
            output,
            "{}export enum {} {{\n{members}\n}}",
            jsdoc(wire.description),
            wire.name
        )
        .expect("writing to a string cannot fail");
    }
    output
}

/// Imports the game library's enums that the data package's schemas use.
fn enum_imports(used: &BTreeSet<String>) -> String {
    let from_game = used
        .iter()
        .filter(|name| game_owned(name))
        .map(String::as_str)
        .collect::<Vec<_>>();
    if from_game.is_empty() {
        return String::new();
    }
    format!(
        "import {{ {} }} from \"{GAME_LIBRARY}\";\n",
        from_game.join(", ")
    )
}

fn literal(value: &Value) -> String {
    let Some(number) = value.as_i64() else {
        return value.to_string();
    };
    let raw = number.to_string();
    let digits = raw.trim_start_matches('-');
    if digits.len() < 5 {
        return raw;
    }
    let mut result = if number < 0 {
        "-".into()
    } else {
        String::new()
    };
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
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
    // An Option without skip_serializing_if serializes None as null: {"type": [T, "null"]}.
    if let Some(types) = object.get("type").and_then(Value::as_array) {
        let mut types = types.iter().filter_map(Value::as_str).collect::<Vec<_>>();
        ensure!(
            types.len() == 2 && types.contains(&"null"),
            "Only nullable single types are supported"
        );
        types.retain(|value| *value != "null");
        let mut inner = schema.clone();
        inner["type"] = Value::from(types[0]);
        return Ok(format!("{}.nullable()", expression(&inner)?));
    }
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
                "anyOf",
                "minimum",
                "maximum",
                "minLength",
                "maxLength",
                "minItems",
                "maxItems",
                "default",
                "x-brand",
                "x-readonly",
                "x-undefined-default",
                "x-enum",
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
    } else if let Some(variants) = schema["anyOf"].as_array() {
        // Serde's untagged enums: the first variant that validates wins, as in Rust.
        ensure!(variants.len() >= 2, "Union needs multiple variants");
        let variants = variants
            .iter()
            .map(expression)
            .collect::<Result<Vec<_>>>()?;
        format!("z.union([{}])", variants.join(","))
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
    } else if let Some(name) = schema.get("x-enum") {
        let wire = wire_enum(name.as_str().context("Invalid wire enum name")?)?;
        let members = wire
            .members
            .iter()
            .map(|member| i64::from(member.value))
            .collect::<Vec<_>>();
        let values = schema["enum"]
            .as_array()
            .context("Wire enums list their integer values")?
            .iter()
            .map(|value| value.as_i64().context("Wire enum values must be integers"))
            .collect::<Result<Vec<_>>>()?;
        if let [member] = values.as_slice() {
            // One member of the enum: its value is assignable to that member's type.
            ensure!(
                members.contains(member),
                "{} has no member with the value {member}",
                wire.name
            );
            format!("z.literal({member})")
        } else {
            ensure!(
                values == members,
                "A field lists other values than {} has",
                wire.name
            );
            format!("z.enum({})", wire.name)
        }
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
            "null" => "z.null()".into(),
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
                        write!(field, ".default({})", default_literal(property, default)?)?;
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
        result = "z.iso.datetime({ precision: 3 })".into();
    } else {
        ensure!(
            schema.get("pattern").is_none(),
            "Only timestamps can have a pattern"
        );
    }
    if let Some(brand) = schema.get("x-brand") {
        write!(result, ".brand<{brand}>()")?;
    }
    if schema["x-readonly"] == true {
        result.push_str(".readonly()");
    }
    if let Some(default) = schema.get("x-undefined-default") {
        write!(result, ".default({default})")?;
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

const MAX_SAFE_INTEGER_F64: f64 = 9_007_199_254_740_991.0;

/// Writes a field's default as TypeScript: whole floats without a zero fraction, and a wire enum's
/// value as its member, which also gives the default the enum's type.
fn default_literal(property: &Value, default: &Value) -> Result<String> {
    let Some(name) = property.get("x-enum").and_then(Value::as_str) else {
        return Ok(whole_floats_as_integers(default).to_string());
    };
    let wire = wire_enum(name)?;
    let member = wire
        .members
        .iter()
        .find(|member| default.as_i64() == Some(i64::from(member.value)))
        .with_context(|| format!("{name} has no member for the default {default}"))?;
    Ok(format!("{name}.{}", member.name))
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
            .context("Missing schema definition")?;
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

    /// The wire enums that the written schemas use.
    fn enums(&self) -> BTreeSet<String> {
        let mut used = BTreeSet::new();
        for name in &self.emitted {
            enums(&self.definitions[name], &mut used);
        }
        used
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

/// The names of the wire enums that a schema uses.
fn enums(schema: &Value, output: &mut BTreeSet<String>) {
    match schema {
        Value::Object(object) => {
            if let Some(name) = object.get("x-enum").and_then(Value::as_str) {
                output.insert(name.into());
            }
            for value in object.values() {
                enums(value, output);
            }
        }
        Value::Array(values) => {
            for value in values {
                enums(value, output);
            }
        }
        _ => {}
    }
}

/// The schemas the game library writes and exports: those it needs, and the schemas they reference.
fn game_library_schemas(definitions: &BTreeMap<String, Value>) -> Result<BTreeSet<String>> {
    let mut module = Module::new(definitions, BTreeSet::new(), BTreeSet::new());
    for name in GAME_LIBRARY_SCHEMAS {
        module.emit(name)?;
    }
    Ok(module.emitted)
}

/// Writes the game library's enums, a schema for each of them, and the schemas the game library
/// needs.
fn game_library(definitions: &BTreeMap<String, Value>) -> Result<()> {
    let mut module = Module::new(
        definitions,
        game_library_schemas(definitions)?,
        BTreeSet::new(),
    );
    for name in GAME_LIBRARY_SCHEMAS {
        module.emit(name)?;
    }
    // The game library cannot import the data package's enums.
    if let Some(other) = module.enums().iter().find(|known| !game_owned(known)) {
        bail!("The game library's schemas use {other}, which the game does not declare");
    }
    println!("import * as z from \"zod\";\n");
    print!("{}", game_library_constants());
    println!("{}", enum_declarations(true));
    for name in GAME_LIBRARY_ENUMS {
        println!("export const {} = z.enum({name});", variable(name));
    }
    print!("{}", module.output);
    Ok(())
}

/// The protocol's limits that the game library exports under the same names.
fn game_library_constants() -> String {
    let constants = [
        ("MIN_PLAYERS", hanabi_protocol::MIN_PLAYERS.to_string()),
        ("MAX_PLAYERS", hanabi_protocol::MAX_PLAYERS.to_string()),
        ("MAX_SUITS", hanabi_protocol::MAX_SUITS.to_string()),
        ("MAX_DECK_SIZE", hanabi_protocol::MAX_DECK_SIZE.to_string()),
        (
            "START_CARD_RANK",
            hanabi_protocol::START_CARD_RANK.to_string(),
        ),
    ];
    let mut output = String::new();
    for (name, value) in constants {
        writeln!(output, "export const {name} = {value};")
            .expect("writing to a string cannot fail");
    }
    output
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
    let exported: BTreeSet<String> = client
        .values()
        .chain(server.values())
        .copied()
        .chain([
            "TableId",
            "GameId",
            "UserId",
            "ChatHistoryMessage",
            "Settings",
            "Spectator",
            "GameHistory",
            "ReplayGame",
            "ReplayImport",
            "LoginRequest",
            "LoginResponse",
            "ApiError",
            "PasswordHashRequest",
            "PasswordHashResponse",
            "PublicGamePage",
            "VariantNames",
            "ScoreFrequency",
        ])
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
    print!("{}", enum_imports(&module.enums()));
    print!("{}", module.schema_imports(GAME_LIBRARY));
    println!("import * as z from \"zod\";\n");
    println!("{}", enum_declarations(false));
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
            "z.record(z.string(), z.string())"
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
    fn nullable_and_floating_point_values() {
        assert_eq!(
            expression(
                &json!({"type":["integer","null"],"format":"int64","minimum":0,"maximum":10})
            )
            .unwrap(),
            "z.number().int().min(0).max(10).nullable()"
        );
        assert_eq!(
            expression(&json!({"type":"number","format":"double","minimum":0})).unwrap(),
            "z.number().min(0)"
        );
        assert!(expression(&json!({"type":["integer","string"]})).is_err());
    }

    #[test]
    fn unions_use_their_tag_or_try_each_variant() {
        let variant = |tag: &str| {
            json!({"type":"object","additionalProperties":false,"required":["type"],
                "properties":{"type":{"type":"string","const":tag}}})
        };
        assert_eq!(
            expression(&json!({"oneOf":[variant("draw"),variant("play")]})).unwrap(),
            "z.discriminatedUnion(\"type\",[z.strictObject({\"type\": z.literal(\"draw\")}),z.strictObject({\"type\": z.literal(\"play\")})])"
        );
        assert!(expression(&json!({"oneOf":[variant("draw"),variant("draw")]})).is_err());
        assert_eq!(
            expression(&json!({"anyOf":[{"type":"boolean"},{"const":-1}]})).unwrap(),
            "z.union([z.boolean(),z.literal(-1)])"
        );
    }

    #[test]
    fn defaults_are_written_as_typescript() {
        assert_eq!(
            default_literal(&json!({"type":"number"}), &json!(2.0)).unwrap(),
            "2"
        );
        assert_eq!(
            default_literal(&json!({"type":"number"}), &json!(2.5)).unwrap(),
            "2.5"
        );
        assert_eq!(
            default_literal(&json!({"x-enum":"SoundMove"}), &json!(0)).unwrap(),
            "SoundMove.All"
        );
        assert!(default_literal(&json!({"x-enum":"SoundMove"}), &json!(7)).is_err());
    }

    #[test]
    fn wire_enums_use_the_generated_typescript_enum() {
        let status = json!({"type":"integer","enum":[0,1,2,3,4,5],"x-enum":"Status"});
        assert_eq!(expression(&status).unwrap(), "z.enum(Status)");
        // A field cannot list other values than the enum has.
        assert!(expression(&json!({"type":"integer","enum":[0,1],"x-enum":"Status"})).is_err());
        assert!(expression(&json!({"type":"integer","enum":[0,1],"x-enum":"Other"})).is_err());
        assert!(expression(&json!({"type":"integer","x-enum":"Status"})).is_err());
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

    #[test]
    fn union_variants_name_one_enum_member() {
        assert_eq!(
            expression(&json!({"type":"integer","enum":[1],"x-enum":"ClueType"})).unwrap(),
            "z.literal(1)"
        );
        assert!(expression(&json!({"type":"integer","enum":[2],"x-enum":"ClueType"})).is_err());
    }

    #[test]
    fn each_package_declares_its_own_enums() {
        let game = enum_declarations(true);
        assert!(game.contains("export enum ClueType {\nColor = 0,\nRank = 1,\n}"));
        assert!(!game.contains("enum Status"));
        let data = enum_declarations(false);
        assert!(data.contains("export enum SoundMove {\nAll = 0,\nOnlyOwn = 1,\nNone = 2,\n}"));
        assert!(!data.contains("enum ClueType"));
    }
}
