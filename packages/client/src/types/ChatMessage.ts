export interface ChatMessage {
  msg: string;
  who: string;
  discord: boolean;
  server: boolean;
  datetime: string; // Converted to a date in the "chat.add()" function
  room: string;
  recipient: string;
}
