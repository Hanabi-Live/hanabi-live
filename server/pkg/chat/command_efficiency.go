package chat

// /efficiency
func (m *Manager) commandEfficiency() {
	msg := "Info on efficiency calculation: https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
