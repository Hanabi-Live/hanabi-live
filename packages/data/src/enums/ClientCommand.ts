/** A command sent from the client to the server. */
export enum ClientCommand {
  chat = "chat",
  chatPM = "chatPM",
  chatPMHistoryGet = "chatPMHistoryGet",
  getName = "getName",
  historyFriendsGet = "historyFriendsGet",
  historyGet = "historyGet",
  historyGetSeed = "historyGetSeed",
  inactive = "inactive",
  setting = "setting",
}
