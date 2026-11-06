use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

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
    let object = schema.as_object().context("Expected a schema object")?;
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
                "maxItems",
                "default",
                "x-brand",
                "x-readonly",
                "x-undefined-default",
            ]
            .contains(&key.as_str()),
            "Unsupported schema keyword: {key}"
        );
    }
    let mut result = if let Some(variants) = schema["oneOf"].as_array() {
        let mut tags = std::collections::BTreeSet::new();
        for variant in variants {
            let tag = variant["properties"]["state"]["const"]
                .as_str()
                .context("Only state-tagged disjoint unions are supported")?;
            ensure!(tags.insert(tag), "Duplicate union discriminator");
            ensure!(
                variant["required"]
                    .as_array()
                    .is_some_and(|required| required.iter().any(|name| name == "state")),
                "Union discriminator must be required"
            );
        }
        ensure!(variants.len() >= 2, "Union needs multiple variants");
        let variants = variants
            .iter()
            .map(expression)
            .collect::<Result<Vec<_>>>()?;
        format!("z.discriminatedUnion(\"state\",[{}])", variants.join(","))
    } else if let Some(value) = schema.get("const") {
        ensure!(value.is_string(), "Only string constants are supported");
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
                        field.push_str(&format!(".default({default})"));
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
    for (keyword, method) in [
        ("minimum", "min"),
        ("maximum", "max"),
        ("minLength", "min"),
        ("maxLength", "max"),
        ("maxItems", "max"),
    ] {
        if let Some(value) = schema.get(keyword) {
            result.push_str(&format!(".{method}({})", literal(value)));
        }
    }
    if let Some(format) = schema["format"].as_str() {
        match format {
            "utf8-request-id" => result.push_str(&format!(
                ".refine((value) => new TextEncoder().encode(value).length <= {0}, \"Request IDs cannot exceed {0} UTF-8 bytes.\")",
                hanabi_protocol::MAX_REQUEST_ID_BYTES,
            )),
            "int64" | "uint64" => {}
            other => bail!("Unsupported schema format: {other}"),
        }
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

fn main() -> Result<()> {
    println!(
        "// Generated from server/protocol. Run bash scripts/bash/generate_protocol.sh.\nimport {{ z }} from \"zod\";\n"
    );
    let client = hanabi_protocol::client_contracts();
    let server = hanabi_protocol::server_contracts();
    let exported: BTreeSet<_> = client
        .values()
        .chain(server.values())
        .copied()
        .chain(["TableId", "ChatHistoryMessage"])
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
        ("CLIENT_WIRE_SCHEMAS", client),
        ("SERVER_WIRE_SCHEMAS", server),
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
    println!(
        "export type ClientWireData = {{ [Command in keyof typeof CLIENT_WIRE_SCHEMAS]: z.infer<(typeof CLIENT_WIRE_SCHEMAS)[Command]> }};"
    );
    println!(
        "export type ServerWireData = {{ [Command in keyof typeof SERVER_WIRE_SCHEMAS]: z.infer<(typeof SERVER_WIRE_SCHEMAS)[Command]> }};"
    );
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
}
