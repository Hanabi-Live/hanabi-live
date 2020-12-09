package util

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/mozillazg/go-unidecode"
	"golang.org/x/text/unicode/norm"
)

func NormalizeString(str string) string {
	// First, we transliterate the string to pure ASCII
	// Second, we lowercase it
	return strings.ToLower(unidecode.Unidecode(str))
}

func NumConsecutiveDiacritics(s string) int {
	// First, normalize with Normalization Form Canonical Decomposition (NFD) so that diacritics
	// are seprated from other characters
	// https://en.wikipedia.org/wiki/Unicode_equivalence
	// https://blog.golang.org/normalization
	normalizedString := norm.NFD.String(s)

	consecutiveDiacriticCount := 0
	maxConsecutive := 0
	for _, r := range normalizedString {
		// "Mn" stands for nonspacing mark, e.g. a diacritic
		// https://www.compart.com/en/unicode/category/Mn
		// From: https://stackoverflow.com/questions/26722450/remove-diacritics-using-go
		if unicode.Is(unicode.Mn, r) {
			consecutiveDiacriticCount++
			if consecutiveDiacriticCount > maxConsecutive {
				maxConsecutive = consecutiveDiacriticCount
			}
		} else {
			consecutiveDiacriticCount = 0
		}
	}

	return maxConsecutive
}

func PrintUser(userID int, username string) string {
	return fmt.Sprintf("user \"%v\" (%v)", username, userID)
}

func PrintUserCapitalized(userID int, username string) string {
	return fmt.Sprintf("User \"%v\" (%v)", username, userID)
}

func SanitizeTag(tag string) (string, error) {
	// Validate tag length
	if len(tag) > constants.MaxTagLength {
		// nolint: golint, stylecheck
		err := fmt.Errorf("Tags cannot be longer than %v characters.", constants.MaxTagLength)
		return tag, err
	}

	// Check for valid UTF8
	if !utf8.Valid([]byte(tag)) {
		err := errors.New("Tags must contain valid UTF8 characters.") // nolint: golint, stylecheck
		return tag, err
	}

	// Replace any whitespace that is not a space with a space
	tag2 := tag
	for _, letter := range tag2 {
		if unicode.IsSpace(letter) && letter != ' ' {
			tag = strings.ReplaceAll(tag, string(letter), " ")
		}
	}

	// Trim whitespace from both sides
	tag = strings.TrimSpace(tag)

	// Validate blank tags
	if tag == "" {
		err := errors.New("Tags cannot be blank.") // nolint: golint, stylecheck
		return tag, err
	}

	return NormalizeString(tag), nil
}

func SecondsToDurationString(seconds int) (string, error) {
	// The Golang parser needs the "s" to know that the value is seconds
	secondsWithS := fmt.Sprintf("%vs", seconds)
	var duration time.Duration
	if v, err := time.ParseDuration(secondsWithS); err != nil {
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
		msg = fmt.Sprintf(
			"%v %v, %v %v, and %v %v",
			days,
			daysStr,
			hours,
			hoursStr,
			minutes,
			minutesStr,
		)
	} else {
		msg = fmt.Sprintf("%v %v and %v %v", hours, hoursStr, minutes, minutesStr)
	}

	return msg, nil
}

// From: https://stackoverflow.com/questions/51997276/how-one-can-do-case-insensitive-sorting-using-sort-strings-in-golang
func SortStringsCaseInsensitive(slice []string) []string {
	sort.Slice(slice, func(i, j int) bool {
		return strings.ToLower(slice[i]) < strings.ToLower(slice[j])
	})
	return slice
}

func StringInSlice(a string, slice []string) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}
