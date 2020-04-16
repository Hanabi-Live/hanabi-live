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

// /cancel
func chatCancel(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend(notFromLobbyErrorMessage, d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	cancel()
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

	maintenance(true)
}

// /unmaintenance
func chatUnmaintenance(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend(notFromLobbyErrorMessage, d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	maintenance(false)
}
