use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// TypeScript enums that wire integers may name with `x-enum`, and the modules that export them.
const TYPESCRIPT_ENUMS: &[(&str, &str)] = &[
    ("EndCondition", "@hanabi-live/game"),
    ("SoundMove", "../enums/SoundMove"),
    ("Status", "../enums/Status"),
];

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
                "maxItems",
                "default",
                "x-brand",
                "x-readonly",
                "x-undefined-default",
                "x-enum",
                "x-date",
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
        let mut tags = std::collections::BTreeSet::new();
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
            value.is_string() || value.is_i64(),
            "Only string and integer constants are supported"
        );
        format!("z.literal({value})")
    } else if let Some(reference) = schema["$ref"].as_str() {
        let name = reference
            .strip_prefix("#/$defs/")
            .context("Only local schema references are supported")?;
        variable(name)
    } else if let Some(name) = schema.get("x-enum") {
        let name = name.as_str().context("Invalid TypeScript enum name")?;
        ensure!(
            TYPESCRIPT_ENUMS.iter().any(|(known, _)| *known == name),
            "Unknown TypeScript enum: {name}"
        );
        // The server validates the listed values; the client validates against its enum.
        ensure!(
            schema["enum"]
                .as_array()
                .is_some_and(|values| !values.is_empty() && values.iter().all(Value::is_i64)),
            "TypeScript enums need the integer values listed for the server"
        );
        format!("z.enum({name})")
    } else if let Some(values) = schema["enum"].as_array() {
        ensure!(!values.is_empty(), "Empty enum");
        if values.len() == 1 {
            format!("z.literal({})", values[0])
        } else if values.iter().all(|value| value.is_i64()) {
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
            "array" => format!("z.array({})", expression(&schema["items"])?),
            "object" => {
                ensure!(
                    schema["additionalProperties"] == false,
                    "Wire objects must be strict"
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
                        field
                            .push_str(&format!(".default({})", default_literal(property, default)));
                    } else if !required.iter().any(|value| value == name) {
                        field.push_str(".optional()");
                    }
                    fields.push(format!("{}: {field}", serde_json::to_string(name)?));
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
        ("maxItems", "max"),
    ] {
        if let Some(value) = schema.get(keyword)
            && !enumerated
        {
            result.push_str(&format!(".{method}({})", literal(value)));
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
        ensure!(schema["type"] == "string", "Only strings can hold dates");
        result.push_str(".refine((value) => Number.isFinite(Date.parse(value)), \"Invalid date\")");
    }
    if let Some(brand) = schema.get("x-brand") {
        result.push_str(&format!(".brand<{brand}>()"));
    }
    if schema["x-readonly"] == true {
        result.push_str(".readonly()");
    }
    if let Some(default) = schema.get("x-undefined-default") {
        result.push_str(&format!(".default({default})"));
    }
    Ok(result)
}

/// Writes a field's default as TypeScript: whole floats without a zero fraction, and values of a
/// named enum checked against that enum, which also gives them its type.
/// Writes whole floats, including those nested in object defaults, as JavaScript integers.
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

fn default_literal(property: &Value, default: &Value) -> String {
    let value = whole_floats_as_integers(default).to_string();
    match property.get("x-enum").and_then(Value::as_str) {
        Some(name) => format!("z.enum({name}).parse({value})"),
        None => value,
    }
}

fn variable(name: &str) -> String {
    format!("{}{}Schema", name[..1].to_lowercase(), &name[1..])
}

fn clean_schema(mut schema: Value) -> Value {
    for key in ["$schema", "$defs", "title"] {
        schema.as_object_mut().unwrap().remove(key);
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

fn emit(
    name: &str,
    definitions: &BTreeMap<String, Value>,
    exported: &BTreeSet<&str>,
    active: &mut BTreeSet<String>,
    emitted: &mut BTreeSet<String>,
) -> Result<()> {
    if emitted.contains(name) {
        return Ok(());
    }
    ensure!(
        active.insert(name.into()),
        "Recursive wire schemas require an explicit generator implementation"
    );
    let schema = definitions.get(name).context("Missing schema definition")?;
    let mut dependencies = BTreeSet::new();
    references(schema, &mut dependencies)?;
    for dependency in dependencies {
        emit(&dependency, definitions, exported, active, emitted)?;
    }
    println!(
        "{}const {} = {};",
        if exported.contains(name) {
            "export "
        } else {
            ""
        },
        variable(name),
        expression(schema)?
    );
    active.remove(name);
    emitted.insert(name.into());
    Ok(())
}

fn enums(schema: &Value, output: &mut BTreeSet<String>) {
    match schema {
        Value::Object(object) => {
            if let Some(name) = object.get("x-enum").and_then(Value::as_str) {
                output.insert(name.into());
            }
            object.values().for_each(|value| enums(value, output));
        }
        Value::Array(values) => values.iter().for_each(|value| enums(value, output)),
        _ => {}
    }
}

fn main() -> Result<()> {
    println!("// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.");
    let mut used = BTreeSet::new();
    for schema in hanabi_protocol::schemas().values() {
        enums(schema, &mut used);
    }
    for (name, module) in TYPESCRIPT_ENUMS {
        if used.contains(*name) {
            println!("import {{ {name} }} from \"{module}\";");
        }
    }
    println!("import {{ z }} from \"zod\";\n");
    let client = hanabi_protocol::client_contracts();
    let server = hanabi_protocol::server_contracts();
    let exported: BTreeSet<_> = client
        .values()
        .chain(server.values())
        .copied()
        .chain([
            "TableId",
            "ChatHistoryMessage",
            "Settings",
            "Spectator",
            "GameHistory",
            "ReplayGame",
        ])
        .collect();
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
    let mut active = BTreeSet::new();
    let mut emitted = BTreeSet::new();
    for name in &exported {
        emit(name, &definitions, &exported, &mut active, &mut emitted)?;
    }
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
        assert_eq!(default_literal(&json!({"type":"number"}), &json!(2.0)), "2");
        assert_eq!(
            default_literal(&json!({"type":"number"}), &json!(2.5)),
            "2.5"
        );
        assert_eq!(
            default_literal(&json!({"x-enum":"SoundMove"}), &json!(0)),
            "z.enum(SoundMove).parse(0)"
        );
    }

    #[test]
    fn named_enums_use_the_typescript_enum() {
        assert_eq!(
            expression(&json!({"type":"integer","enum":[0,1],"x-enum":"Status"})).unwrap(),
            "z.enum(Status)"
        );
        assert!(expression(&json!({"type":"integer","enum":[0,1],"x-enum":"Other"})).is_err());
        assert!(expression(&json!({"type":"integer","x-enum":"Status"})).is_err());
    }
}
