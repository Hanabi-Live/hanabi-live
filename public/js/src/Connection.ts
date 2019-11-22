// Connection is a class that manages a WebSocket connection to the server
// The protocol used a command followed by JSON data, e.g.
// foo { "bar": "baz" }
// Based on: https://github.com/trevex/golem_client/blob/master/golem.js
export default class Connection {
    ws: WebSocket;
    callbacks: any = {};
    debug: boolean;

    constructor(addr: string, debug: boolean) {
        this.ws = new WebSocket(addr);
        this.debug = debug;

        this.ws.onclose = this.onClose.bind(this);
        this.ws.onopen = this.onOpen.bind(this);
        this.ws.onmessage = this.onMessage.bind(this);
        this.ws.onerror = this.onError.bind(this);
    }

    onOpen(evt: Event) {
        if (this.callbacks.open) {
            this.callbacks.open(evt);
        }
    }

    onClose(evt: CloseEvent) {
        if (this.callbacks.close) {
            this.callbacks.close(evt);
        }
    }

    onMessage(evt: MessageEvent) {
        const data = unpack(evt.data);
        const command = data[0];
        if (this.callbacks[command]) {
            const obj = unmarshal(data[1]);
            if (this.debug) {
                console.log(`%cReceived ${command}:`, 'color: blue;');
                console.log(obj);
            }
            this.callbacks[command](obj);
        } else {
            console.error('Received WebSocket message with no callback:', command, JSON.parse(data[1]));
        }
    }

    onError(evt: Event) {
        if (this.callbacks.socketError) {
            this.callbacks.socketError(evt);
        }
    }

    on(name: string, callback: any) {
        this.callbacks[name] = callback;
    }

    emit(name: string, data: any) {
        this.ws.send(marshalAndPack(name, data));
    }

    close() {
        this.ws.close();
    }
}

const separator = ' ';
const unpack = (data: string) => {
    const name = data.split(separator)[0];
    return [name, data.substring(name.length + 1, data.length)];
};
const unmarshal = (data: string) => JSON.parse(data);
const marshalAndPack = (name: string, data: string) => name + separator + JSON.stringify(data);
