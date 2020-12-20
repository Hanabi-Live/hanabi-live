package util

import (
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/mozillazg/go-unidecode"
	"golang.org/x/text/unicode/norm"
)

// From: https://stackoverflow.com/questions/53069040/checking-a-string-contains-only-ascii-characters
func ContainsAllPrintableASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < 32 || s[i] > 126 { // 32 is " " and 126 is "~"
			return false
		}
	}

	return true
}

func FormatTimestampUnix(datetime time.Time) string {
	return datetime.Format("Mon Jan 02 15:04:05 MST 2006")
}

func GetCurrentTimestamp() string {
	return FormatTimestampUnix(time.Now())
}

// From: http://golangcookbook.blogspot.com/2012/11/generate-random-number-in-given-range.html
func GetRandom(min int, max int) (int, error) {
	max++
	if max-min <= 0 {
		err := fmt.Errorf("invalid arguments of %v and %v", min, max)
		return 0, err
	}
	rand.Seed(time.Now().UnixNano())
	return rand.Intn(max-min) + min, nil // nolint: gosec
}

func GetReplayURL(domain string, useTLS bool, args []string) string {
	if len(args) == 0 {
		return "The format of the /replay command is: /replay [game ID] [turn number]"
	}

	// Validate that the first argument is an integer
	arg1 := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	var id int
	if v, err := strconv.Atoi(arg1); err != nil {
		if _, err := strconv.ParseFloat(arg1, 64); err != nil {
			return fmt.Sprintf("\"%v\" is not an integer.", arg1)
		}
		return "The /replay command only accepts integers."
	} else {
		id = v
	}

	if len(args) == 0 {
		// They specified an ID but not a turn
		path := fmt.Sprintf("/replay/%v", id)
		url := getURLFromPath(useTLS, domain, path)
		return url
	}

	// Validate that the second argument is an integer
	arg2 := args[0]
	var turn int
	if v, err := strconv.Atoi(arg2); err != nil {
		if _, err := strconv.ParseFloat(arg2, 64); err != nil {
			return fmt.Sprintf("\"%v\" is not an integer.", arg2)
		}
		return "The /replay command only accepts integers."
	} else {
		turn = v
	}

	// They specified an ID and a turn
	path := fmt.Sprintf("/replay/%v#%v", id, turn)
	url := getURLFromPath(useTLS, domain, path)
	return url
}

func getURLFromPath(useTLS bool, domain string, path string) string {
	protocol := "http"
	if useTLS {
		protocol = "https"
	}
	return fmt.Sprintf("%v://%v%v", protocol, domain, path)
}

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

func RemoveNonPrintableCharacters(s string) string {
	return strings.Map(func(r rune) rune {
		if !unicode.IsPrint(r) {
			// This character is not printable by Go
			// https://golang.org/pkg/unicode/#IsPrint
			// Returning a negative value will drop the character from the string with no
			// replacement
			return -1
		}
		return r
	}, s)
}

func SanitizeTag(tag string) (string, string) {
	// Validate tag length
	if len(tag) > constants.MaxTagLength {
		return tag, "Tags cannot be longer than %v characters."
	}

	// Check for valid UTF8
	if !utf8.Valid([]byte(tag)) {
		return tag, "Tags must contain valid UTF8 characters."
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
		return tag, "Tags cannot be blank."
	}

	return NormalizeString(tag), ""
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
	minutes -= hours * 60 // nolint: gomnd
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

// From: https://stackoverflow.com/questions/51997276
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
