/** A command sent from the client to the server. */
export enum ClientCommand {
  chat = "chat",
  chatFriend = "chatFriend",
  chatLink = "chatLink",
  chatLinked = "chatLinked",
  chatPlayerInfo = "chatPlayerInfo",
  chatPM = "chatPM",
  chatPMHistoryGet = "chatPMHistoryGet",
  chatUnfriend = "chatUnfriend",
  chatUnlink = "chatUnlink",
  getName = "getName",
  historyFriendsGet = "historyFriendsGet",
  historyGet = "historyGet",
  historyGetSeed = "historyGetSeed",
  inactive = "inactive",
  setting = "setting",
}
