export default interface ChatMessage {
  username: string;
  msg: string;
  room: string;
  discord: boolean;
  server: boolean;
  datetime: string; // Converted to a date in the "chat.add()" function
  recipient: string;
}
