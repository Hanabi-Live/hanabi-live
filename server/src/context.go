// This file contains some helper functions for working with Go contexts
// https://golang.org/pkg/context

package main

import (
	"context"
	"strconv"
	"sync/atomic"
)

type HanabiContextKeyType int
type HanabiContext struct {
	ContextID uint64
	Type      string
	SessionID uint64
	UserID    int
	Username  string
}

const HanabiContextKey HanabiContextKeyType = 0

var (
	// The counter is atomically incremented before assignment,
	// so the first context ID will be 1 and will increase from there
	contextIDCounter uint64 = 0
)

// NewSessionContext creates a context that will be associated with this WebSocket message
func NewSessionContext(s *Session) context.Context {
	ctx := context.Background()
	ctx = context.WithValue(ctx, HanabiContextKey, HanabiContext{
		ContextID: atomic.AddUint64(&contextIDCounter, 1),
		Type:      "session",
		SessionID: s.SessionID,
		UserID:    s.UserID,
		Username:  s.Username,
	})

	return ctx
}

// NewMiscContext creates a context that will be associated with a miscellaneous labeled goroutine
func NewMiscContext(contextType string) context.Context {
	ctx := context.Background()
	ctx = context.WithValue(ctx, HanabiContextKey, HanabiContext{ // nolint: exhaustivestruct
		ContextID: atomic.AddUint64(&contextIDCounter, 1),
		Type:      contextType,
	})

	return ctx
}

func printContextWithStackTrace(ctx context.Context, msg string) {
	msg += " - "

	if sessionContext, ok := ctx.Value(HanabiContextKey).(HanabiContext); !ok {
		msg += "[no context]"
	} else if sessionContext.Type == "session" {
		msg += "ContextID: " + strconv.FormatUint(sessionContext.ContextID, 10) + ", "
		msg += "Type: " + sessionContext.Type + ", "
		msg += "SessionID: " + strconv.FormatUint(sessionContext.SessionID, 10) + ", "
		msg += "UserID: " + strconv.Itoa(sessionContext.UserID) + ", "
		msg += "Username: " + sessionContext.Username + ", "
	} else {
		msg += "ContextID: " + strconv.FormatUint(sessionContext.ContextID, 10) + ", "
		msg += "Type: " + sessionContext.Type
	}
	// msg += "\n" + string(debug.Stack())

	logger.Debug(msg)
}
