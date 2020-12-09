package sessions

import (
	"time"
)

const (
	// If this threshold is reached, the session will be terminated
	incomingMsgRateAmount = float64(100) // Per second
	// If this threshold is reached, the session will be terminated
	outgoingMsgMaxQueued = 16
	writeTimeoutLength   = time.Second * 5
)
