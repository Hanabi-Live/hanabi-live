package chat

// /replay [databaseID] [turn]
func (m *Manager) commandReplay() {
	msg := getReplayURL(d.Args)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
