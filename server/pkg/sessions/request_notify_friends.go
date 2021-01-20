package sessions

type notifyFriendsData struct {
	userID  int
	friends []string
}

func (m *Manager) NotifyFriends(userID int, friends []string) {
	m.newRequest(requestTypeNotifyFriends, &notifyFriendsData{ // nolint: errcheck
		userID:  userID,
		friends: friends,
	})
}

func (m *Manager) notifyFriends(data interface{}) {
	var d *notifyFriendsData
	if v, ok := data.(*notifyFriendsData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type friendsData struct {
		Friends []string `json:"friends"`
	}
	m.send(d.userID, "friends", &friendsData{
		Friends: d.friends,
	})
}
