// MsgClue represents how a clue looks on the server
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
export default class MsgClue {
    type: number;
    value: number;

    constructor(type: number, value: number) {
        this.type = type;
        this.value = value;
    }
}
