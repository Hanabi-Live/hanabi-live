package commands

/*
// commandChatFriend is sent when a user types the "/friend" command
//
// Example data:
// {
//   name: 'Alice',
// }
func commandChatFriend(ctx context.Context, s *Session, d *CommandData) {
	friend(s, d, true)
}

// commandChatUnfriend is sent when a user types the "/unfriend" command
//
// Example data:
// {
//   name: 'Alice',
// }
func commandChatUnfriend(ctx context.Context, s *Session, d *CommandData) {
	friend(s, d, false)
}

func friend(s *Session, d *CommandData, add bool) {
	// Validate that they sent a username
	if len(d.Name) == 0 {
		var msg string
		if add {
			msg = "The format of the /friend command is: /friend [username]"
		} else {
			msg = "The format of the /unfriend command is: /unfriend [username]"
		}
		s.Warning(msg)
		return
	}

	normalizedUsername := normalizeString(d.Name)

	// Validate that they did not target themselves
	if normalizedUsername == normalizeString(s.Username) {
		var verb string
		if add {
			verb = "friend"
		} else {
			verb = "unfriend"
		}
		s.Warningf("You cannot %v yourself.", verb)
		return
	}

	// Validate that this person exists in the database
	var friend User
	if exists, v, err := models.Users.GetUserFromNormalizedUsername(
		normalizedUsername,
	); err != nil {
		hLog.Errorf(
			"Failed to validate that \"%v\" exists in the database: %v",
			normalizedUsername,
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else if !exists {
		s.Warningf("The username of \"%v\" does not exist in the database.", d.Name)
		return
	} else {
		friend = v
	}

	friendMap := s.Friends()
	var reverseFriendMap map[int]struct{}
	if s2, ok := sessions2.Get(friend.ID); ok {
		reverseFriendMap = s2.ReverseFriends()
	}

	var msg string
	if add {
		// Validate that this user is not already their friend
		if _, ok := friendMap[friend.ID]; ok {
			s.Warningf("\"%v\" is already your friend.", d.Name)
			return
		}

		// Add the friend
		if err := models.UserFriends.Insert(s.UserID, friend.ID); err != nil {
			hLog.Errorf(
				"Failed to insert a new friend for %v: %v",
				util.PrintUser(s.UserID, s.Username),
				err,
			)
			s.Error(DefaultErrorMsg)
			return
		}
		friendMap[friend.ID] = struct{}{}

		// Add the reverse friend (e.g. the inverse relationship)
		if err := models.UserReverseFriends.Insert(friend.ID, s.UserID); err != nil {
			hLog.Errorf(
				"Failed to insert a new reverse friend for %v: %v",
				util.PrintUser(s.UserID, s.Username),
				err,
			)
			s.Error(DefaultErrorMsg)
			return
		}
		if reverseFriendMap != nil {
			reverseFriendMap[s.UserID] = struct{}{}
		}

		msg = fmt.Sprintf("Successfully added \"%v\" to your friends list.", d.Name)
	} else {
		// Validate that this user is their friend
		if _, ok := friendMap[friend.ID]; !ok {
			s.Warningf("\"%v\" is not your friend, so you cannot unfriend them.", d.Name)
			return
		}

		// Remove the friend
		if err := models.UserFriends.Delete(s.UserID, friend.ID); err != nil {
			hLog.Errorf(
				"Failed to delete a friend for %v: %v",
				util.PrintUser(s.UserID, s.Username),
				err,
			)
			s.Error(DefaultErrorMsg)
			return
		}
		delete(friendMap, friend.ID)

		// Remove the reverse friend (e.g. the inverse relationship)
		if err := models.UserReverseFriends.Delete(friend.ID, s.UserID); err != nil {
			hLog.Errorf(
				"Failed to delete a reverse friend for %v: %v",
				util.PrintUser(s.UserID, s.Username),
				err,
			)
			s.Error(DefaultErrorMsg)
			return
		}
		if reverseFriendMap != nil {
			delete(reverseFriendMap, s.UserID)
		}

		msg = fmt.Sprintf("Successfully removed \"%v\" from your friends list.", d.Name)
	}
	chatServerSendPM(s, msg, d.Room)

	// Get their (new) friends from the database
	var friends []string
	if v, err := models.UserFriends.GetAllUsernames(s.UserID); err != nil {
		hLog.Errorf(
			"Failed to get the friends for %v: %v",
			util.PrintUser(s.UserID, s.Username),
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else {
		friends = v
	}

	// Send them their (new) friends
	type FriendsMessage struct {
		Friends []string `json:"friends"`
	}
	s.Emit("friends", &FriendsMessage{
		Friends: friends,
	})
}
*/
