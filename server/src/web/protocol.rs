use anyhow::{Result, ensure};
use serde_json::Value;
use std::{collections::BTreeSet, sync::LazyLock};

/// The client command an input names, for error messages about inputs that failed to parse.
pub fn command_name(input: &str) -> Option<&'static str> {
    static NAMES: LazyLock<BTreeSet<&'static str>> =
        LazyLock::new(|| hanabi_protocol::client_contracts().into_keys().collect());
    let name = input.split_once(' ').map_or(input, |(name, _)| name);
    NAMES.get(name).copied()
}

pub fn parse(input: &str) -> Result<hanabi_protocol::ClientMessage> {
    ensure!(
        input.len() <= crate::transport::MAX_MESSAGE_BYTES,
        "Oversized command"
    );
    let (name, body) = input.split_once(' ').unwrap_or((input, "{}"));
    let data: Value = serde_json::from_str(body)?;
    hanabi_protocol::ClientMessage::decode(name, &data)?
        .ok_or_else(|| anyhow::anyhow!("Unknown client command"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
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
            if let Ok(message) = result {
                let data = message.data();
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
        for command in hanabi_protocol::client_contracts().into_keys() {
            let value = match command {
                "setting" => json!({"name":"volume","setting":"50"}),
                "inactive" => json!({"inactive":true}),
                "gameHistoryOtherScores" => json!({"seed":"p2v0s1","offset":0,"amount":10}),
                "chat" => json!({"text":"hello","room":"lobby"}),
                "chatPM" => json!({"text":"hello","recipient":"Alice"}),
                "replayCreate" => json!({"source":"id","visibility":"shared","databaseID":1}),
                "action" => json!({"tableID":1,"type":3,"target":0}),
                "pause" => json!({"tableID":1,"setting":"pause"}),
                "note" => json!({"tableID":1,"order":0,"note":"test"}),
                "tag" | "tagDelete" => json!({"tableID":1,"msg":"test"}),
                "replayAction" => json!({"tableID":1,"type":"hypoStart"}),
                "tableRestartDecline" => json!({"tableID":1,"declined":true}),
                "sync" | "lobbyLoad" | "tableCreate" | "gameHistory" | "chatLinked"
                | "chatFriend" | "chatUnfriend" | "chatLink" | "chatUnlink" | "chatBlock"
                | "chatUnblock" | "chatBlocked" | "chatPMHistory" | "tagSearch" => json!({}),
                _ => json!({"tableID":1}),
            };
            parse(&format!("{command} {value}")).unwrap_or_else(|e| panic!("{command}: {e}"));
        }
    }
    #[test]
    fn private_messages_take_only_a_message_and_recipient() {
        assert!(parse(r#"chatPM {"text":"hello","recipient":"Alice"}"#).is_ok());
        for data in [
            json!({"text":"hello","recipient":"Alice","room":"lobby"}),
            json!({"text":"hello","recipient":"Alice","admin":true}),
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
            "loaded {\"tableID\":1,\"requestID\":\"r\"}",
        ] {
            assert!(parse(input).is_err(), "{input}");
        }
        let create = parse("tableCreate {}").unwrap().data();
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
        let parsed = parse(&input).unwrap().data();
        assert_eq!(
            parsed["gameJSON"]["notes"][0][0].as_str().unwrap().len(),
            65536
        );
        assert!(
            parse(&format!(
                "replayAction {}",
                json!({"tableID":1,"type":"hypoAction","action":"{\"type\":\"turn\"}"})
            ))
            .is_err()
        );
        assert!(parse(&"x".repeat(crate::transport::MAX_MESSAGE_BYTES + 1)).is_err());
    }
}
