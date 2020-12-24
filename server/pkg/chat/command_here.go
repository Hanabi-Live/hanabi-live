package chat

// /here
func (m *Manager) commandHere() {
	if t != nil {
		chatServerSend(ctx, NotInLobbyFail, d.Room, d.NoTablesLock)
		return
	}

	msg := "The /here command has been removed. If you look at the Discord voice channels to your left, there are almost certainly people from the Hyphen-ated group already playing or reviewing a game. Please politely ask to join them instead of pinging the entire server."
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
