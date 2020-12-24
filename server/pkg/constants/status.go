package constants

// Every player has a status associated with them for the purposes of showing "where they are" on
// the user list in the lobby.
type Status int

const (
	StatusLobby Status = iota
	StatusPregame
	StatusPlaying
	StatusSpectating
	StatusReplay
	StatusSharedReplay
)
