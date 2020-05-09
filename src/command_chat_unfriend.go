package main

import (
	"time"
)

// commandChatUnfriend is sent when a user types the "/unfriend" command
//
// Example data:
// {
//   name: 'Alice',
// }
func commandChatUnfriend(s *Session, d *CommandData) {
	// Validate that they sent a username
	if len(d.Name) == 0 {
		s.Warning("The format of the /unfriend command is: /unfriend [username]")
		return
	}

	// Validate that this person exists in the database
	var friend User
	if exists, v, err := models.Users.Get(d.Name); err != nil {
		logger.Error("Failed to validate that \""+d.Name+"\" exists in the database:", err)
		s.Error(defaultErrorMsg)
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
		logger.Error("Failed to get the friends for user \""+s.Username()+"\":", err)
		s.Error(defaultErrorMsg)
		return
	} else {
		friendIDs = v
	}

	// Validate that this user is their friend
	if !intInSlice(friend.ID, friendIDs) {
		s.Warning("\"" + d.Name + "\" is not your friend, so you cannot unfriend them.")
		return
	}

	// Remove the friend
	if err := models.UserFriends.Delete(s.UserID(), friend.ID); err != nil {
		logger.Error("Failed to delete a friend for user \""+s.Username()+"\":", err)
		s.Error(defaultErrorMsg)
		return
	}

	s.Emit("chat", &ChatMessage{
		Msg:       "Successfully removed \"" + d.Name + "\" from your friends list.",
		Who:       "Hanabi Live",
		Datetime:  time.Now(),
		Room:      d.Room,
		Recipient: s.Username(),
	})
}
