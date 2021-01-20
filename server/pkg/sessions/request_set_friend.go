package sessions

type setFriendData struct {
	userID   int
	friendID int
	add      bool
}

// SetStatus updates both the status and the table ID values within a user's session object.
// Then, it notifies all other online users about this user's new status.
func (m *Manager) SetFriend(userID int, friendID int, add bool) {
	m.newRequest(requestTypeSetFriend, &setFriendData{ // nolint: errcheck
		userID:   userID,
		friendID: friendID,
		add:      add,
	})
}

func (m *Manager) setFriend(data interface{}) {
	var d *setFriendData
	if v, ok := data.(*setFriendData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	var s *session
	if v, ok := m.sessions[d.userID]; !ok {
		// Other server components might be trying to send a message to a user who has already
		// disconnected, so just ignore this request
		return
	} else {
		s = v
	}

	// Add or delete the new friend
	if d.add {
		s.data.friends[d.friendID] = struct{}{}
	} else {
		delete(s.data.friends, d.friendID)
	}

	// Also, add or delete the reverse relationship
	// (but only if that user is online)
	var s2 *session
	if v, ok := m.sessions[d.friendID]; !ok {
		// They are not online
		return
	} else {
		s2 = v
	}

	if d.add {
		s2.data.reverseFriends[d.userID] = struct{}{}
	} else {
		delete(s2.data.reverseFriends, d.userID)
	}
}
