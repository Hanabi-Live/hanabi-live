package chat

// /uptime
func (m *Manager) commandUptime() {
	chatServerSend(ctx, getCameOnline(), d.Room, d.NoTablesLock)
	var uptime string
	if v, err := getUptime(); err != nil {
		hLog.Errorf("Failed to get the uptime: %v", err)
		chatServerSend(ctx, DefaultErrorMsg, d.Room, d.NoTablesLock)
		return
	} else {
		uptime = v
	}
	chatServerSend(ctx, uptime, d.Room, d.NoTablesLock)
}
