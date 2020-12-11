package sessions

import (
	"time"
)

const (
	// If this threshold is reached, the session will be terminated.
	// It is in messages per second.
	incomingMsgRateAmount = float64(100) // nolint: gomnd
	// If this threshold is reached, the session will be terminated.
	outgoingMsgMaxQueued = 16
	writeTimeoutLength   = time.Second * 5
)
