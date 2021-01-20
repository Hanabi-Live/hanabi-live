package table

import (
	"context"
	"fmt"
	"sort"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

func (m *Manager) Tags() {
	m.newRequest(requestTypeTags, nil) // nolint: errcheck
}

func (m *Manager) tags(data interface{}) {
	// Local variables
	t := m.table

	if !t.Replay {
		m.Dispatcher.Chat.ChatServer(constants.NotReplayFail, t.getRoomName())
		return
	}

	// Get the tags from the database
	var tags []string
	if v, err := m.models.GameTags.GetAll(
		context.Background(),
		t.ExtraOptions.DatabaseID,
	); err != nil {
		m.logger.Errorf(
			"Failed to get the tags for game ID %v: %v",
			t.ExtraOptions.DatabaseID,
			err,
		)
		m.Dispatcher.Chat.ChatServer(constants.DefaultErrorMsg, t.getRoomName())
		return
	} else {
		tags = v
	}

	if len(tags) == 0 {
		msg := "There are not yet any tags for this game."
		m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
		return
	}

	// We don't have to worry about doing a case-insensitive sort since all the tags should be
	// lowercase
	sort.Strings(tags)

	msg := "The list of tags for this game are as follows:"
	m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())

	for i, tag := range tags {
		msg := fmt.Sprintf("%v) %v", i+1, tag)
		m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
	}
}
