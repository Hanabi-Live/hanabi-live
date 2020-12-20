// This file contains some helper functions for working with Go contexts
// https://golang.org/pkg/context

package main

import (
	"context"
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

const (
	hanabiContextKey HanabiContextKeyType = 0
)

var (
	// The counter is atomically incremented before assignment,
	// so the first context ID will be 1 and will increase from there
	contextIDCounter uint64 = 0
)

// NewMiscContext creates a context that will be associated with a miscellaneous labeled goroutine
func NewMiscContext(contextType string) context.Context {
	ctx := context.Background()
	ctx = context.WithValue(ctx, HanabiContextKey, HanabiContext{ // nolint: exhaustivestruct
		ContextID: atomic.AddUint64(&contextIDCounter, 1),
		Type:      contextType,
	})

	return ctx
}
