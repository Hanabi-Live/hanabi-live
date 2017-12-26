/*
	Sent when the user:
	- is in a game that is starting
	- joins a game that has already started
	- starts a replay
	- starts spectating a game

	This is sent before the UI is initialized; the client will send a "ready"
	message later to get more data

	"data" is empty
*/

package main

func commandHello(s *Session, d *CommandData) {

}
