// Functions to return session values
// Session values are created in "http_ws.go"

package main

import (
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

func (s *Session) Status() int {
	if s == nil {
		logger.Error("The \"Status\" method was called for a nil session.")
		return 0
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	return s.Data.Status
}

func (s *Session) SetStatus(status int) {
	if s == nil {
		logger.Error("The \"SetStatus\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	s.Data.Status = status
	s.DataMutex.Unlock()
}

func (s *Session) TableID() uint64 {
	if s == nil {
		logger.Error("The \"TableID\" method was called for a nil session.")
		return 0
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	return s.Data.TableID
}

func (s *Session) SetTableID(tableID uint64) {
	if s == nil {
		logger.Error("The \"SetTableID\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	s.Data.TableID = tableID
	s.DataMutex.Unlock()
}

func (s *Session) Friends() map[int]struct{} {
	if s == nil {
		logger.Error("The \"Friends\" method was called for a nil session.")
		return make(map[int]struct{})
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	friends := make(map[int]struct{}, len(s.Data.Friends))
	for userID := range s.Data.Friends {
		friends[userID] = struct{}{}
	}
	return friends
}

func (s *Session) AddFriend(userID int) {
	if s == nil {
		logger.Error("The \"AddFriend\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	s.Data.Friends[userID] = struct{}{}
	s.DataMutex.Unlock()
}

func (s *Session) DeleteFriend(userID int) {
	if s == nil {
		logger.Error("The \"DeleteFriend\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	delete(s.Data.Friends, userID)
	s.DataMutex.Unlock()
}

func (s *Session) ReverseFriends() map[int]struct{} {
	if s == nil {
		logger.Error("The \"ReverseFriends\" method was called for a nil session.")
		return make(map[int]struct{})
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	reverseFriends := make(map[int]struct{}, len(s.Data.ReverseFriends))
	for userID := range s.Data.ReverseFriends {
		reverseFriends[userID] = struct{}{}
	}
	return reverseFriends
}

func (s *Session) AddReverseFriend(userID int) {
	if s == nil {
		logger.Error("The \"AddReverseFriend\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	s.Data.ReverseFriends[userID] = struct{}{}
	s.DataMutex.Unlock()
}

func (s *Session) DeleteReverseFriend(userID int) {
	if s == nil {
		logger.Error("The \"DeleteReverseFriend\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	delete(s.Data.ReverseFriends, userID)
	s.DataMutex.Unlock()
}

func (s *Session) Hyphenated() bool {
	if s == nil {
		logger.Error("The \"Hyphenated\" method was called for a nil session.")
		return false
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	return s.Data.Hyphenated
}

func (s *Session) SetHyphenated(hyphenated bool) {
	if s == nil {
		logger.Error("The \"SetHyphenated\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	s.Data.Hyphenated = hyphenated
	s.DataMutex.Unlock()
}

func (s *Session) Inactive() bool {
	if s == nil {
		logger.Error("The \"Inactive\" method was called for a nil session.")
		return false
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	return s.Data.Inactive
}

func (s *Session) SetInactive(inactive bool) {
	if s == nil {
		logger.Error("The \"SetInactive\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	s.Data.Inactive = inactive
	s.DataMutex.Unlock()
}

func (s *Session) RateLimitAllowance() float64 {
	if s == nil {
		logger.Error("The \"RateLimitAllowance\" method was called for a nil session.")
		return RateLimitRate
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	return s.Data.RateLimitAllowance
}

func (s *Session) SetRateLimitAllowance(rateLimitAllowance float64) {
	if s == nil {
		logger.Error("The \"SetRateLimitAllowance\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	s.Data.RateLimitAllowance = rateLimitAllowance
	s.DataMutex.Unlock()
}

func (s *Session) RateLimitLastCheck() time.Time {
	if s == nil {
		logger.Error("The \"RateLimitLastCheck\" method was called for a nil session.")
		return time.Now()
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	return s.Data.RateLimitLastCheck
}

func (s *Session) SetRateLimitLastCheck(rateLimitLastCheck time.Time) {
	if s == nil {
		logger.Error("The \"SetRateLimitLastCheck\" method was called for a nil session.")
		return
	}

	s.DataMutex.Lock()
	s.Data.RateLimitLastCheck = rateLimitLastCheck
	s.DataMutex.Unlock()
}

func (s *Session) Banned() bool {
	if s == nil {
		logger.Error("The \"Banned\" method was called for a nil session.")
		return false
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	return s.Data.Banned
}
