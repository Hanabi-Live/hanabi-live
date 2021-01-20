package chat

import (
	"context"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type friendData struct {
	userID         int
	username       string
	friends        map[int]struct{}
	targetUsername string
	add            bool
}

func (m *Manager) Friend(
	userID int,
	username string,
	friends map[int]struct{},
	targetUsername string,
	add bool,
) {
	m.newRequest(requestTypeFriend, &friendData{ // nolint: errcheck
		userID:         userID,
		username:       username,
		friends:        friends,
		targetUsername: targetUsername,
		add:            add,
	})
}

func (m *Manager) friend(data interface{}) {
	var d *friendData
	if v, ok := data.(*friendData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Validate that they sent a username
	if len(d.targetUsername) == 0 {
		var msg string
		if d.add {
			msg = "The format of the /friend command is: /friend [username]"
		} else {
			msg = "The format of the /unfriend command is: /unfriend [username]"
		}
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	}

	// Validate that they did not target themselves
	normalizedTargetUsername := util.NormalizeString(d.targetUsername)
	if normalizedTargetUsername == util.NormalizeString(d.username) {
		var verb string
		if d.add {
			verb = "friend"
		} else {
			verb = "unfriend"
		}
		msg := fmt.Sprintf("You cannot %v yourself.", verb)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	}

	// Validate that this person exists in the database
	var friend *models.User
	if exists, v, err := m.models.Users.GetUserFromNormalizedUsername(
		context.Background(),
		normalizedTargetUsername,
	); err != nil {
		m.logger.Errorf(
			"Failed to validate that \"%v\" exists in the database: %v",
			normalizedTargetUsername,
			err,
		)
		m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
		return
	} else if !exists {
		msg := fmt.Sprintf(
			"The username of \"%v\" does not exist in the database.",
			d.targetUsername,
		)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	} else {
		friend = v
	}

	if d.add {
		if !m.friendAdd(d, friend) {
			return
		}
	} else {
		if !m.friendDelete(d, friend) {
			return
		}
	}

	// Get their new friends from the database
	var friends []string
	if v, err := m.models.UserFriends.GetAllUsernames(context.Background(), d.userID); err != nil {
		m.logger.Errorf(
			"Failed to get the friends for %v: %v",
			util.PrintUser(d.userID, d.username),
			err,
		)
		m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
		return
	} else {
		friends = v
	}

	// Send them their new friends
	m.Dispatcher.Sessions.NotifyFriends(d.userID, friends)
}

func (m *Manager) friendAdd(d *friendData, friend *models.User) bool {
	// Validate that this user is not already their friend
	if _, ok := d.friends[friend.ID]; ok {
		msg := fmt.Sprintf("\"%v\" is already your friend.", d.targetUsername)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Add the friend to the database
	if err := m.models.UserFriends.Insert(context.Background(), d.userID, friend.ID); err != nil {
		m.logger.Errorf(
			"Failed to insert a new friend for %v: %v",
			util.PrintUser(d.userID, d.username),
			err,
		)
		m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
		return false
	}

	// Add the reverse friend (e.g. the inverse relationship) to the database
	if err := m.models.UserReverseFriends.Insert(
		context.Background(),
		friend.ID,
		d.userID,
	); err != nil {
		m.logger.Errorf(
			"Failed to insert a new reverse friend for %v: %v",
			util.PrintUser(d.userID, d.username),
			err,
		)
		m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
		return false
	}

	// Submit a request to modify the friend map in memory
	/*
		friendMap[friend.ID] = struct{}{}
		if reverseFriendMap != nil {
			reverseFriendMap[s.UserID] = struct{}{}
		}

		msg = fmt.Sprintf("Successfully added \"%v\" to your friends list.", d.Name)
		chatServerSendPM(s, msg, d.Room)
	*/

	return true
}

func (m *Manager) friendDelete(d *friendData, friend *models.User) bool {
	// Validate that this user is their friend
	if _, ok := d.friends[friend.ID]; !ok {
		msg := fmt.Sprintf(
			"\"%v\" is not your friend, so you cannot unfriend them.",
			d.targetUsername,
		)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Remove the friend from the database
	if err := m.models.UserFriends.Delete(context.Background(), d.userID, friend.ID); err != nil {
		m.logger.Errorf(
			"Failed to delete a friend for %v: %v",
			util.PrintUser(d.userID, d.username),
			err,
		)
		m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
		return false
	}

	// Remove the reverse friend (e.g. the inverse relationship)
	if err := m.models.UserReverseFriends.Delete(
		context.Background(),
		friend.ID,
		d.userID,
	); err != nil {
		m.logger.Errorf(
			"Failed to delete a reverse friend for %v: %v",
			util.PrintUser(d.userID, d.username),
			err,
		)
		m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
		return false
	}

	// Submit a request to modify the friend map in memory

	/*
		// Remove the friend from the map
		delete(friendMap, friend.ID)
		if reverseFriendMap != nil {
			delete(reverseFriendMap, s.UserID)
		}
	*/

	/*
		msg = fmt.Sprintf("Successfully removed \"%v\" from your friends list.", d.Name)
		chatServerSendPM(s, msg, d.Room)
	*/

	return true
}
