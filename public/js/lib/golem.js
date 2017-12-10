/*
   Copyright 2013 Niklas Voss

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

(function(global) {
    if (global["WebSocket"]) {
        const separator = ' ';
        const DefaultJSONProtocol = {
            unpack: (data) => {
                const name = data.split(separator)[0];
                return [name, data.substring(name.length + 1, data.length)];
            },
            unmarshal: data => JSON.parse(data),
            marshalAndPack: (name, data) => name + separator + JSON.stringify(data),
        };

        const Connection = function Connection(addr, debug) {
            this.ws = new WebSocket(addr);
            this.callbacks = {};
            this.debug = debug;
            this.ws.onclose = this.onClose.bind(this);
            this.ws.onopen = this.onOpen.bind(this);
            this.ws.onmessage = this.onMessage.bind(this);
            this.ws.onerror = this.onError.bind(this);
        };
        Connection.prototype = {
            constructor: Connection,
            protocol: DefaultJSONProtocol,
            setProtocol: function setProtocol(protocol) {
                this.protocol = protocol;
            },
            enableBinary: function enableBinary() {
                this.ws.binaryType = 'arraybuffer';
            },
            onClose: function onClose(evt) {
                if (this.callbacks.close) {
                    this.callbacks.close(evt);
                }
            },
            onMessage: function onMessage(evt) {
                const data = this.protocol.unpack(evt.data);
                if (this.callbacks[data[0]]) {
                    const obj = this.protocol.unmarshal(data[1]);
                    this.callbacks[data[0]](obj);
                } else if (this.debug) {
                    console.error('Recieved WebSocket message with no callback:', data[0], JSON.parse(data[1]));
                }
            },
            onOpen: function onOpen(evt) {
                if (this.callbacks.open) {
                    this.callbacks.open(evt);
                }
            },
            on: function on(name, callback) {
                this.callbacks[name] = callback;
            },
            emit: function emit(name, data) {
                this.ws.send(this.protocol.marshalAndPack(name, data));
            },

            // Added extra handlers beyond what the vanilla Golem code provides
            onError: function onError(evt) {
                if (this.callbacks.socketError) {
                    this.callbacks.socketError(evt);
                }
            },
            close: function close() {
                this.ws.close();
            },
        };

        global.golem = {
            Connection: Connection
        };

    } else {
        console.warn("golem: WebSockets not supported!");
    }
})(this);
