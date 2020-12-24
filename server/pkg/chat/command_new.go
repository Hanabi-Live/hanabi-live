package chat

// /new
func (m *Manager) commandNew() {
	msg := "If you are looking to \"get into\" the game and spend a lot of time to play with experienced players, the Hyphen-ated group is always looking for more members. To start with, please read the beginners guide, which goes over how we play and how to join our next game: https://github.com/Zamiell/hanabi-conventions/blob/master/Beginner.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
