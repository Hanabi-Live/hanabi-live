package main

import (
	"time"
)

func getCameOnline() string {
	return "The server came online at: " + formatTimestampUnix(datetimeStarted)
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
	return "Uptime: " + durationString, nil
}
