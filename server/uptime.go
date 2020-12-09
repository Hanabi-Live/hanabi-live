package main

import (
	"fmt"
	"time"
)

func getCameOnline() string {
	return fmt.Sprintf("The server came online at: %v", formatTimestampUnix(datetimeStarted))
}

func getUptime() (string, error) {
	elapsedTime := time.Since(datetimeStarted)
	elapsedSeconds := int(elapsedTime.Seconds())
	var durationString string
	if v, err := secondsToDurationString(elapsedSeconds); err != nil {
		return "", err
	} else {
		durationString = v
	}
	msg := fmt.Sprintf("Uptime: %v", durationString)
	return msg, nil
}
