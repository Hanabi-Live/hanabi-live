use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// TypeScript enums that wire integers may name with `x-enum`, and whether the game library owns them.
/// Each is exported by the `enums` module of its name in the package that owns it.
const TYPESCRIPT_ENUMS: &[(&str, bool)] = &[
    ("ActionType", false),
    ("ClueType", true),
    ("EndCondition", true),
    ("ReplayArrowOrder", false),
    ("SoundMove", false),
    ("Status", false),
];

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
    TYPESCRIPT_ENUMS
        .iter()
        .any(|(known, game)| *known == name && *game)
}

/// Imports the TypeScript enums that the written schemas use: a package's own enums from its `enums`
/// modules, and the game library's enums from the game library when the data package uses them.
fn enum_imports(used: &BTreeMap<String, EnumValues>, game: bool) -> Result<String> {
    let mut output = String::new();
    let mut from_game = Vec::new();
    for (name, owned) in TYPESCRIPT_ENUMS {
        if !used.contains_key(*name) {
            continue;
        }
        if *owned == game {
            output.push_str(&format!("import {{ {name} }} from \"../enums/{name}\";\n"));
        } else {
            ensure!(
                !game,
                "The game library cannot use the data package's enum {name}"
            );
            from_game.push(*name);
        }
    }
    if !from_game.is_empty() {
        output.push_str(&format!(
            "import {{ {} }} from \"{GAME_LIBRARY}\";\n",
            from_game.join(", ")
        ));
    }
    Ok(output)
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
                "x-loose",
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
        let name = name.as_str().context("Invalid TypeScript enum name")?;
        ensure!(
            TYPESCRIPT_ENUMS.iter().any(|(known, _)| *known == name),
            "Unknown TypeScript enum: {name}"
        );
        // The server validates the listed values; the client validates against its enum, which
        // `enum_checks` requires to have exactly those values.
        ensure!(
            schema["enum"]
                .as_array()
                .is_some_and(|values| !values.is_empty() && values.iter().all(Value::is_i64)),
            "TypeScript enums need the integer values listed for the server"
        );
        match schema["enum"].as_array().map(Vec::as_slice) {
            // One member of the enum: its value is assignable to that member's type.
            Some([member]) => format!("z.literal({member})"),
            _ => format!("z.enum({})", enum_variable(name)),
        }
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
                // Only an explicitly loose object, such as an imported file, ignores unknown fields.
                let loose = schema["x-loose"] == true;
                ensure!(
                    if loose {
                        schema.get("additionalProperties").is_none()
                    } else {
                        schema["additionalProperties"] == false
                    },
                    "Wire objects must be strict unless marked loose"
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
                    fields.push(format!(
                        "{}{}: {field}",
                        doc_comment(property),
                        serde_json::to_string(name)?
                    ));
                }
                format!(
                    "{}({{{}}})",
                    if loose { "z.object" } else { "z.strictObject" },
                    fields.join(",")
                )
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

/// The schema's description, which comes from the Rust doc comment, as JSDoc. Generation formats it
/// with the repository's ESLint rule afterwards.
fn doc_comment(schema: &Value) -> String {
    let Some(description) = schema.get("description").and_then(Value::as_str) else {
        return String::new();
    };
    let lines = description
        .replace("*/", "*\\/")
        .lines()
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
        Some(name) => format!("z.enum({}).parse({value})", enum_variable(name)),
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
        self.output.push_str(&format!(
            "{}{}const {} = {};\n",
            doc_comment(schema),
            if self.exported.contains(name) {
                "export "
            } else {
                ""
            },
            variable(name),
            expression(schema).with_context(|| format!("Cannot translate the {name} schema"))?
        ));
        self.active.remove(name);
        self.emitted.insert(name.into());
        Ok(())
    }

    /// The named TypeScript enums that the written schemas use.
    fn enums(&self) -> Result<BTreeMap<String, EnumValues>> {
        let mut used = BTreeMap::new();
        for name in &self.emitted {
            enums(&self.definitions[name], &mut used)?;
        }
        Ok(used)
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

/// The integer values the server lists for a TypeScript enum. A field lists either every value, or
/// one member when each variant of a union names its own.
#[derive(Default)]
struct EnumValues {
    all: Option<Value>,
    members: BTreeSet<i64>,
}

impl EnumValues {
    fn listed(&self) -> Result<Vec<i64>> {
        let Some(all) = &self.all else {
            return Ok(self.members.iter().copied().collect());
        };
        let all = all
            .as_array()
            .context("TypeScript enums need the integer values listed for the server")?
            .iter()
            .map(|value| {
                value
                    .as_i64()
                    .context("TypeScript enum values must be integers")
            })
            .collect::<Result<Vec<_>>>()?;
        ensure!(
            self.members.iter().all(|member| all.contains(member)),
            "A field names an enum member that the enum's full listing lacks"
        );
        Ok(all)
    }
}

/// Each named TypeScript enum, with the integer values the server lists for it.
fn enums(schema: &Value, output: &mut BTreeMap<String, EnumValues>) -> Result<()> {
    match schema {
        Value::Object(object) => {
            if let Some(name) = object.get("x-enum").and_then(Value::as_str) {
                let values = object.get("enum").cloned().unwrap_or_default();
                let entry = output.entry(name.into()).or_default();
                match values.as_array().map(Vec::as_slice) {
                    Some([member]) => {
                        entry.members.insert(
                            member
                                .as_i64()
                                .context("TypeScript enum values must be integers")?,
                        );
                    }
                    _ => {
                        if let Some(existing) = &entry.all {
                            ensure!(
                                *existing == values,
                                "{name} lists different values in different contracts"
                            );
                        }
                        entry.all = Some(values);
                    }
                }
                entry.listed()?;
            }
            for value in object.values() {
                enums(value, output)?;
            }
        }
        Value::Array(values) => {
            for value in values {
                enums(value, output)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn enum_variable(name: &str) -> String {
    format!("{}{}Enum", name[..1].to_lowercase(), &name[1..])
}

/// Declares each TypeScript enum's schema input, which fails type checking unless the enum has
/// exactly the values the server lists for it.
fn enum_checks(used: &BTreeMap<String, EnumValues>) -> Result<String> {
    if used.is_empty() {
        return Ok(String::new());
    }
    let mut output = String::from(
        "/** A TypeScript enum, or `never` unless it has exactly the server's values. */\n\
         type ServerEnum<Enum extends Record<string, string | number>, Values extends number> = \
         [Extract<Enum[keyof Enum], number>] extends [Values] \
         ? [Values] extends [Extract<Enum[keyof Enum], number>] ? Enum : never : never;\n",
    );
    for (name, values) in used {
        let values = values
            .listed()?
            .iter()
            .map(i64::to_string)
            .collect::<Vec<_>>()
            .join(" | ");
        output.push_str(&format!(
            "const {}: ServerEnum<typeof {name}, {values}> = {name};\n",
            enum_variable(name)
        ));
    }
    Ok(output)
}

/// The schemas the game library writes and exports: those it needs, and the schemas they reference.
fn game_library_schemas(definitions: &BTreeMap<String, Value>) -> Result<BTreeSet<String>> {
    let mut module = Module::new(definitions, BTreeSet::new(), BTreeSet::new());
    for name in GAME_LIBRARY_SCHEMAS {
        module.emit(name)?;
    }
    Ok(module.emitted)
}

/// Writes the schemas the game library needs, and a schema for each of its enums that the server
/// sends, which fails type checking unless the enum has exactly the server's values.
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
    if let Some(other) = module.enums()?.keys().find(|known| !game_owned(known)) {
        bail!("The game library's schemas use {other}, which the game does not own");
    }
    let mut used = BTreeMap::new();
    for schema in definitions.values() {
        enums(schema, &mut used)?;
    }
    used.retain(|name, _| game_owned(name));
    print!("{}", enum_imports(&used, true)?);
    println!("import {{ z }} from \"zod\";\n");
    println!("{}", enum_checks(&used)?);
    for name in used.keys() {
        println!(
            "export const {} = z.enum({});",
            variable(name),
            enum_variable(name)
        );
    }
    print!("{}", module.output);
    Ok(())
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
    let used = module.enums()?;
    print!("{}", enum_imports(&used, false)?);
    print!("{}", module.schema_imports(GAME_LIBRARY));
    println!("import {{ z }} from \"zod\";\n");
    println!("{}", enum_checks(&used)?);
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
        assert_eq!(default_literal(&json!({"type":"number"}), &json!(2.0)), "2");
        assert_eq!(
            default_literal(&json!({"type":"number"}), &json!(2.5)),
            "2.5"
        );
        assert_eq!(
            default_literal(&json!({"x-enum":"SoundMove"}), &json!(0)),
            "z.enum(soundMoveEnum).parse(0)"
        );
    }

    #[test]
    fn named_enums_use_the_typescript_enum() {
        assert_eq!(
            expression(&json!({"type":"integer","enum":[0,1],"x-enum":"Status"})).unwrap(),
            "z.enum(statusEnum)"
        );
        assert!(expression(&json!({"type":"integer","enum":[0,1],"x-enum":"Other"})).is_err());
        assert!(expression(&json!({"type":"integer","x-enum":"Status"})).is_err());
    }

    #[test]
    fn enums_are_checked_against_the_server_values() {
        let mut used = BTreeMap::new();
        enums(&json!({"x-enum":"Status","enum":[0,1]}), &mut used).unwrap();
        assert_eq!(
            enum_checks(&used).unwrap().lines().last().unwrap(),
            "const statusEnum: ServerEnum<typeof Status, 0 | 1> = Status;"
        );
        assert!(enums(&json!({"x-enum":"Status","enum":[0,1,2]}), &mut used).is_err());
    }

    #[test]
    fn enum_members_named_by_union_variants_make_up_the_enum() {
        let mut used = BTreeMap::new();
        for member in [0, 1] {
            enums(&json!({"x-enum":"ClueType","enum":[member]}), &mut used).unwrap();
        }
        assert_eq!(
            enum_checks(&used).unwrap().lines().last().unwrap(),
            "const clueTypeEnum: ServerEnum<typeof ClueType, 0 | 1> = ClueType;"
        );
        assert_eq!(
            expression(&json!({"type":"integer","enum":[1],"x-enum":"ClueType"})).unwrap(),
            "z.literal(1)"
        );
        assert!(enums(&json!({"x-enum":"ClueType","enum":[0,1]}), &mut used).is_ok());
        assert!(enums(&json!({"x-enum":"ClueType","enum":[2]}), &mut used).is_err());
    }
}
