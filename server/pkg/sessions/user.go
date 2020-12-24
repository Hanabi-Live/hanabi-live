package sessions

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type user struct {
	UserID int    `json:"userID"`
	Name   string `json:"name"`

	Status     constants.Status `json:"status"`
	TableID    int              `json:"tableID"`
	Hyphenated bool             `json:"hyphenated"`
	Inactive   bool             `json:"inactive"`
}

func makeUser(s *session) *user {
	return &user{
		UserID: s.userID,
		Name:   s.username,

		Status:     s.status,
		TableID:    s.tableID,
		Hyphenated: s.hyphenated,
		Inactive:   s.inactive,
	}
}
