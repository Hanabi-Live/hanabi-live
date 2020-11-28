package main

import (
	"sync"
)

type Sessions struct {
	sessions map[int]*Session // Indexed by user ID
	mutex    *sync.RWMutex    // For handling concurrent access
}

func NewSessions() *Sessions {
	return &Sessions{
		sessions: make(map[int]*Session),
	}
}

func (ss *Sessions) Get(userID int) (*Session, bool) {
	ss.mutex.RLock()
	defer ss.mutex.RUnlock()
	s, ok := ss.sessions[userID]
	return s, ok
}

func (ss *Sessions) GetList() []*Session {
	sessionList := make([]*Session, 0)
	ss.mutex.RLock()
	for _, s := range ss.sessions {
		sessionList = append(sessionList, s)
	}
	ss.mutex.RUnlock()
	return sessionList
}

func (ss *Sessions) Set(userID int, s *Session) {
	ss.mutex.Lock()
	ss.sessions[userID] = s
	ss.mutex.Unlock()
}

func (ss *Sessions) Delete(userID int) {
	ss.mutex.Lock()
	delete(ss.sessions, userID)
	ss.mutex.Unlock()
}

func (ss *Sessions) Length() int {
	ss.mutex.RLock()
	defer ss.mutex.RUnlock()
	return len(ss.sessions)
}
