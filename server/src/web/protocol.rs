use anyhow::{Result, bail, ensure};
use serde_json::{Map, Value, json};

pub const COMMANDS: &[&str] = &[
    "action",
    "chat",
    "chatFriend",
    "chatLink",
    "chatLinked",
    "chatPlayerInfo",
    "chatPM",
    "chatPMHistoryGet",
    "chatRead",
    "chatTyping",
    "chatUnfriend",
    "chatUnlink",
    "getGameInfo1",
    "getGameInfo2",
    "sync",
    "historyGet",
    "historyGetSeed",
    "inactive",
    "loaded",
    "lobbyLoad",
    "note",
    "pause",
    "replayAction",
    "replayCreate",
    "setting",
    "tableCreate",
    "tableJoin",
    "tableLeave",
    "tableReattend",
    "tableRestart",
    "tableSetLeader",
    "tableSetVariant",
    "tableSpectate",
    "tableStart",
    "tableSuggest",
    "tableTerminate",
    "tableUnattend",
    "tableUpdate",
    "tableVoteForTermination",
    "tag",
    "tagDelete",
    "tagsDeleteAll",
    "tagSearch",
];

#[derive(Clone, Copy)]
enum Kind {
    String,
    Integer,
    Boolean,
    Any,
}
struct Fields<'a> {
    data: &'a mut Map<String, Value>,
    allowed: Vec<&'static str>,
}
impl Fields<'_> {
    fn field(
        &mut self,
        name: &'static str,
        kind: Kind,
        default: Option<Value>,
        optional: bool,
    ) -> Result<()> {
        self.allowed.push(name);
        if !self.data.contains_key(name) {
            if let Some(value) = default {
                self.data.insert(name.into(), value);
            } else {
                ensure!(optional, "Missing {name}");
                return Ok(());
            }
        }
        let value = &self.data[name];
        let valid = match kind {
            Kind::String => value.is_string(),
            Kind::Boolean => value.is_boolean(),
            Kind::Integer => value
                .as_i64()
                .is_some_and(|n| n.unsigned_abs() <= 9_007_199_254_740_991),
            Kind::Any => true,
        };
        let expected = match kind {
            Kind::String => "a string",
            Kind::Boolean => "a boolean",
            Kind::Integer => "a safe integer",
            Kind::Any => "a value",
        };
        ensure!(valid, "Invalid {name}: expected {expected}");
        Ok(())
    }
    fn string(&mut self, name: &'static str, default: Option<&str>) -> Result<()> {
        self.field(name, Kind::String, default.map(|v| json!(v)), false)
    }
    fn integer(&mut self, name: &'static str, default: Option<i64>) -> Result<()> {
        self.field(name, Kind::Integer, default.map(|v| json!(v)), false)
    }
    fn boolean(&mut self, name: &'static str, default: Option<bool>) -> Result<()> {
        self.field(name, Kind::Boolean, default.map(|v| json!(v)), false)
    }
    fn table(&mut self) -> Result<()> {
        self.integer("tableID", None)?;
        ensure!(
            self.data["tableID"].as_i64().is_some_and(|id| id >= 0),
            "Invalid tableID"
        );
        Ok(())
    }
    fn finish(&self) -> Result<()> {
        if let Some(key) = self
            .data
            .keys()
            .find(|key| !self.allowed.contains(&key.as_str()))
        {
            let field: String = key.chars().take(80).collect();
            anyhow::bail!("Unexpected command field: {field}");
        }
        Ok(())
    }
}

