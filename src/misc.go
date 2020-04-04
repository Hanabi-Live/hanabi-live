package main

import (
	"fmt"
	"math"
	"math/rand"
	"regexp"
	"strings"
	"time"
)

/*
	Miscellaneous subroutines
*/

// From: https://stackoverflow.com/questions/47341278/how-to-format-a-duration-in-golang
func durationToString(d time.Duration) string {
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second
	return fmt.Sprintf("%02d:%02d", m, s)
}

func formatTimestampUnix(datetime time.Time) string {
	return datetime.Format("Mon Jan 02 15:04:05 MST 2006")
}

func getCurrentTimestamp() string {
	return formatTimestampUnix(time.Now())
}

// From: http://golangcookbook.blogspot.com/2012/11/generate-random-number-in-given-range.html
func getRandom(min int, max int) int {
	max++
	if max-min <= 0 {
		logger.Error("getRandom was given invalid arguments.")
		return 0
	}
	rand.Seed(time.Now().UnixNano())
	return rand.Intn(max-min) + min
}

func intInSlice(a int, slice []int) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}

// From: https://stackoverflow.com/questions/38554353/
var isAlphanumeric = regexp.MustCompile(`^[a-zA-Z0-9]+$`).MatchString
var isAlphanumericSpacesSafeSpecialCharacters = regexp.MustCompile(`^[a-zA-Z0-9 !-]+$`).MatchString

// From: https://gist.github.com/stoewer/fbe273b711e6a06315d19552dd4d33e6
var matchFirstCap = regexp.MustCompile("(.)([A-Z][a-z]+)")
var matchAllCap = regexp.MustCompile("([a-z0-9])([A-Z])")

// From: https://mrekucci.blogspot.com/2015/07/dont-abuse-mathmax-mathmin.html
func max(x, y int) int {
	if x > y {
		return x
	}
	return y
}

func secondsToDurationString(str string) (string, error) {
	// The s is for seconds
	var duration time.Duration
	if v, err := time.ParseDuration(str + "s"); err != nil {
		return "", err
	} else {
		duration = v
	}

	// Display only seconds if the duration is less than a minute
	if duration.Minutes() < 1 {
		seconds := math.Round(duration.Seconds())
		msg := fmt.Sprintf("%.0f second", seconds)
		if int(seconds) != 1 {
			msg += "s"
		}
		return msg, nil
	}

	// Display only minutes if the duration is less than an hour
	if duration.Hours() < 1 {
		minutes := math.Round(duration.Minutes())
		msg := fmt.Sprintf("%.0f minute", minutes)
		if int(minutes) != 1 {
			msg += "s"
		}
		return msg, nil
	}

	// Convert the duration into days, hours, and minutes
	hours := int(duration.Hours())
	minutes := int(duration.Minutes())
	minutes -= hours * 60
	days := 0
	for hours > 24 {
		days++
		hours -= 24
	}

	daysStr := "day"
	if days != 1 {
		daysStr += "s"
	}

	hoursStr := "hour"
	if hours != 1 {
		hoursStr += "s"
	}

	minutesStr := "minute"
	if minutes != 1 {
		minutesStr += "s"
	}

	// Display days only if the duration is over a day
	var msg string
	if days >= 1 {
		msg = "%d %s, %d %s, and %d %s"
		msg = fmt.Sprintf(msg, days, daysStr, hours, hoursStr, minutes, minutesStr)
	} else {
		msg = "%d %s and %d %s"
		msg = fmt.Sprintf(msg, hours, hoursStr, minutes, minutesStr)
	}

	return msg, nil
}

func stringInSlice(a string, slice []string) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}

func toSnakeCase(str string) string {
	snake := matchFirstCap.ReplaceAllString(str, "${1}_${2}")
	snake = matchAllCap.ReplaceAllString(snake, "${1}_${2}")
	return strings.ToLower(snake)
}
