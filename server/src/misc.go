// Miscellaneous subroutines

package main

import (
	"fmt"
	"hash/crc64"
	"io/ioutil"
	"math"
	"math/rand"
	"os/exec"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/mozillazg/go-unidecode"
	"golang.org/x/text/unicode/norm"
)

func executeScript(script string) error {
	cmd := exec.Command(path.Join(projectPath, script)) // nolint:gosec
	cmd.Dir = projectPath
	output, err := cmd.CombinedOutput()
	if err != nil {
		// The "cmd.CombinedOutput()" function will throw an error if the return code is not equal
		// to 0
		logger.Error("Failed to execute \""+script+"\":", err)
		if string(output) != "" {
			logger.Error("Output is as follows:")
			logger.Error(string(output))
		}
		return err
	}
	logger.Info("\"" + script + "\" completed.")
	if string(output) != "" {
		logger.Info("Output is as follows:")
		logger.Info(string(output))
	}
	return nil
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

// getVersion will get the current version of the JavaScript client,
// which is contained in the "version.txt" file
// We want to read this file every time (as opposed to just reading it on server start) so that we
// can update the client without having to restart the entire server
func getVersion() int {
	var fileContents []byte
	if v, err := ioutil.ReadFile(versionPath); err != nil {
		logger.Error("Failed to read the \""+versionPath+"\" file:", err)
		return 0
	} else {
		fileContents = v
	}
	versionString := string(fileContents)
	versionString = strings.TrimSpace(versionString)
	if v, err := strconv.Atoi(versionString); err != nil {
		logger.Error("Failed to convert \""+versionString+"\" "+
			"(the contents of the version file) to a number:", err)
		return 0
	} else {
		return v
	}
}

func intInSlice(a int, slice []int) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}

// From: https://stackoverflow.com/questions/53069040/checking-a-string-contains-only-ascii-characters
func containsAllPrintableASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < 32 || s[i] > 126 { // 32 is " " and 126 is "~"
			return false
		}
	}
	return true
}

// From: https://stackoverflow.com/questions/38554353/how-to-check-if-a-string-only-contains-alphabetic-characters-in-go
var isAlphanumericHyphen = regexp.MustCompile(`^[a-zA-Z0-9\-]+$`).MatchString

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

func normalizeString(str string) string {
	// First, we transliterate the string to pure ASCII
	// Second, we lowercase it
	return strings.ToLower(unidecode.Unidecode(str))
}

func numConsecutiveDiacritics(s string) int {
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

func removeNonPrintableCharacters(s string) string {
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

func secondsToDurationString(seconds int) (string, error) {
	// The s is for seconds
	var duration time.Duration
	if v, err := time.ParseDuration(strconv.Itoa(seconds) + "s"); err != nil {
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

// setSeed seeds the random number generator with a string
// Golang's "rand.Seed()" function takes an int64, so we need to convert a string to an int64
// We use the CRC64 hash function to do this
// Also note that seeding with negative numbers will not work
func setSeed(seed string) {
	crc64Table := crc64.MakeTable(crc64.ECMA)
	intSeed := crc64.Checksum([]byte(seed), crc64Table)
	rand.Seed(int64(intSeed))
}

func stringInSlice(a string, slice []string) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}

// From: https://stackoverflow.com/questions/51997276/how-one-can-do-case-insensitive-sorting-using-sort-strings-in-golang
func sortStringsCaseInsensitive(slice []string) []string {
	sort.Slice(slice, func(i, j int) bool {
		return strings.ToLower(slice[i]) < strings.ToLower(slice[j])
	})
	return slice
}

func toSnakeCase(str string) string {
	snake := matchFirstCap.ReplaceAllString(str, "${1}_${2}")
	snake = matchAllCap.ReplaceAllString(snake, "${1}_${2}")
	return strings.ToLower(snake)
}
