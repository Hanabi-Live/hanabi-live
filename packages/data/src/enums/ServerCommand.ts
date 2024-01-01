/** A command sent from the server to the client. */
export enum ServerCommand {
  chat = "chat",
  error = "error",
  user = "user",
  userLeft = "userLeft",
  warning = "warning",
  welcome = "welcome",
}
