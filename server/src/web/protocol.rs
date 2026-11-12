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
                "settings" => json!({"settings":{"volume":50}}),
                "userInactive" => json!({"inactive":true}),
                "seedGames" => json!({"seed":"p2v0s1","offset":0,"limit":10}),
                "chat" => json!({"text":"hello"}),
                "chatPm" => json!({"text":"hello","recipient":"Alice"}),
                "replayCreate" => {
                    json!({"source":{"type":"saved","gameId":1},"visibility":{"type":"shared"}})
                }
                "playerAction" => {
                    json!({"tableId":1,"action":{"type":"clue","receiverIndex":0,"clue":{"type":"rank","value":1}}})
                }
                "pause" => json!({"tableId":1,"setting":"pause"}),
                "note" => json!({"tableId":1,"order":0,"text":"test"}),
                "tagAdd" | "tagRemove" => json!({"tableId":1,"tag":"test"}),
                "replayAction" => {
                    json!({"tableId":1,"action":{"type":"hypothetical","control":{"type":"start"}}})
                }
                "tableRestartDecline" => json!({"tableId":1,"declined":true}),
                "tableSetOwner" => json!({"tableId":1,"ownerId":1}),
                "tableSuggest" => json!({"tableId":1,"turn":0}),
                "friendAdd" | "friendRemove" | "linkAdd" | "linkRemove" | "blockAdd"
                | "blockRemove" => json!({"username":"Alice"}),
                "tagSearch" => json!({"tag":"test"}),
                "gameHistory" => json!({"offset":0,"limit":10}),
                "tableCreate" => json!({"settings":{"name":"Table"}}),
                "tableUpdate" => json!({"tableId":1,"settings":{"name":"Table"}}),
                "chatPmHistory" => json!({"limit":10}),
                "sync" | "lobbyLoad" | "linkList" | "blockList" => json!({}),
                _ => json!({"tableId":1}),
            };
            parse(&format!("{command} {value}")).unwrap_or_else(|e| panic!("{command}: {e}"));
        }
    }
    #[test]
    fn private_messages_take_only_a_message_and_recipient() {
        assert!(parse(r#"chatPm {"text":"hello","recipient":"Alice"}"#).is_ok());
        for data in [
            json!({"text":"hello","recipient":"Alice","tableId":1}),
            json!({"text":"hello","recipient":"Alice","admin":true}),
        ] {
            assert!(parse(&format!("chatPm {data}")).is_err());
        }
    }

    #[test]
    fn strict_types_limits_and_defaults() {
        for input in [
            "action {\"tableId\":1,\"type\":\"pass\",\"order\":0}",
            "chat {\"text\":\"x\",\"admin\":true}",
            "tableStart {\"tableId\":9007199254740992}",
            "setting {\"settings\":{\"volume\":\"50\"}}",
            "sync []",
            "unknown {}",
            "historyFriendsGet {\"offset\":0,\"amount\":10}",
            "loaded {\"tableId\":1,\"requestId\":\"r\"}",
        ] {
            assert!(parse(input).is_err(), "{input}");
        }
        let create = parse("tableCreate {\"settings\":{\"name\":\"Table\"}}")
            .unwrap()
            .data();
        assert_eq!(create["settings"]["maxPlayers"], 5);
        assert_eq!(create["settings"]["options"]["variantName"], "No Variant");
    }

    #[test]
    fn full_replays_exceeding_legacy_frame_limit_are_not_truncated() {
        let note = "n".repeat(65536);
        let input = format!(
            "replayCreate {}",
            json!({"visibility":{"type":"solo"},"source":{"type":"imported","game":{
                "seed":"p2v0s1","notes":[[note],[]]
            }}})
        );
        assert!(input.len() > 8192);
        let parsed = parse(&input).unwrap().data();
        assert_eq!(
            parsed["source"]["game"]["notes"][0][0]
                .as_str()
                .unwrap()
                .len(),
            65536
        );
        assert!(
            parse(&format!(
                "replayAction {}",
                json!({"tableId":1,"action":{"type":"hypothetical","control":{"type":"event","event":"{\"type\":\"turn\"}"}}})
            ))
            .is_err()
        );
        assert!(parse(&"x".repeat(crate::transport::MAX_MESSAGE_BYTES + 1)).is_err());
    }
}
