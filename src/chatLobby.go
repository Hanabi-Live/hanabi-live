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

// /graceful
func chatGraceful(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend(notFromLobbyErrorMessage, d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	graceful(true)
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

	graceful(false)
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

	shuttingDown = true
	chatServerSend("The server is entering maintenance mode. "+
		"New game creation has been disabled.", "lobby")
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

	shuttingDown = false
	chatServerSend("Server restart has been canceled. New game creation has been enabled.", d.Room)
}
