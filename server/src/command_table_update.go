package main

import (
	"context"
	"strconv"
	"strings"
)

// commandTableUpdate is sent when the user submits
// the "Create a New Game" form from within pre-game
//
// Example data:
// {
//   name: 'my new table',
//   options: {
//     variant: 'No Variant',
//     [other options omitted; see "Options.ts"]
//   },
// }
func commandTableUpdate(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	if t.Running {
		s.Warning(StartedFail)
		return
	}

	if s.UserID != t.OwnerID {
		s.Warning(NotOwnerFail)
		return
	}

	// Truncate long table names
	// (we do this first to prevent wasting CPU cycles on validating extremely long table names)
	if len(d.Name) > MaxGameNameLength {
		d.Name = d.Name[0 : MaxGameNameLength-1]
	}

	// Remove any non-printable characters, if any
	d.Name = removeNonPrintableCharacters(d.Name)

	// Trim whitespace from both sides
	d.Name = strings.TrimSpace(d.Name)

	// Make a default game name if they did not provide one
	if len(d.Name) == 0 {
		d.Name = getName()
	}

	// Check for non-ASCII characters
	if !containsAllPrintableASCII(d.Name) {
		s.Warning("Game names can only contain ASCII characters.")
		return
	}

	// Validate that the game name does not contain any special characters
	// (this mitigates XSS attacks)
	if !isValidTableName(d.Name) {
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
		s.Warning(msg)
		return
	}

	// Set default values for data relating to tables created with a special prefix or custom data
	data := &SpecialGameData{
		DatabaseID:       -1, // Normally, the database ID of an ongoing game should be -1
		CustomNumPlayers: 0,
		CustomActions:    nil,

		SetSeedSuffix: "",
		SetReplay:     false,
		SetReplayTurn: 0,
	}

	// Handle special game option creation
	if strings.HasPrefix(d.Name, "!") {
		msg := "You cannot start a game with an exclamation mark unless you are trying to use a specific game creation command."
		s.Warning(msg)
		return
	}

	// Validate that they sent the options object
	if d.Options == nil {
		d.Options = NewOptions()
	}

	// Validate that the variant name is valid
	if _, ok := variants[d.Options.VariantName]; !ok {
		s.Warning("\"" + d.Options.VariantName + "\" is not a valid variant.")
		return
	}

	// Validate that the time controls are sane
	if d.Options.Timed {
		if d.Options.TimeBase <= 0 {
			s.Warning("\"" + strconv.Itoa(d.Options.TimeBase) + "\" is too small of a value for \"Base Time\".")
			return
		}
		if d.Options.TimeBase > 604800 { // 1 week in seconds
			s.Warning("\"" + strconv.Itoa(d.Options.TimeBase) + "\" is too large of a value for \"Base Time\".")
			return
		}
		if d.Options.TimePerTurn <= 0 {
			s.Warning("\"" + strconv.Itoa(d.Options.TimePerTurn) + "\" is too small of a value for \"Time per Turn\".")
			return
		}
		if d.Options.TimePerTurn > 86400 { // 1 day in seconds
			s.Warning("\"" + strconv.Itoa(d.Options.TimePerTurn) + "\" is too large of a value for \"Time per Turn\".")
			return
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

	tableUpdate(ctx, s, d, data, t)
}

func tableUpdate(ctx context.Context, s *Session, d *CommandData, data *SpecialGameData, t *Table) {
	// Local variables
	variant := variants[d.Options.VariantName]

	// First, change the table options
	t.Name = d.Name
	t.Visible = !d.HidePregame
	t.Options = d.Options
	t.ExtraOptions = &ExtraOptions{
		DatabaseID:                 data.DatabaseID,
		NoWriteToDatabase:          false,
		JSONReplay:                 false,
		CustomNumPlayers:           data.CustomNumPlayers,
		CustomCharacterAssignments: nil,
		CustomSeed:                 "",
		CustomDeck:                 nil,
		CustomActions:              nil,
		Restarted:                  false,
		SetSeedSuffix:              data.SetSeedSuffix,
		SetReplay:                  false,
		SetReplayTurn:              0,
	}

	// Update the variant-specific stats for each player at the table
	for _, p := range t.Players {
		var variantStats *UserStatsRow
		if v, err := models.UserStats.Get(p.UserID, variant.ID); err != nil {
			logger.Error("Failed to get the stats for player \"" + s.Username + "\" for variant " +
				strconv.Itoa(variant.ID) + ": " + err.Error())
			s.Error(DefaultErrorMsg)
			return
		} else {
			variantStats = v
		}

		p.Stats = &PregameStats{
			NumGames: p.Stats.NumGames,
			Variant:  variantStats,
		}
	}

	// Even though no-one has joined or left the game, this function will update the display of the
	// variant on the client and refresh all of the variant-specific stats
	t.NotifyPlayerChange()

	// Update the variant in the table list for everyone in the lobby
	notifyAllTable(t)

	msg := s.Username + " has changed game options."
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)

	// Add the table to a map so that we can keep track of all of the active tables
	tables.Set(t.ID, t)
}
