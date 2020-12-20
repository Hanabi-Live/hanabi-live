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
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/alexedwards/argon2id"
)

type NewData struct {
	Name     string           `json:"name"`
	Options  *options.Options `json:"options"`
	Password string           `json:"password"`
	GameJSON *table.GameJSON  `json:"gameJSON"`

	userID      int
	username    string
	hidePregame bool
}

const (
	maxTableNameLength = 45
	oneDayInSeconds    = 86400
	oneHourInSeconds   = 3600
)

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

	if !m.newValidatePlayingOtherGame(d.userID, d.username) {
		return
	}

	var name string
	if v, valid := m.newValidateName(d.userID, d.Name); !valid {
		return
	} else {
		name = v
	}

	// Prepare the options for the table that will not be written to the database
	opts := d.Options
	extraOpts := &options.ExtraOptions{}
	extraOpts.DatabaseID = -1 // Normally, the database ID for an ongoing game should be -1

	if v1, v2, valid := m.newValidateSpecialTable(d.userID, name, d.GameJSON); !valid {
		return
	} else if v1 != nil && v2 != nil {
		opts = v1
		extraOpts = v2
	} else if v2 != nil {
		extraOpts = v2
	}

	if v1, v2, valid := m.newValidateJSONTable(d.userID, d.GameJSON); !valid {
		return
	} else if v1 != nil && v2 != nil {
		opts = v1
		extraOpts = v2
	}

	var variant *variants.Variant
	if v1, v2, valid := m.newValidateOptions(d.userID, opts); !valid {
		return
	} else {
		opts = v1
		variant = v2
	}

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

	t := table.NewManager(m.logger, &table.NewTableData{
		ID:           m.newTableID(),
		Name:         name,
		OwnerID:      d.userID,
		Visible:      !d.hidePregame,
		PasswordHash: passwordHash,
		Options:      opts,
		ExtraOptions: extraOpts,
		Variant:      variant,
	})

	fmt.Println(t)
}

func (m *Manager) newValidatePlayingOtherGame(userID int, username string) bool {
	// Validate that this player is not joined to another table
	if !strings.HasPrefix(username, "Bot-") {
		playingAtTables := m.getUserPlaying(userID)
		if len(playingAtTables) > 0 {
			msg := "You cannot join more than one table at a time. Terminate your other game before creating a new one."
			m.Dispatcher.Sessions.NotifyWarning(userID, msg)
			return false
		}
	}

	return true
}

func (m *Manager) newValidateName(userID int, name string) (string, bool) {
	// Validate that the server is not in maintenance mode or shutting down soon
	if allowed, msg := m.Dispatcher.Core.IsNewTablesAllowed(); !allowed {
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return "", false
	}

	// Truncate long table names
	// (we do this first to prevent wasting CPU cycles on validating extremely long table names)
	if len(name) > maxTableNameLength {
		name = name[0 : maxTableNameLength-1]
	}

	// Remove any non-printable characters, if any
	name = util.RemoveNonPrintableCharacters(name)

	// Trim whitespace from both sides
	name = strings.TrimSpace(name)

	// Make a default game name if they did not provide one
	if len(name) == 0 {
		name = m.Dispatcher.Core.GetRandomTableName()
	}

	// Check for non-ASCII characters
	if !util.ContainsAllPrintableASCII(name) {
		msg := "Game names can only contain ASCII characters."
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return "", false
	}

	// Validate that the game name does not contain any special characters
	// (this mitigates XSS attacks)
	if !m.isValidTableName(name) {
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
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return "", false
	}

	return name, true
}

func (m *Manager) newValidateSpecialTable(
	userID int,
	name string,
	gameJSON *table.GameJSON,
) (*options.Options, *options.ExtraOptions, bool) {
	if !strings.HasPrefix(name, "!") {
		return nil, nil, true
	}

	if gameJSON != nil {
		msg := "You cannot create a table with a special prefix if JSON data is also provided."
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	}

	args := strings.Split(name, " ")
	command := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	command = strings.TrimPrefix(command, "!")
	command = strings.ToLower(command) // Commands are case-insensitive

	switch command {
	case "seed":
		return m.newValidateSpecialTableSeed(userID, args)

	case "replay":
		return m.newValidateSpecialTableReplay(userID, args)
	}

	msg := "You cannot start a game with an exclamation mark unless you are trying to use a specific game creation command."
	m.Dispatcher.Sessions.NotifyWarning(userID, msg)
	return nil, nil, false
}

