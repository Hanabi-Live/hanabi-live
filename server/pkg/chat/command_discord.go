package chat

// /discord
func (m *Manager) commandDiscord() {
	msg := "Join the Discord server: https://discord.gg/FADvkJp"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
