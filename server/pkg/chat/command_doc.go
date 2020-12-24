package chat

// /doc
func (m *Manager) commandDoc() {
	msg := "The strategy reference for the Hyphen-ated group: https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
