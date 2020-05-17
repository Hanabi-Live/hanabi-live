package main

import (
	"time"
)

// commandChatFriend is sent when a user types the "/friend" command
//
// Example data:
// {
//   name: 'Alice',
// }
func commandChatFriend(s *Session, d *CommandData) {
	friend(s, d, true)
}

// commandChatUnfriend is sent when a user types the "/unfriend" command
//
// Example data:
// {
//   name: 'Alice',
// }
func commandChatUnfriend(s *Session, d *CommandData) {
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

	// Normalize the username
	normalizedUsername := normalizeUsername(d.Name)

	// Validate that they did not target themselves
	if normalizedUsername == normalizeUsername(s.Username()) {
		var verb string
		if add {
			verb = "friend"
		} else {
			verb = "unfriend"
		}
		s.Warning("You cannot " + verb + " yourself.")
		return
	}

	// Validate that this person exists in the database
	var friend User
	if exists, v, err := models.Users.GetUserFromNormalizedUsername(
		normalizedUsername,
	); err != nil {
		logger.Error("Failed to validate that \""+normalizedUsername+"\" exists in the "+
			"database:", err)
		s.Error(DefaultErrorMsg)
		return
	} else if !exists {
		s.Warning("The username of \"" + d.Name + "\" does not exist in the database.")
		return
	} else {
		friend = v
	}

	// Get all of their existing friends
	var friendIDs []int
	if v, err := models.UserFriends.GetAllIDs(s.UserID()); err != nil {
		logger.Error("Failed to get the friend IDs for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		friendIDs = v
	}

	var msg string
	if add {
		// Validate that this user is not already their friend
		if intInSlice(friend.ID, friendIDs) {
			s.Warning("\"" + d.Name + "\" is already your friend.")
			return
		}

		// Add the friend
		if err := models.UserFriends.Insert(s.UserID(), friend.ID); err != nil {
			logger.Error("Failed to insert a new friend for user \""+s.Username()+"\":", err)
			s.Error(DefaultErrorMsg)
			return
		}

		msg = "Successfully added \"" + d.Name + "\" to your friends list."
	} else {
		// Validate that this user is their friend
		if !intInSlice(friend.ID, friendIDs) {
			s.Warning("\"" + d.Name + "\" is not your friend, so you cannot unfriend them.")
			return
		}

		// Remove the friend
		if err := models.UserFriends.Delete(s.UserID(), friend.ID); err != nil {
			logger.Error("Failed to delete a friend for user \""+s.Username()+"\":", err)
			s.Error(DefaultErrorMsg)
			return
		}

		msg = "Successfully removed \"" + d.Name + "\" from your friends list."
	}

	// Get their (new) friends from the database
	var friends []string
	if v, err := models.UserFriends.GetAll(s.UserID()); err != nil {
		logger.Error("Failed to get the friends for user \""+s.Username()+"\":", err)
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

	s.Emit("chat", &ChatMessage{
		Msg:       msg,
		Who:       "Hanabi Live",
		Datetime:  time.Now(),
		Room:      d.Room,
		Recipient: s.Username(),
	})
}
