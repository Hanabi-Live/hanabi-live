/** A command sent from the server to the client. */
export enum ServerCommand {
  chat = "chat",
  error = "error",
  table = "table",
  tableList = "tableList",
  user = "user",
  userLeft = "userLeft",
  userList = "userList",
  warning = "warning",
  welcome = "welcome",
}