fn table_options(value: &mut Value) -> Result<()> {
    let data = value
        .as_object_mut()
        .ok_or_else(|| anyhow::anyhow!("Invalid options"))?;
    let mut fields = Fields {
        data,
        allowed: vec![],
    };
    fields.integer("numPlayers", Some(2))?;
    ensure!(
        fields.data["numPlayers"]
            .as_i64()
            .is_some_and(|n| (2..=6).contains(&n)),
        "Invalid numPlayers"
    );
    fields.integer("startingPlayer", Some(0))?;
    fields.string("variantName", Some("No Variant"))?;
    fields.field("variantID", Kind::Integer, None, true)?;
    ensure!(
        fields
            .data
            .get("variantID")
            .is_none_or(|v| v.as_i64().is_some_and(|n| n >= 0)),
        "Invalid variantID"
    );
    fields.integer("timeBase", Some(0))?;
    fields.integer("timePerTurn", Some(0))?;
    for name in [
        "timed",
        "speedrun",
        "cardCycle",
        "deckPlays",
        "emptyClues",
        "oneExtraCard",
        "oneLessCard",
        "allOrNothing",
        "detrimentalCharacters",
    ] {
        fields.boolean(name, Some(false))?;
    }
    fields.field("tableName", Kind::String, None, true)?;
    fields.field("maxPlayers", Kind::Integer, None, true)?;
    if let Some(max) = fields.data.get("maxPlayers") {
        ensure!(
            max.as_i64().is_some_and(|n| (2..=6).contains(&n)),
            "Invalid maxPlayers"
        );
    }
    fields.finish()
}

pub fn command_name(input: &str) -> Option<&'static str> {
    let name = input.split_once(' ').map_or(input, |(name, _)| name);
    COMMANDS
        .iter()
        .copied()
        .find(|candidate| *candidate == name)
}

