package tables

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/table"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/alexedwards/argon2id"
)

type NewData struct {
	Name     string           `json:"name"`
	Options  *options.Options `json:"options"`
	Password string           `json:"password"`
	GameJSON *table.GameJSON  `json:"gameJSON"`

	userID      int    `json:"-"`
	username    string `json:"-"`
	hidePregame bool   `json:"-"`
}

const (
	maxTableNameLength = 45
	oneWeekInSeconds   = 604800
	oneDayInSeconds    = 86400
)

// New requests that a new table is created.
// It will block until an error is received (e.g. the request is complete).
func (m *Manager) New(userID int, username string, hidePregame bool, d *NewData) {
	d.userID = userID
	d.username = username
	d.hidePregame = hidePregame
	m.newRequest(requestTypeNew, d) // nolint: errcheck
}

func (m *Manager) new(data interface{}) {
	var d *NewData
	if v, ok := data.(*NewData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	if !m.newValidate(d) { // This function can modify "d.Name" and "d.Options"
		return
	}

	if !m.newValidateSpecialTable()

	// newTableData :=

	t := table.NewManager(m.logger, newTableData)
}

func (m *Manager) newValidate(d *NewData) bool {
	// Validate that the server is not in maintenance mode or shutting down soon
	if allowed, msg := m.Dispatcher.Core.IsNewTablesAllowed(); !allowed {
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Truncate long table names
	// (we do this first to prevent wasting CPU cycles on validating extremely long table names)
	if len(d.Name) > maxTableNameLength {
		d.Name = d.Name[0 : maxTableNameLength-1]
	}

	// Remove any non-printable characters, if any
	d.Name = util.RemoveNonPrintableCharacters(d.Name)

	// Trim whitespace from both sides
	d.Name = strings.TrimSpace(d.Name)

	// Make a default game name if they did not provide one
	if len(d.Name) == 0 {
		d.Name = m.Dispatcher.Core.GetRandomTableName()
	}

	// Check for non-ASCII characters
	if !util.ContainsAllPrintableASCII(d.Name) {
		msg := "Game names can only contain ASCII characters."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that the game name does not contain any special characters
	// (this mitigates XSS attacks)
	if !m.isValidTableName(d.Name) {
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
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that they sent the options object
	if d.Options == nil {
		d.Options = options.NewOptions()
	}

	// Validate that the variant name is valid
	// (and store the variant ID on the options object)
	if variant, err := m.Dispatcher.Variants.GetVariant(d.Options.VariantName); err != nil {
		msg := fmt.Sprintf("\"%v\" is not a valid variant.", d.Options.VariantName)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	} else {
		d.Options.VariantID = variant.ID
	}

	// Validate that the time controls are sane
	if d.Options.Timed {
		if d.Options.TimeBase <= 0 {
			msg := fmt.Sprintf(
				"\"%v\" is too small of a value for \"Base Time\".",
				d.Options.TimeBase,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
		if d.Options.TimeBase > oneWeekInSeconds {
			msg := fmt.Sprintf(
				"\"%v\" is too large of a value for \"Base Time\".",
				d.Options.TimeBase,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
		if d.Options.TimePerTurn <= 0 {
			msg := fmt.Sprintf(
				"\"%v\" is too small of a value for \"Time per Turn\".",
				d.Options.TimePerTurn,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
		if d.Options.TimePerTurn > oneDayInSeconds {
			msg := fmt.Sprintf(
				"\"%v\" is too large of a value for \"Time per Turn\".",
				d.Options.TimePerTurn,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	// Validate that there can be no time controls if this is not a timed game
	if !d.Options.Timed {
		d.Options.TimeBase = 0
		d.Options.TimePerTurn = 0
	}

	// Validate that a speedrun cannot be timed
	if d.Options.Speedrun {
		d.Options.Timed = false
		d.Options.TimeBase = 0
		d.Options.TimePerTurn = 0
	}

	// Validate that they did not send both the "One Extra Card" and the "One Less Card" option at
	// the same time (they effectively cancel each other out)
	if d.Options.OneExtraCard && d.Options.OneLessCard {
		d.Options.OneExtraCard = false
		d.Options.OneLessCard = false
	}

	// Validate games with custom JSON
	if d.GameJSON != nil {
		if valid, msg := d.GameJSON.Validate(m.Dispatcher.Variants); !valid {
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	// Validate that the player is not joined to another table
	// (this cannot be in the "commandTableCreate()" function because we need the tables lock)
	if !strings.HasPrefix(d.username, "Bot-") {
		playingAtTables := m.getUserPlaying(d.userID)
		if len(playingAtTables) > 0 {
			msg := "You cannot join more than one table at a time. Terminate your other game before creating a new one."
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	return true
}

func poop() {
	newTableData := newMakeNewTableData()

	// Handle special table creation
	if strings.HasPrefix(d.Name, "!") {
		if !m.newValidateSpecialTable(d) {
			return nil, false
		}
	}
}

func (m *Manager) newValidateSpecialTable(d *NewData) bool {
	if d.GameJSON != nil {
		msg := "You cannot create a table with a special prefix if JSON data is also provided."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	args := strings.Split(d.Name, " ")
	command := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	command = strings.TrimPrefix(command, "!")
	command = strings.ToLower(command) // Commands are case-insensitive

	if command == "seed" {
		// !seed - Play a specific seed
		if len(args) != 1 {
			msg := "Games on specific seeds must be created like: !seed [seed number]"
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

		// For normal games, the server creates seed suffixes sequentially from 0, 1, 2, and so on
		// However, the seed does not actually have to be a number,
		// so allow the user to use any arbitrary string as a seed suffix
		specialData.setSeedSuffix = args[0]
	} else if command == "replay" {
		// !replay - Replay a specific game up to a specific turn
		if len(args) != 1 && len(args) != 2 {
			msg := "Replays of specific games must be created in the form: !replay [game ID] [turn number]"
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

		if v, err := strconv.Atoi(args[0]); err != nil {
			msg := fmt.Sprintf("The game ID of \"%v\" is not an integer.", args[0])
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		} else {
			specialData.databaseID = v
		}

		// Check to see if the game ID exists on the server
		if exists, err := m.models.Games.Exists(
			context.Background(),
			specialData.databaseID,
		); err != nil {
			m.logger.Errorf(
				"Failed to check to see if game %v exists: %v",
				specialData.databaseID,
				err,
			)
			m.Dispatcher.Sessions.NotifyError(d.userID, constants.CreateGameFail)
			return false
		} else if !exists {
			msg := fmt.Sprintf(
				"The game ID of %v does not exist in the database.",
				specialData.databaseID,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

		if len(args) == 1 {
			specialData.setReplayTurn = 1
		} else {
			if v, err := strconv.Atoi(args[1]); err != nil {
				msg := fmt.Sprintf("The turn of \"%v\" is not an integer.", args[1])
				m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
				return false
			} else {
				specialData.setReplayTurn = v
			}

			if specialData.setReplayTurn < 1 {
				msg := "The replay turn must be greater than 0."
				m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
				return false
			}
		}

		// We have to minus the turn by one since turns are stored on the server starting at 0
		// and turns are shown to the user starting at 1
		specialData.setReplayTurn--

		// Check to see if this turn is valid
		// (it has to be a turn before the game ends)
		var numTurns int
		if v, err := m.models.Games.GetNumTurns(
			context.Background(),
			specialData.databaseID,
		); err != nil {
			m.logger.Errorf(
				"Failed to get the number of turns from the database for game %v: %v",
				specialData.databaseID,
				err,
			)
			m.Dispatcher.Sessions.NotifyError(d.userID, constants.CreateGameFail)
			return false
		} else {
			numTurns = v
		}
		if specialData.setReplayTurn >= numTurns {
			msg := fmt.Sprintf("Game #%v only has %v turns.", specialData.databaseID, numTurns)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

		specialData.setReplay = true
	} else {
		msg := "You cannot start a game with an exclamation mark unless you are trying to use a specific game creation command."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	return true
}

func newMakeNewTableData(d *NewData) *table.NewTableData {
	passwordHash := ""
	if d.Password != "" {
		// Create an Argon2id hash of the plain-text password
		if v, err := argon2id.CreateHash(d.Password, argon2id.DefaultParams); err != nil {
			m.logger.Errorf("Failed to create a hash from the submitted table password: %v", err)
			m.Dispatcher.Sessions.NotifyError(d.userID, constants.CreateGameFail)
			return
		} else {
			passwordHash = v
		}
	}

	newTableData := &table.NewTableData{
		Name:         d.Name,
		OwnerID:      d.userID,
		HidePregame:  d.hidePregame,
		PasswordHash: passwordHash,
		Options:      d.Options,
		ExtraOptions: &options.ExtraOptions{}, // This will be filled in below
	}

	// Normally, the database ID of an ongoing game should be -1
	newTableData.ExtraOptions.DatabaseID = -1

	/*
		// If this is a "!replay" game, override the options with the ones found in the database
		if d.SetReplay {
			if _, success := loadDatabaseOptionsToTable(s, data.DatabaseID, t); !success {
				return
			}

			// "loadJSONOptionsToTable()" sets the database ID to a positive number
			// The database ID for an ongoing game should be set to -1
			t.ExtraOptions.DatabaseID = -1

			// "loadDatabaseOptionsToTable()" marks that the game should not be written to the database,
			// which is not true in this special case
			t.ExtraOptions.NoWriteToDatabase = false

			// "loadDatabaseOptionsToTable()" does not specify the "!replay" options
			t.ExtraOptions.SetReplay = d.SetReplay
			t.ExtraOptions.SetReplayTurn = d.SetReplayTurn
		}

		// If the user specified JSON data,
		// override the options with the ones specified in the JSON data
		if d.GameJSON != nil {
			loadJSONOptionsToTable(d, t)

			// "loadJSONOptionsToTable()" sets the database ID to 0, which corresponds to a JSON replay
			// The database ID for an ongoing game should be set to -1
			t.ExtraOptions.DatabaseID = -1

			// "loadJSONOptionsToTable()" marks that the game should not be written to the database,
			// which is not true in this special case
			t.ExtraOptions.NoWriteToDatabase = false

			// "loadJSONOptionsToTable()" marks that the game is a JSON replay,
			// which is not true in this special case
			t.ExtraOptions.JSONReplay = false
		}
	*/

}

/*
	// Add the table to a map so that we can keep track of all of the active tables
	tables.Set(t.ID, t)

	hLog.Infof(
		"%v %v created a table.",
		t.GetName(),
		util.PrintUserCapitalized(s.UserID, s.Username),
	)
	// (a "table" message will be sent in the "commandTableJoin" function below)

	// Log a chat message so that future players can see a timestamp of when the table was created
	msg := fmt.Sprintf("%v created the table.", s.Username)
	chatServerSend(ctx, msg, t.GetRoomName(), true)

	// If the server is shutting down / restarting soon, warn the players
	if shuttingDown.IsSet() {
		timeLeft := ShutdownTimeout - time.Since(datetimeShutdownInit)
		minutesLeft := int(timeLeft.Minutes())

		msg := fmt.Sprintf(
			"The server is shutting down in %v minutes. Keep in mind that if your game is not finished in time, it will be terminated.",
			minutesLeft,
		)
		chatServerSend(ctx, msg, t.GetRoomName(), true)
	}

	// Join the user to the new table
	commandTableJoin(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID:      t.ID,
		Password:     d.Password,
		NoTableLock:  true,
		NoTablesLock: true,
	})
}
*/
