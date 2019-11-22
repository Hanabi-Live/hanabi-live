export default interface ChatMessage {
    msg: string,
    who: string,
    discord: boolean,
    server: boolean,
    datetime: number,
    room: string,
}
