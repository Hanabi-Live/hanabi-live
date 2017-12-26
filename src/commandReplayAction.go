/*
	Sent when the user performs an action in a shared replay
	"data" example:
	{
		type: 0,
		// 0 is a turn change
		// 1 is a manual card order indication
		value: 10,
	}
*/

package main

func commandReplayAction(s *Session, d *CommandData) {

}
