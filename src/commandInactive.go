/*
	Sent when the client detects that the user is inactive (or has returned)
	"data" example:
	{
		inactive: true,
	}
*/

package main

func commandInactive(s *Session, d *CommandData) {
	s.Set("inactive", d.Inactive)

	// Notify everyone about this change in inactivity
	notifyAllUserInactive(s)
}
