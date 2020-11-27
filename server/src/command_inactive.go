package main

// commandInactive is sent when the client detects that the user is inactive (or has returned)
// Example data:
// {
//   inactive: true,
// }
func commandInactive(s *Session, d *CommandData) {
	if s != nil {
		s.SetInactive(d.Inactive)
		notifyAllUserInactive(s)
	}
}
