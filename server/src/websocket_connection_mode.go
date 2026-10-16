package main

import "net/http"

// websocketConnectionMode describes the bootstrap contract, not authorization.
// Authentication is still enforced using the existing session cookie in httpWS.
func websocketConnectionMode(request *http.Request) string {
	if request != nil && request.URL != nil && request.URL.Query().Get("reconnect") == "1" {
		return "reconnect"
	}
	return "initial"
}
