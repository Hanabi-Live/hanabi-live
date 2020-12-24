package sessions

func (m *Manager) notifyAllUser(s *session) {
	m.sendAll("user", makeUser(s))
}

func (m *Manager) notifyAllUserLeft(userID int) {
	type userLeftData struct {
		UserID int `json:"userID"`
	}
	m.sendAll("userLeft", &userLeftData{
		UserID: userID,
	})
}
