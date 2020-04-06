package main

// commandInactive is sent when the client detects that the user is inactive (or has returned)
// Example data:
// {
//   inactive: true,
// }
func commandInactive(s *Session, d *CommandData) {
	s.Set("inactive", d.Inactive)

	// Notify everyone about this change in inactivity
	notifyAllUserInactive(s)
}
