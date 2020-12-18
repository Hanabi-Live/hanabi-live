package sessions

type User struct {
	UserID   int    `json:"userID"`
	Username string `json:"username"`

	Status     int    `json:"status"`
	TableID    uint64 `json:"tableID"`
	Hyphenated bool   `json:"hyphenated"`
	Inactive   bool   `json:"inactive"`
}

func makeUser(s *session) *User {
	return &User{
		UserID:   s.userID,
		Username: s.username,

		Status:     s.status,
		TableID:    s.tableID,
		Hyphenated: s.hyphenated,
		Inactive:   s.inactive,
	}
}
