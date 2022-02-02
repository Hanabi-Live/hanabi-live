// Miscellaneous subroutines

package main

import (
	"fmt"
	"hash/crc64"
	"io/ioutil"
	"math"
	"math/rand"
	"net/url"
	"os/exec"
	"path"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/Hanabi-Live/hanabi-live/logger"
	sentry "github.com/getsentry/sentry-go"
	"github.com/mozillazg/go-unidecode"
	"go.uber.org/zap"
	"golang.org/x/text/unicode/norm"
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

func executeScript(script string) error {
	cmd := exec.Command(path.Join(projectPath, script)) // nolint:gosec
	cmd.Dir = projectPath
	outputBytes, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(outputBytes))
	logger.Info("\""+script+"\" completed.", zap.String("output", output))
	if err != nil {
		// The "cmd.CombinedOutput()" function will throw an error if the return code is not equal
		// to 0
		sentry.ConfigureScope(func(scope *sentry.Scope) {
			scope.SetTag("scriptOutput", output)
		})
		return fmt.Errorf("failed to execute \"%s\": %w", script, err)
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
	return rand.Intn(max-min) + min // nolint: gosec
}

func getURLFromPath(path string) string {
	protocol := "http"
	if useTLS {
		protocol = "https"
	}
	return protocol + "://" + domain + path
}

// getVersion will get the current version of the JavaScript client,
// which is contained in the "version.txt" file
// We want to read this file every time (as opposed to just reading it on server start) so that we
// can update the client without having to restart the entire server
func getVersion() int {
	var fileContents []byte
	if v, err := ioutil.ReadFile(versionPath); err != nil {
		logger.Error("Failed to read the \"" + versionPath + "\" file: " + err.Error())
		return 0
	} else {
		fileContents = v
	}
	versionString := string(fileContents)
	versionString = strings.TrimSpace(versionString)
	if v, err := strconv.Atoi(versionString); err != nil {
		logger.Error("Failed to convert \"" + versionString + "\" " +
			"(the contents of the version file) to a number: " + err.Error())
		return 0
	} else {
		return v
	}
}

func indexOf(value uint64, slice []uint64) int {
	for i, v := range slice {
		if v == value {
			return i
		}
	}

	return -1
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

// Ensures a number is between limits.
// Returns that number or the default value
func between(x, minimum, maximum, defaultValue int) int {
	if x < minimum || x > maximum {
		return defaultValue
	}
	return x
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
	// Remove the "legacy-x-" prefix from the seed, if it exists
	// (e.g. "legacy-1-", "legacy-2-", and so on)
	if strings.HasPrefix(seed, "legacy-") {
		seed = seed[len("legacy-x-"):]
	}
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

func truncateTrimCheckEmpty(name string) string {
	// Truncate long table names
	// (we do this first to prevent wasting CPU cycles on validating extremely long table names)
	if len(name) > MaxGameNameLength {
		name = name[0 : MaxGameNameLength-1]
	}

	// Trim whitespace from both sides
	name = strings.TrimSpace(name)

	// Make a default game name if they did not provide one
	if len(name) == 0 {
		name = getName()
	}

	return name
}

// Table name may only contain alphanum, some symbols or space
func isTableNameValid(name string) (bool, string) {
	if !tableNameHasValidCharacters(name) {
		msg := "Game names can only contain English letters, numbers, spaces, " +
			"<code>!</code>, " +
			"<code>@</code>, " +
			"<code>#</code>, " +
			"<code>$</code>, " +
			"<code>(</code>, " +
			"<code>)</code>, " +
			"<code>-</code>, " +
			"<code>_</code>, " +
			"<code>=</code>, " +
			"<code>+</code>, " +
			"<code>;</code>, " +
			"<code>:</code>, " +
			"<code>,</code>, " +
			"<code>.</code>, " +
			"and <code>?</code>."
		return false, msg
	}

	return true, ""
}

// Creates *Options if needed and checks each option for validity
func fixGameOptions(options *Options) *Options {
	// Validate that they sent the options object
	if options == nil {
		options = NewOptions()
	}

	// Validate that there can be no time controls if this is not a timed game
	if !options.Timed {
		options.TimeBase = 0
		options.TimePerTurn = 0
	}

	// Validate that a speedrun cannot be timed
	if options.Speedrun {
		options.Timed = false
		options.TimeBase = 0
		options.TimePerTurn = 0
	}

	// Validate that they did not send both the "One Extra Card" and the "One Less Card" option at
	// the same time (they effectively cancel each other out)
	if options.OneExtraCard && options.OneLessCard {
		options.OneExtraCard = false
		options.OneLessCard = false
	}

	return options
}

// Checks game options sanity
func areGameOptionsValid(options *Options) (bool, string) {
	// Validate that the variant name is valid
	if _, ok := variants[options.VariantName]; !ok {
		msg := "\"" + options.VariantName + "\" is not a valid variant."
		return false, msg
	}

	// Validate that the time controls are sane
	if options.Timed {
		if options.TimeBase <= 0 {
			msg := "\"" + strconv.Itoa(options.TimeBase) + "\" " +
				"is too small of a value for \"Base Time\"."
			return false, msg
		}
		if options.TimeBase > 604800 { // 1 week in seconds
			msg := "\"" + strconv.Itoa(options.TimeBase) + "\" " +
				"is too large of a value for \"Base Time\"."
			return false, msg
		}
		if options.TimePerTurn <= 0 {
			msg := "\"" + strconv.Itoa(options.TimePerTurn) + "\" " +
				"is too small of a value for \"Time per Turn\"."
			return false, msg
		}
		if options.TimePerTurn > 86400 { // 1 day in seconds
			msg := "\"" + strconv.Itoa(options.TimePerTurn) + "\" " +
				"is too large of a value for \"Time per Turn\"."
			return false, msg
		}
	}

	return true, ""
}

func yesNoFromBoolean(option bool) string {
	if option {
		return "Yes"
	}
	return "No"
}

// Valid Commands are:
//   !replay [int] [int]
//   !seed [alphanum and hyphen]
func isTableCommandValid(s *Session, d *CommandData, data *SpecialGameData) (bool, string) {
	if !strings.HasPrefix(d.Name, "!") {
		return true, ""
	}

	if d.GameJSON != nil {
		msg := "You cannot create a table with a special prefix if JSON data is also provided."
		return false, msg
	}

	args := strings.Split(d.Name, " ")
	command := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	command = strings.TrimPrefix(command, "!")
	command = strings.ToLower(command) // Commands are case-insensitive

	if command == "seed" {
		// !seed - Play a specific seed
		if len(args) != 1 {
			msg := "Games on specific seeds must be created in the form: " +
				"!seed [seed name]"
			return false, msg
		}

		if !seedHasValidCharacters(args[0]) {
			msg := "Seed names can only contain English letters, numbers " +
				"and <code>-</code>"
			return false, msg
		}

		// For normal games, the server creates seed suffixes sequentially from 0, 1, 2,
		// and so on
		// However, the seed does not actually have to be a number,
		// so allow the user to use any arbitrary string as a seed suffix
		data.SetSeedSuffix = args[0]
	} else if command == "replay" {
		// !replay - Replay a specific game up to a specific turn
		if len(args) != 1 && len(args) != 2 {
			msg := "Replays of specific games must be created in the form: " +
				"!replay [game ID] [turn number]"
			return false, msg
		}

		// Check for numeric arguments
		if v, err := strconv.Atoi(args[0]); err != nil {
			msg := "The game ID of \"" + args[0] + "\" is not a number."
			return false, msg
		} else {
			data.DatabaseID = v
		}

		if len(args) == 1 {
			data.SetReplayTurn = 1
		} else {
			if v, err := strconv.Atoi(args[1]); err != nil {
				msg := "The turn of \"" + args[1] + "\" is not a number."
				return false, msg
			} else {
				data.SetReplayTurn = v
			}

			if data.SetReplayTurn < 1 {
				msg := "The replay turn must be greater than 0."
				return false, msg
			}
		}

		// Check to see if the game ID exists on the server
		if exists, err := models.Games.Exists(data.DatabaseID); err != nil {
			logger.Error("Failed to check to see if game " + strconv.Itoa(data.DatabaseID) +
				" exists: " + err.Error())
			return false, CreateGameFail
		} else if !exists {
			msg := "That game ID does not exist in the database."
			return false, msg
		}

		// We have to minus the turn by one since turns are stored on the server starting at 0
		// and turns are shown to the user starting at 1
		data.SetReplayTurn--

		// Check to see if this turn is valid
		// (it has to be a turn before the game ends)
		var numTurns int
		if v, err := models.Games.GetNumTurns(data.DatabaseID); err != nil {
			logger.Error("Failed to get the number of turns from the database for game " +
				strconv.Itoa(data.DatabaseID) + ": " + err.Error())
			return false, InitGameFail
		} else {
			numTurns = v
		}
		if data.SetReplayTurn >= numTurns {
			msg := "Game #" + strconv.Itoa(data.DatabaseID) + " only has " +
				strconv.Itoa(numTurns) + " turns."
			return false, msg
		}

		data.SetReplay = true
	} else {
		msg := "You cannot start a game with an exclamation mark unless you are trying to use a specific game creation command."
		return false, msg
	}

	return true, ""
}

func getMemoryReport() string {
	// Based on https://golangcode.com/print-the-current-memory-usage/
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	msg := "Memory Report:"
	msg += fmt.Sprintf("\nAlloc = %v MiB", byteToMegaByte(memStats.Alloc))
	msg += fmt.Sprintf("\nTotalAlloc = %v MiB", byteToMegaByte(memStats.TotalAlloc))
	msg += fmt.Sprintf("\nSys = %v MiB", byteToMegaByte(memStats.TotalAlloc))
	msg += fmt.Sprintf("\nNumGC = %v\n", memStats.NumGC)

	return msg
}

func byteToMegaByte(b uint64) uint64 {
	return b / 1024 / 1024
}
