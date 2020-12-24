package chat

// /bga
func (m *Manager) commandBGA() {
	msg := "If you have experience playing with the Board Game Arena convention framework and you are interested in playing with the Hyphen-ated group, then read this: https://github.com/Zamiell/hanabi-conventions/blob/master/misc/BGA.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
