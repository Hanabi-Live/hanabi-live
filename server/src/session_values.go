// Functions to return session values
// Session values are created in "http_ws.go"

package main

import (
	"time"
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
	return s.Data.Friends
}

func (s *Session) ReverseFriends() map[int]struct{} {
	if s == nil {
		logger.Error("The \"ReverseFriends\" method was called for a nil session.")
		return make(map[int]struct{})
	}

	s.DataMutex.RLock()
	defer s.DataMutex.RUnlock()
	return s.Data.ReverseFriends
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
