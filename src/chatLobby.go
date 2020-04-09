package main

const (
	notFromLobbyErrorMessage = "You can only perform this command in the lobby."
)

// /restart
func chatRestart(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend(notFromLobbyErrorMessage, d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	shutdown(true)
}

// /shutdown
func chatShutdown(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend(notFromLobbyErrorMessage, d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	shutdown(false)
}

// /maintenance
func chatMaintenance(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend(notFromLobbyErrorMessage, d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	maintenance()
}

// /cancel
func chatCancel(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend(notFromLobbyErrorMessage, d.Room)
		return
	}

	if !isAdmin(s, d) {
		chatServerSend("You must be an admin in order to perform this command.", d.Room)
		return
	}

	cancel()
}
