package tables

type getUserTablesData struct {
	userID         int
	resultsChannel chan []int
}

// GetUserTables requests a list of all of the tables that a user is currently playing in and
// spectating.
func (m *Manager) GetUserTables(userID int) ([]int, []int) {
	resultsChannel := make(chan []int)

	if err := m.newRequest(requestTypeGetUserTables, &getUserTablesData{
		userID:         userID,
		resultsChannel: resultsChannel,
	}); err != nil {
		return make([]int, 0), make([]int, 0)
	}

	playingAtTables := <-resultsChannel
	spectatingTables := <-resultsChannel

	return playingAtTables, spectatingTables
}

func (m *Manager) getUserTables(data interface{}) interface{} {
	var d *getUserTablesData
	if v, ok := data.(*getUserTablesData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	d.resultsChannel <- m.getUserPlaying(d.userID)
	d.resultsChannel <- m.getUserSpectating(d.userID)

	return true
}