// !seed - Play a specific seed.
func (m *Manager) newValidateSpecialTableSeed(
	userID int,
	args []string,
) (*options.Options, *options.ExtraOptions, bool) {
	if len(args) != 1 {
		msg := "Games on specific seeds must be created like: !seed [seed number]"
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	}

	extraOpts := &options.ExtraOptions{}
	extraOpts.DatabaseID = -1 // Normally, the database ID of an ongoing game should be -1

	// For normal games, the server creates seed suffixes sequentially from 0, 1, 2, and so on
	// However, the seed does not actually have to be a number,
	// so allow the user to use any arbitrary string as a seed suffix
	extraOpts.SetSeedSuffix = args[0]

	return nil, extraOpts, true
}

// !replay - Replay a specific game up to a specific turn.
func (m *Manager) newValidateSpecialTableReplay(
	userID int,
	args []string,
) (*options.Options, *options.ExtraOptions, bool) {
	if len(args) != 1 && len(args) != 2 {
		msg := "Replays of specific games must be created in the form: !replay [game ID] [turn number]"
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	}

	var databaseID int
	if v, err := strconv.Atoi(args[0]); err != nil {
		msg := fmt.Sprintf("The game ID of \"%v\" is not an integer.", args[0])
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	} else {
		databaseID = v
	}

	// Check to see if the game ID exists on the server
	if exists, err := m.models.Games.Exists(context.Background(), databaseID); err != nil {
		m.logger.Errorf("Failed to check to see if game %v exists: %v", databaseID, err)
		m.Dispatcher.Sessions.NotifyError(userID, constants.CreateGameFail)
		return nil, nil, false
	} else if !exists {
		msg := fmt.Sprintf("The game ID of %v does not exist in the database.", databaseID)
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	}

	var setReplayTurn int
	if len(args) == 1 {
		setReplayTurn = 1
	} else {
		if v, err := strconv.Atoi(args[1]); err != nil {
			msg := fmt.Sprintf("The turn of \"%v\" is not an integer.", args[1])
			m.Dispatcher.Sessions.NotifyWarning(userID, msg)
			return nil, nil, false
		} else {
			setReplayTurn = v
		}

		if setReplayTurn < 1 {
			msg := "The replay turn must be greater than 0."
			m.Dispatcher.Sessions.NotifyWarning(userID, msg)
			return nil, nil, false
		}
	}

	// We have to minus the turn by one since turns are stored on the server starting at 0
	// and turns are shown to the user starting at 1
	setReplayTurn--

	// Check to see if this turn is valid
	// (it has to be a turn before the game ends)
	var numTurns int
	if v, err := m.models.Games.GetNumTurns(context.Background(), databaseID); err != nil {
		m.logger.Errorf(
			"Failed to get the number of turns from the database for game %v: %v",
			databaseID,
			err,
		)
		m.Dispatcher.Sessions.NotifyError(userID, constants.CreateGameFail)
		return nil, nil, false
	} else {
		numTurns = v
	}
	if setReplayTurn >= numTurns {
		msg := fmt.Sprintf("Game #%v only has %v turns.", databaseID, numTurns)
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	}

	// Get the options for this game from the database
	var opts *options.Options
	var extraOpts *options.ExtraOptions
	if v1, v2, _, ok := m.newReplayGetDatabaseOptions(userID, databaseID); !ok {
		return nil, nil, false
	} else {
		opts = v1
		extraOpts = v2
	}

	// Since the new set of "extraOpts" is intended for a replay of a database game (instead of a
	// real game using database data), we need to override some things
	extraOpts.DatabaseID = -1 // Normally, the database ID for an ongoing game should be -1
	extraOpts.NoWriteToDatabase = false
	extraOpts.SetReplay = true
	extraOpts.SetReplayTurn = setReplayTurn

	return opts, extraOpts, true
}

