package chat

// /help
func (m *Manager) commandHelp() {
	msg := "You can see the list of chat commands here: https://github.com/Zamiell/hanabi-live/blob/master/docs/CHAT_COMMANDS.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
