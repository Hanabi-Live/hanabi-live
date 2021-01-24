package sessions

type notifyTableProgressData struct {
	userIDs  []int
	tableID  int
	progress int
}

func (m *Manager) NotifyTableProgress(userIDs []int, tableID int, progress int) {
	m.newRequest(requestTypeNotifyTableProgress, &notifyTableProgressData{ // nolint: errcheck
		userIDs:  userIDs,
		tableID:  tableID,
		progress: progress,
	})
}

func (m *Manager) notifyTableProgress(data interface{}) {
	var d *notifyTableProgressData
	if v, ok := data.(*notifyTableProgressData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// We want to notify both the members of the table and the people who have them on their friends
	// list
	relevantUserIDs := m.getRelevantUserIDs(d.userIDs, false)

	type tableProgressData struct {
		TableID  int `json:"tableID"`
		Progress int `json:"progress"`
	}
	for _, userID := range relevantUserIDs {
		m.send(userID, "tableProgress", &tableProgressData{
			TableID:  d.tableID,
			Progress: d.progress,
		})
	}
}
