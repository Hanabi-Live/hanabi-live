package main

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"
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
		// Non game host sends new options
		// They are sent to the table chat as a proposal

		// Perform name fixes
		d.Name = fixTableName(d.Name)

		// Perform options fixes
		d.Options = fixGameOptions(d.Options)

		var message string

		// Check for valid options
		isValid, message := areGameOptionsValid(d.Options)
		if !isValid {
			s.Warning(message)
			return
		}

		newOptions := d.Options
		tableOptions := t.Options

		room := t.GetRoomName()
		message = s.Username + " proposes the following options:"
		span := "<span class=\"cp\">"
		endspan := "</b></span>"

		// output in chat only what's changed
		options := ""

		if d.Name != t.Name {
			options += span + "Table Name: <b>" + d.Name + endspan
		}
		if newOptions.VariantName != tableOptions.VariantName {
			options += span + "Variant: <b>" + newOptions.VariantName + endspan
		}
		if newOptions.Timed && !tableOptions.Timed {
			options += span + "Timed: <b>" + strconv.Itoa(newOptions.TimeBase) + " / " + strconv.Itoa(newOptions.TimePerTurn) + endspan
		} else if tableOptions.Timed {
			options += span + "Timed: <b>No" + endspan
		}
		// Sanitize
		d.MaxPlayers = between(d.MaxPlayers, 2, 6, 5)
		if d.MaxPlayers != t.MaxPlayers {
			// Warn if new maximum is less than the present players
			colorStart := ""
			colorEnd := ""
			if d.MaxPlayers < len(t.Players) {
				colorStart = "<span style=\"color: red\">"
				colorEnd = "</span>"
			}
			options += span + "Max Players: <b>" + colorStart + strconv.Itoa(d.MaxPlayers) + colorEnd + endspan
		}
		if newOptions.Speedrun != tableOptions.Speedrun {
			options += span + "Speedrun: <b>" + yesNoFromBoolean(newOptions.Speedrun) + endspan
		}
		if newOptions.CardCycle != tableOptions.CardCycle {
			options += span + "Card Cycling: <b>" + yesNoFromBoolean(newOptions.CardCycle) + endspan
		}
		if newOptions.DeckPlays != tableOptions.DeckPlays {
			options += span + "Bottom-Deck: <b>" + yesNoFromBoolean(newOptions.DeckPlays) + endspan
		}
		if newOptions.EmptyClues != tableOptions.EmptyClues {
			options += span + "Empty Clues: <b>" + yesNoFromBoolean(newOptions.EmptyClues) + endspan
		}
		if newOptions.OneExtraCard != tableOptions.OneExtraCard {
			options += span + "One Extra Card: <b>" + yesNoFromBoolean(newOptions.OneExtraCard) + endspan
		}
		if newOptions.OneLessCard != tableOptions.OneLessCard {
			options += span + "One Less Card: <b>" + yesNoFromBoolean(newOptions.OneLessCard) + endspan
		}
		if newOptions.AllOrNothing != tableOptions.AllOrNothing {
			options += span + "All or Nothing: <b>" + yesNoFromBoolean(newOptions.AllOrNothing) + endspan
		}
		if newOptions.DetrimentalCharacters != tableOptions.DetrimentalCharacters {
			options += span + "Detrimental Characters: <b>" + yesNoFromBoolean(newOptions.DetrimentalCharacters) + endspan
		}

		if options == "" {
			// nothing is changed
			s.Warning("There are no new options proposed.")
			return
		}

		message += options
		chatServerSend(ctx, message, room, d.NoTablesLock)

		// New options
		newOptions.TableName = d.Name
		newOptions.MaxPlayers = d.MaxPlayers
		jsonOptions, err := json.Marshal(newOptions)
		if err != nil {
			return
		}

		// Send a hyperlink to the table owner to apply the changes
		out := strings.ReplaceAll(string(jsonOptions), "\"", "'")
		message = span + "<button class=\"new-options\" data-new-options=\"" +
			out +
			"\">click to apply the suggestion</button></span>"
		for _, p := range t.Players {
			if p.UserID == t.OwnerID {
				p.Session.Emit("chat", &ChatMessage{
					Msg:       message,
					Who:       WebsiteName,
					Discord:   false,
					Server:    true,
					Datetime:  time.Now(),
					Room:      room,
					Recipient: p.Name,
				})
				break
			}
		}
		return
	}

	// Perform name fixes
	d.Name = fixTableName(d.Name)

	// Check for valid name
	isValid, msg := isTableNameValid(d.Name, true)
	if !isValid {
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

	// Perform options fixes
	d.Options = fixGameOptions(d.Options)

	// Check for valid options
	isValid, msg = areGameOptionsValid(d.Options)
	if !isValid {
		s.Warning(msg)
		return
	}

	// Sanitize max players
	d.MaxPlayers = between(d.MaxPlayers, 2, 6, 5)
	// Kick extra players
	if d.MaxPlayers < len(t.Players) {
		extraPlayers := t.Players[d.MaxPlayers:]
		for _, p := range extraPlayers {
			// Get the session
			s2 := p.Session
			if s2 == nil {
				// A player's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s2 = NewFakeSession(p.UserID, p.Name)
				logger.Info("Created a new fake session in the \"chatKick()\" function.")
			}

			// Remove them from the table
			commandTableLeave(ctx, s2, &CommandData{ // nolint: exhaustivestruct
				TableID:     t.ID,
				NoTableLock: true,
			})

			// Inform the player
			msg := "You have been removed from the table due to new max players restriction."
			chatServerSendPM(s2, msg, "lobby")
		}
	}

	tableUpdate(ctx, s, d, data, t)
}

func tableUpdate(ctx context.Context, s *Session, d *CommandData, data *SpecialGameData, t *Table) {
	// Local variables
	variant := variants[d.Options.VariantName]

	// First, change the table options
	t.Name = d.Name
	t.Visible = !d.HidePregame
	t.MaxPlayers = d.MaxPlayers
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
