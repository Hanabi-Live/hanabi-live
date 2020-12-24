package chat

// /rules
func (m *Manager) commandRules() {
	msg := "Please follow the community guidelines: https://github.com/Zamiell/hanabi-live/blob/master/docs/COMMUNITY_GUIDELINES.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
