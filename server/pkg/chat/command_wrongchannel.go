package chat

// /wrongchannel
func (m *Manager) chatWrongChannel() {
	if t != nil {
		chatServerSend(ctx, NotInLobbyFail, d.Room, d.NoTablesLock)
		return
	}

	// This includes a discord link to the #convention-questions channel
	msg := "It looks like you are asking a question about the Hyphen-ated conventions or the Hyphen-ated group. Please ask all such questions in the <#456214043351580674> channel."
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
