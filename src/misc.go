package main

import (
	"database/sql"
	"encoding/json"
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

// From: https://stackoverflow.com/questions/38554353/how-to-check-if-a-string-only-contains-alphabetic-characters-in-go
var isAlphanumericSpacesAndSafeSpecialCharacters = regexp.MustCompile(`^[a-zA-Z0-9 !-]+$`).MatchString

// From: https://stackoverflow.com/questions/22128282/easy-way-to-check-string-is-in-json-format-in-golang
func isJSON(s string) bool {
	var js json.RawMessage
	return json.Unmarshal([]byte(s), &js) == nil
}

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

func getGametimeString(timeString sql.NullString) (string, error) {
	if !timeString.Valid {
		return "", nil
	}

	// The s is for seconds
	var playtime time.Duration
	if v, err := time.ParseDuration(timeString.String + "s"); err != nil {
		return "", err
	} else {
		playtime = v
	}

	// Display only seconds for users that have played less than a minute
	if playtime.Minutes() < 1 {
		seconds := math.Round(playtime.Seconds())
		msg := fmt.Sprintf("%.0f second", seconds)
		if int(seconds) != 1 {
			msg += "s"
		}
		return msg, nil
	}

	// Display only minutes for users that played less than an hour
	if playtime.Hours() < 1 {
		minutes := math.Round(playtime.Minutes())
		msg := fmt.Sprintf("%.0f minute", minutes)
		if int(minutes) != 1 {
			msg += "s"
		}
		return msg, nil
	}

	// Convert the duration into days, hours, and minutes
	hours := int(playtime.Hours())
	minutes := int(playtime.Minutes())
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

	// Display days only for users that played over a day
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
