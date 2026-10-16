/** A command sent from the client to the server. */
export enum ClientCommand {
  chat = "chat",
  chatHistoryGet = "chatHistoryGet",
  chatPM = "chatPM",
  chatPMHistoryGet = "chatPMHistoryGet",
}
