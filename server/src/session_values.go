// Functions to return session values
// Session values are created in "http_ws.go"

package main

import (
	"time"
)

func (s *Session) SessionID() int {
	if s == nil {
		logger.Error("The \"SessionID\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("sessionID"); !exists {
		logger.Error("Failed to get \"SessionID\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) UserID() int {
	if s == nil {
		logger.Error("The \"UserID\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("userID"); !exists {
		logger.Error("Failed to get \"userID\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Username() string {
	if s == nil {
		logger.Error("The \"Username\" method was called for a nil session.")
		return "Unknown"
	}

	if v, exists := s.Get("username"); !exists {
		logger.Error("Failed to get \"username\" from a session.")
		return "Unknown"
	} else {
		return v.(string)
	}
}

func (s *Session) Muted() bool {
	if s == nil {
		logger.Error("The \"Muted\" method was called for a nil session.")
		return false
	}

	if v, exists := s.Get("muted"); !exists {
		logger.Error("Failed to get \"muted\" from a session.")
		return false
	} else {
		return v.(bool)
	}
}

func (s *Session) Status() int {
	if s == nil {
		logger.Error("The \"Status\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("status"); !exists {
		logger.Error("Failed to get \"status\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Table() int {
	if s == nil {
		logger.Error("The \"Table\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("table"); !exists {
		logger.Error("Failed to get \"table\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Friends() map[int]struct{} {
	if s == nil {
		logger.Error("The \"Friends\" method was called for a nil session.")
		return make(map[int]struct{})
	}

	if v, exists := s.Get("friends"); !exists {
		logger.Error("Failed to get \"friends\" from a session.")
		return make(map[int]struct{})
	} else {
		return v.(map[int]struct{})
	}
}

func (s *Session) ReverseFriends() map[int]struct{} {
	if s == nil {
		logger.Error("The \"ReverseFriends\" method was called for a nil session.")
		return make(map[int]struct{})
	}

	if v, exists := s.Get("reverseFriends"); !exists {
		logger.Error("Failed to get \"reverseFriends\" from a session.")
		return make(map[int]struct{})
	} else {
		return v.(map[int]struct{})
	}
}

func (s *Session) Inactive() bool {
	if s == nil {
		logger.Error("The \"Inactive\" method was called for a nil session.")
		return false
	}

	if v, exists := s.Get("inactive"); !exists {
		logger.Error("Failed to get \"inactive\" from a session.")
		return false
	} else {
		return v.(bool)
	}
}

func (s *Session) FakeUser() bool {
	if s == nil {
		logger.Error("The \"FakeUser\" method was called for a nil session.")
		return false
	}

	if v, exists := s.Get("fakeUser"); !exists {
		logger.Error("Failed to get \"fakeUser\" from a session.")
		return false
	} else {
		return v.(bool)
	}
}

func (s *Session) RateLimitAllowance() float64 {
	if s == nil {
		logger.Error("The \"RateLimitAllowance\" method was called for a nil session.")
		return RateLimitRate
	}

	if v, exists := s.Get("rateLimitAllowance"); !exists {
		logger.Error("Failed to get \"rateLimitAllowance\" from a session.")
		return -1
	} else {
		return v.(float64)
	}
}

func (s *Session) RateLimitLastCheck() time.Time {
	if s == nil {
		logger.Error("The \"RateLimitLastCheck\" method was called for a nil session.")
		return time.Now()
	}

	if v, exists := s.Get("rateLimitLastCheck"); !exists {
		logger.Error("Failed to get \"rateLimitLastCheck\" from a session.")
		return time.Now()
	} else {
		return v.(time.Time)
	}
}

func (s *Session) Banned() bool {
	if s == nil {
		logger.Error("The \"Banned\" method was called for a nil session.")
		return false
	}

	if v, exists := s.Get("banned"); !exists {
		logger.Error("Failed to get \"banned\" from a session.")
		return false
	} else {
		return v.(bool)
	}
}
