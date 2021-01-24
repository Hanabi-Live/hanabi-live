package sessions

type notifyGameActionData struct {
	userID  int
	tableID int
	action  interface{}
}

func (m *Manager) NotifyGameAction(userID int, tableID int, action interface{}) {
	m.newRequest(requestTypeNotifyGameAction, &notifyGameActionData{ // nolint: errcheck
		userID:  userID,
		tableID: tableID,
		action:  action,
	})
}

func (m *Manager) notifyGameAction(data interface{}) {
	var d *notifyGameActionData
	if v, ok := data.(*notifyGameActionData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type gameActionData struct {
		TableID int         `json:"tableID"`
		Action  interface{} `json:"action"`
	}
	m.send(d.userID, "gameAction", &gameActionData{
		TableID: d.tableID,
		Action:  d.action,
	})
}
