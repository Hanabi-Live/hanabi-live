interface WebSocketCallbackCommands {
  [command: string]: (data: any) => void;
}

type WebSocketCallbacks = WebSocketCallbackCommands & {
  open?: (evt: Event) => void;
  close?: (evt: Event) => void;
  socketError?: (evt: Event) => void;
};

// Connection is a class that manages a WebSocket connection to the server
// On top of the WebSocket protocol, the client and the server communicate using a specific format
// based on the protocol that the Golem WebSocket framework uses
// For more information, see "websocketMessage.go"
// Based on: https://github.com/trevex/golem_client/blob/master/golem.js
export default class Connection {
  ws: WebSocket;
  callbacks: WebSocketCallbacks = {};
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
    if (this.callbacks[command] !== undefined) {
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

  on(name: string, callback: (evt: any) => void) {
    this.callbacks[name] = callback;
  }

  send(command: string, data?: any) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    console.log(`%cSent ${command}:`, 'color: green;');
    console.log(data);
    this.ws.send(marshalAndPack(command, data || {}));
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
const unmarshal = (data: string) => JSON.parse(data) as unknown;
const marshalAndPack = (name: string, data: any) => name + separator + JSON.stringify(data);
