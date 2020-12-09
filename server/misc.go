// Miscellaneous subroutines

package main

import (
	"fmt"
	"hash/crc64"
	"math/rand"
	"net/url"
	"os/exec"
	"path"
	"regexp"
	"strings"
	"time"
	"unicode"

	sentry "github.com/getsentry/sentry-go"
	"go.uber.org/zap"
)

// From: https://stackoverflow.com/questions/53069040/checking-a-string-contains-only-ascii-characters
func containsAllPrintableASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < 32 || s[i] > 126 { // 32 is " " and 126 is "~"
			return false
		}
	}
	return true
}

func executeScript(scriptName string) error {
	scriptPath := path.Join(projectPath, scriptName)
	cmd := exec.Command(scriptPath)
	cmd.Dir = projectPath
	outputBytes, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(outputBytes))
	hLog.Info(
		fmt.Sprintf("Script \"%v\" completed.", scriptName),
		zap.String("output", output),
	)
	if err != nil {
		// The "cmd.CombinedOutput()" function will throw an error if the return code is not equal
		// to 0
		sentry.ConfigureScope(func(scope *sentry.Scope) {
			scope.SetTag("scriptOutput", output)
		})
		return fmt.Errorf("failed to execute \"%v\": %w", scriptPath, err)
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
		hLog.Error("getRandom was given invalid arguments.")
		return 0
	}
	rand.Seed(time.Now().UnixNano())
	return rand.Intn(max-min) + min // nolint: gosec
}

func getURLFromPath(path string) string {
	protocol := "http"
	if useTLS {
		protocol = "https"
	}
	return fmt.Sprintf("%v://%v%v", protocol, domain, path)
}

func intInSlice(a int, slice []int) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}

// isValidUrl tests a string to determine if it is a well-structured url or not
// From: https://golangcode.com/how-to-check-if-a-string-is-a-url/
func isValidURL(toTest string) bool {
	_, err := url.ParseRequestURI(toTest)
	if err != nil {
		return false
	}

	u, err := url.Parse(toTest)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
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

// setSeed seeds the random number generator with a string
// Golang's "rand.Seed()" function takes an int64, so we need to convert a string to an int64
// We use the CRC64 hash function to do this
// Also note that seeding with negative numbers will not work
func setSeed(seed string) {
	crc64Table := crc64.MakeTable(crc64.ECMA)
	intSeed := crc64.Checksum([]byte(seed), crc64Table)
	rand.Seed(int64(intSeed))
}

func toSnakeCase(str string) string {
	snake := matchFirstCap.ReplaceAllString(str, "${1}_${2}")
	snake = matchAllCap.ReplaceAllString(snake, "${1}_${2}")
	return strings.ToLower(snake)
}