pub fn parse(input: &str) -> Result<(String, Value)> {
    ensure!(
        input.len() <= crate::transport::MAX_MESSAGE_BYTES,
        "Oversized command"
    );
    let (name, body) = input.split_once(' ').unwrap_or((input, "{}"));
    ensure!(COMMANDS.contains(&name), "Unknown client command");
    let mut data: Value = serde_json::from_str(body)?;
    if let Some(parsed) = hanabi_protocol::decode_client(name, &data)? {
        return Ok((name.into(), parsed));
    }
    let map = data
        .as_object_mut()
        .ok_or_else(|| anyhow::anyhow!("Command arguments must be a JSON object"))?;
    let mut fields = Fields {
        data: map,
        allowed: vec![],
    };
    match name {
        "sync" | "lobbyLoad" => {}
        "setting" => {
            fields.string("name", None)?;
            fields.string("setting", None)?;
        }
        "inactive" => fields.boolean("inactive", None)?,
        "historyGet" => {
            fields.integer("offset", Some(0))?;
            fields.integer("amount", Some(0))?;
        }
        "historyGetSeed" => {
            fields.string("seed", None)?;
        }
        "tagSearch" => {
            fields.string("msg", Some(""))?;
            fields.string("room", Some(""))?;
        }
        "tableCreate" | "tableUpdate" => {
            if name == "tableUpdate" {
                fields.table()?;
            }
            fields.string("name", Some(""))?;
            fields.string("password", Some(""))?;
            fields.integer("maxPlayers", Some(5))?;
            fields.boolean("hidePregame", Some(false))?;
            fields.field("gameJSON", Kind::Any, None, true)?;
            fields.field("options", Kind::Any, Some(json!({})), false)?;
            table_options(fields.data.get_mut("options").unwrap())?;
        }
        "replayCreate" => {
            fields.string("source", None)?;
            fields.string("visibility", None)?;
            ensure!(
                matches!(fields.data["source"].as_str(), Some("id" | "json")),
                "Invalid replay source"
            );
            ensure!(
                matches!(fields.data["visibility"].as_str(), Some("solo" | "shared")),
                "Invalid replay visibility"
            );
            fields.field("databaseID", Kind::Integer, None, true)?;
            ensure!(
                fields.data.get("databaseID").is_none_or(|v| v
                    .as_i64()
                    .is_some_and(|n| (1..=i64::from(i32::MAX)).contains(&n))),
                "Invalid databaseID"
            );
            fields.field("gameJSON", Kind::Any, None, true)?;
            fields.string("password", Some(""))?;
            fields.integer("shadowingPlayerIndex", Some(-1))?;
        }
        _ => bail!("Unknown client command"),
    }
    fields.finish()?;
    Ok((name.into(), data))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_client_compatibility_fixtures() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../../protocol/fixtures/compatibility.json"))
                .unwrap();
        for case in cases.iter().filter(|case| case["direction"] == "client") {
            let result = parse(&format!(
                "{} {}",
                case["command"].as_str().unwrap(),
                case["input"]
            ));
            let valid = case["nativeValid"]
                .as_bool()
                .unwrap_or(case["valid"].as_bool().unwrap());
            assert_eq!(result.is_ok(), valid, "{}", case["name"]);
            if let Ok((_, data)) = result {
                assert_eq!(
                    data,
                    case.get("normalized").unwrap_or(&case["input"]).clone(),
                    "{}",
                    case["name"]
                );
            }
        }
    }
    #[test]
    fn every_registered_command_has_a_parser() {
        assert_eq!(COMMANDS.len(), 43);
        for command in COMMANDS {
            let value = match *command {
                "setting" => json!({"name":"volume","setting":"50"}),
                "inactive" => json!({"inactive":true}),
                "historyGetSeed" => json!({"seed":"p2v0s1"}),
                "chat" => json!({"msg":"hello","room":"lobby"}),
                "chatPM" => json!({"msg":"hello","recipient":"Alice"}),
                "replayCreate" => json!({"source":"id","visibility":"shared","databaseID":1}),
                "action" => json!({"tableID":1,"type":3,"target":0}),
                "pause" => json!({"tableID":1,"setting":"true"}),
                "note" => json!({"tableID":1,"order":0,"note":"test"}),
                "tag" | "tagDelete" => json!({"tableID":1,"msg":"test"}),
                "replayAction" => json!({"tableID":1,"type":0}),
                "sync" | "lobbyLoad" | "tableCreate" | "historyGet" | "chatLinked"
                | "chatFriend" | "chatUnfriend" | "chatLink" | "chatUnlink" | "chatPlayerInfo"
                | "chatPMHistoryGet" | "tagSearch" => json!({}),
                _ => json!({"tableID":1}),
            };
            parse(&format!("{command} {value}")).unwrap_or_else(|e| panic!("{command}: {e}"));
        }
    }
    #[test]
    fn private_messages_accept_classic_room_metadata_but_reject_invalid_fields() {
        for room in [None, Some("lobby"), Some("table123")] {
            let mut data = json!({"msg":"hello","recipient":"Alice"});
            if let Some(room) = room {
                data["room"] = json!(room);
            }
            assert!(parse(&format!("chatPM {data}")).is_ok());
        }
        for data in [
            json!({"msg":"hello","recipient":"Alice","room":123}),
            json!({"msg":"hello","recipient":"Alice","room":null}),
            json!({"msg":"hello","recipient":"Alice","room":"lobby","admin":true}),
        ] {
            assert!(parse(&format!("chatPM {data}")).is_err());
        }
    }

    #[test]
    fn strict_types_limits_and_defaults() {
        for input in [
            "action {\"tableID\":1,\"type\":4,\"target\":0}",
            "chat {\"msg\":\"x\",\"room\":\"lobby\",\"admin\":true}",
            "tableStart {\"tableID\":9007199254740992}",
            "setting {\"name\":\"volume\",\"setting\":50}",
            "sync []",
            "unknown {}",
            "historyFriendsGet {\"offset\":0,\"amount\":10}",
        ] {
            assert!(parse(input).is_err(), "{input}");
        }
        assert!(
            parse(&format!(
                "loaded {{\"tableID\":1,\"requestID\":\"{}\"}}",
                "é".repeat(65)
            ))
            .is_err()
        );
        let (_, create) = parse("tableCreate {}").unwrap();
        assert_eq!(create["options"]["numPlayers"], 2);
        assert_eq!(create["options"]["variantName"], "No Variant");
    }

    #[test]
    fn full_replays_exceeding_legacy_frame_limit_are_not_truncated() {
        let note = "n".repeat(65536);
        let input = format!(
            "replayCreate {}",
            json!({"source":"json","visibility":"solo","gameJSON":{
                "seed":"p2v0s1","notes":[[note],[]]
            }})
        );
        assert!(input.len() > 8192);
        let (_, parsed) = parse(&input).unwrap();
        assert_eq!(
            parsed["gameJSON"]["notes"][0][0].as_str().unwrap().len(),
            65536
        );
        assert!(
            parse(&format!(
                "replayAction {}",
                json!({"tableID":1,"type":0,"actionJSON":"x".repeat(65537)})
            ))
            .is_err()
        );
        assert!(parse(&"x".repeat(crate::transport::MAX_MESSAGE_BYTES + 1)).is_err());
    }
}