func (m *Manager) newValidateJSONTable(
	userID int,
	gameJSON *table.GameJSON,
) (*options.Options, *options.ExtraOptions, bool) {
	if gameJSON == nil {
		return nil, nil, true
	}

	// Validate games with custom JSON
	if valid, msg := gameJSON.Validate(m.Dispatcher.Variants); !valid {
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	}

	// The user submitted a new table request with JSON data
	// Create options objects based on the JSON data
	var opts *options.Options
	var extraOpts *options.ExtraOptions
	if v1, v2, ok := m.newReplayGetJSONOptions(userID, gameJSON); !ok {
		return nil, nil, false
	} else {
		opts = v1
		extraOpts = v2
	}

	// Since the new set of "extraOpts" is intended for a replay of a JSON game (instead of a real
	// game using JSON data), we need to override some things
	extraOpts.DatabaseID = -1 // Normally, the database ID for an ongoing game should be -1
	extraOpts.NoWriteToDatabase = false
	extraOpts.JSONReplay = false

	return opts, extraOpts, true
}

func (m *Manager) newValidateOptions(
	userID int,
	opts *options.Options,
) (*options.Options, *variants.Variant, bool) {
	// Validate that they sent the options object
	if opts == nil {
		opts = options.NewOptions()
	}

	// Validate that the variant name is valid
	// (and store the variant ID on the options object)
	var variant *variants.Variant
	if v, err := m.Dispatcher.Variants.GetVariant(opts.VariantName); err != nil {
		msg := fmt.Sprintf("\"%v\" is not a valid variant.", opts.VariantName)
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	} else {
		variant = v
	}
	opts.VariantID = variant.ID

	// Validate that the time controls are sane
	if opts.Timed {
		if opts.TimeBase <= 0 {
			msg := fmt.Sprintf(
				"\"%v\" is too small of a value for \"Base Time\".",
				opts.TimeBase,
			)
			m.Dispatcher.Sessions.NotifyWarning(userID, msg)
			return nil, nil, false
		}
		if opts.TimeBase > oneDayInSeconds {
			msg := fmt.Sprintf(
				"\"%v\" is too large of a value for \"Base Time\".",
				opts.TimeBase,
			)
			m.Dispatcher.Sessions.NotifyWarning(userID, msg)
			return nil, nil, false
		}
		if opts.TimePerTurn <= 0 {
			msg := fmt.Sprintf(
				"\"%v\" is too small of a value for \"Time per Turn\".",
				opts.TimePerTurn,
			)
			m.Dispatcher.Sessions.NotifyWarning(userID, msg)
			return nil, nil, false
		}
		if opts.TimePerTurn > oneHourInSeconds {
			msg := fmt.Sprintf(
				"\"%v\" is too large of a value for \"Time per Turn\".",
				opts.TimePerTurn,
			)
			m.Dispatcher.Sessions.NotifyWarning(userID, msg)
			return nil, nil, false
		}
	}

	// Validate that there can be no time controls if this is not a timed game
	if !opts.Timed {
		opts.TimeBase = 0
		opts.TimePerTurn = 0
	}

	// Validate that a speedrun cannot be timed
	if opts.Speedrun {
		opts.Timed = false
		opts.TimeBase = 0
		opts.TimePerTurn = 0
	}

	// Validate that they did not send both the "One Extra Card" and the "One Less Card" option at
	// the same time (which would effectively cancel each other out)
	if opts.OneExtraCard && opts.OneLessCard {
		opts.OneExtraCard = false
		opts.OneLessCard = false
	}

	return opts, variant, true
}

func (m *Manager) newTableID() int {
	// Ensure that the table ID does not conflict with any existing tables
	// (we may have restored some tables during a graceful server restart,
	// which means that some tables may have IDs that are not in order with the counter)
	for {
		m.tableIDCounter++

		_, ok := m.tables[m.tableIDCounter]
		if !ok {
			return m.tableIDCounter
		}
	}
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
