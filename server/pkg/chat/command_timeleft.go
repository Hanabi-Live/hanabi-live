package chat

// /timeleft
func (m *Manager) commandTimeLeft() {
	var timeLeft string
	if v, err := getTimeLeft(); err != nil {
		hLog.Errorf("Failed to get the time left: %v", err)
		chatServerSend(ctx, DefaultErrorMsg, d.Room, d.NoTablesLock)
		return
	} else {
		timeLeft = v
	}

	chatServerSend(ctx, timeLeft, d.Room, d.NoTablesLock)
}
