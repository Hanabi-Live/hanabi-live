use anyhow::{Context, Result, bail, ensure};
use hanabi_protocol::{ClientRequest, RequestId};
use serde_json::Value;
use std::{collections::BTreeSet, sync::LazyLock};

/// The keys of a request's frame: `{"id": 1, "request": "tableJoin", "data": {...}}`.
const FRAME_KEYS: [&str; 3] = ["id", "request", "data"];

/// A request as far as it could be read. A request without a valid ID cannot be answered.
pub struct Request {
    pub id: Option<RequestId>,
    /// The registered command that the request names, if it names one.
    pub command: Option<&'static str>,
    pub message: Result<ClientRequest>,
}

/// The registered client command with this name.
fn command_name(name: &str) -> Option<&'static str> {
    static NAMES: LazyLock<BTreeSet<&'static str>> =
        LazyLock::new(|| hanabi_protocol::request_contracts().into_keys().collect());
    NAMES.get(name).copied()
}

pub fn parse(input: &str) -> Request {
    let mut request = Request {
        id: None,
        command: None,
        message: Err(anyhow::anyhow!("Unreadable request")),
    };
    request.message = read(input, &mut request.id, &mut request.command);
    request
}

/// Reads a request, recording its ID and command as soon as they are known, so that a failure
/// after them can still be answered.
fn read(
    input: &str,
    id: &mut Option<RequestId>,
    command: &mut Option<&'static str>,
) -> Result<ClientRequest> {
    ensure!(
        input.len() <= crate::transport::MAX_MESSAGE_BYTES,
        "Oversized command"
    );
    let Value::Object(mut frame) = serde_json::from_str(input)? else {
        bail!("A request must be a JSON object");
    };
    *id = frame
        .get("id")
        .and_then(|value| hanabi_protocol::decode::<RequestId>(value).ok());
    let name = frame
        .get("request")
        .and_then(Value::as_str)
        .context("A request must name its command in \"request\"")?
        .to_owned();
    *command = command_name(&name);
    if let Some(key) = frame.keys().find(|key| !FRAME_KEYS.contains(&key.as_str())) {
        bail!("Unknown request field \"{key}\"");
    }
    ensure!(
        id.is_some(),
        "A request must have an \"id\" from 1 to 2^53 - 1"
    );
    let data = frame
        .remove("data")
        .context("A request must have its payload in \"data\"")?;
    ClientRequest::decode(&name, &data)?.context("Unknown client command")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    /// The frame of a request with this command and payload.
    fn frame(command: &str, data: &Value) -> String {
        json!({"id": 1, "request": command, "data": data}).to_string()
    }
    /// Parses a request with this command and payload.
    fn request(command: &str, data: &Value) -> Result<ClientRequest> {
        parse(&frame(command, data)).message
    }
    #[test]
    fn shared_client_compatibility_fixtures() {
        let cases: Vec<Value> = serde_json::from_str(include_str!(
            "../../../libs/protocol/fixtures/compatibility.json"
        ))
        .unwrap();
        for case in cases.iter().filter(|case| case["direction"] == "client") {
            let result = request(case["command"].as_str().unwrap(), &case["input"]);
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
        for command in hanabi_protocol::request_contracts().into_keys() {
            let value = match command {
                "settings" => json!({"settings":{"volume":50}}),
                "userInactive" => json!({"inactive":true}),
                "seedGames" => json!({"seed":"p2v0s1","offset":0,"limit":10}),
                "chat" => json!({"text":"hello"}),
                "chatPm" => json!({"text":"hello","recipient":"Alice"}),
                "replayCreate" => {
                    json!({"source":{"type":"saved","gameId":1},"visibility":{"type":"shared","joinExisting":false,"spoilerFree":false}})
                }
                "playerAction" => {
                    json!({"tableId":1,"action":{"type":"clue","receiverIndex":0,"clue":{"type":"rank","rank":1}}})
                }
                "pause" => json!({"tableId":1,"paused":true}),
                "pauseQueue" => json!({"tableId":1,"queued":true}),
                "note" => json!({"tableId":1,"order":0,"text":"test"}),
                "tagAdd" | "tagRemove" => json!({"tableId":1,"tag":"test"}),
                "replayAction" => {
                    json!({"tableId":1,"action":{"type":"hypothetical","control":{"type":"start"}}})
                }
                "tableRestartDecline" => json!({"tableId":1,"declined":true}),
                "tableTerminateVote" => json!({"tableId":1,"voted":true}),
                "tableSetOwner" => json!({"tableId":1,"userId":1}),
                "tableSuggest" => json!({"tableId":1,"turn":0}),
                "friendAdd" | "friendRemove" | "linkAdd" | "linkRemove" | "blockAdd"
                | "blockRemove" => json!({"username":"Alice"}),
                "tagSearch" => json!({"tag":"test"}),
                "gameHistory" => json!({"offset":0,"limit":10}),
                "tableCreate" => json!({"settings":{"name":"Table","maxPlayers":5,"options":{}}}),
                "tableUpdate" => {
                    json!({"tableId":1,"settings":{"name":"Table","maxPlayers":5,"options":{}}})
                }
                "tableRestart" => json!({"tableId":1,"startNow":false}),
                "tableStart" => json!({"tableId":1,"intendedPlayerIds":[1]}),
                "chatPmHistory" => json!({"limit":10}),
                "lobbyLoad" | "linkList" => json!({}),
                _ => json!({"tableId":1}),
            };
            request(command, &value).unwrap_or_else(|e| panic!("{command}: {e}"));
        }
    }
    #[test]
    fn private_messages_take_only_a_message_and_recipient() {
        assert!(request("chatPm", &json!({"text":"hello","recipient":"Alice"})).is_ok());
        for data in [
            json!({"text":"hello","recipient":"Alice","tableId":1}),
            json!({"text":"hello","recipient":"Alice","admin":true}),
        ] {
            assert!(request("chatPm", &data).is_err());
        }
    }

    #[test]
    fn strict_types_limits_and_defaults() {
        for (command, data) in [
            ("action", json!({"tableId":1,"type":"pass","order":0})),
            ("chat", json!({"text":"x","admin":true})),
            ("tableStart", json!({"tableId":9_007_199_254_740_992_u64})),
            ("setting", json!({"settings":{"volume":"50"}})),
            ("linkList", json!([])),
            ("unknown", json!({})),
            ("historyFriendsGet", json!({"offset":0,"amount":10})),
            ("loaded", json!({"tableId":1,"requestId":"r"})),
        ] {
            assert!(request(command, &data).is_err(), "{command} {data}");
        }
        assert!(request("tableCreate", &json!({"settings":{"name":"Table"}})).is_err());
        let create = request(
            "tableCreate",
            &json!({"settings":{"name":"Table","maxPlayers":5,"options":{}}}),
        )
        .unwrap()
        .data();
        assert_eq!(create["settings"]["options"]["variantId"], 0);
    }

    #[test]
    fn requests_keep_an_id_to_answer_even_when_they_fail() {
        let unknown = parse(&json!({"id":7,"request":"unknown","data":{}}).to_string());
        assert_eq!(unknown.id, RequestId::new(7));
        assert!(unknown.command.is_none() && unknown.message.is_err());
        let invalid = parse(&json!({"id":8,"request":"chat","data":{"text":1}}).to_string());
        assert_eq!(
            (invalid.id, invalid.command),
            (RequestId::new(8), Some("chat"))
        );
        assert!(invalid.message.is_err());
        for input in [
            json!({"request":"linkList","data":{}}).to_string(),
            json!({"id":0,"request":"linkList","data":{}}).to_string(),
            json!({"id":1.5,"request":"linkList","data":{}}).to_string(),
            "linkList {}".to_owned(),
        ] {
            let request = parse(&input);
            assert!(request.id.is_none() && request.message.is_err(), "{input}");
        }
        let extra = parse(&json!({"id":2,"request":"linkList","data":{},"x":1}).to_string());
        assert_eq!(extra.id, RequestId::new(2));
        assert!(extra.message.is_err());
        assert!(
            parse(&json!({"id":3,"request":"linkList"}).to_string())
                .message
                .is_err()
        );
    }

    #[test]
    fn full_replays_exceeding_legacy_frame_limit_are_not_truncated() {
        let note = "n".repeat(65536);
        let input = frame(
            "replayCreate",
            &json!({"visibility":{"type":"solo"},"source":{"type":"imported","game":{
                "seed":"p2v0s1","notes":[[note],[]]
            }}}),
        );
        assert!(input.len() > 8192);
        let parsed = parse(&input).message.unwrap().data();
        assert_eq!(
            parsed["source"]["game"]["notes"][0][0]
                .as_str()
                .unwrap()
                .len(),
            65536
        );
        assert!(
            request(
                "replayAction",
                &json!({"tableId":1,"action":{"type":"hypothetical","control":{"type":"event","event":"{\"type\":\"turn\"}"}}})
            )
            .is_err()
        );
        assert!(
            parse(&"x".repeat(crate::transport::MAX_MESSAGE_BYTES + 1))
                .message
                .is_err()
        );
    }
}
