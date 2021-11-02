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

		// Perform options fixes
		d.Options = fixGameOptions(d.Options)

		// Check for valid options
		isValid, msg := areGameOptionsValid(d.Options)
		if !isValid {
			s.Warning(msg)
			return
		}

		nOpt := d.Options
		tOpt := t.Options

		room := t.GetRoomName()
		msg = s.Username + " proposes the following options:"
		span := "<span class=\"cp\">"
		endspan := "</b></span>"

		// output in chat only what's changed
		options := ""

		if nOpt.VariantName != tOpt.VariantName {
			options += span + "Variant: <b>" + nOpt.VariantName + endspan
		}
		if nOpt.Timed && !tOpt.Timed {
			options += span + "Timed: <b>" + strconv.Itoa(nOpt.TimeBase) + " / " + strconv.Itoa(nOpt.TimePerTurn) + endspan
		} else if tOpt.Timed {
			options += span + "Timed: <b>No" + endspan
		}

		if nOpt.Speedrun != tOpt.Speedrun {
			options += span + "Speedrun: <b>" + yesNoFromBoolean(nOpt.Speedrun) + endspan
		}
		if nOpt.CardCycle != tOpt.CardCycle {
			options += span + "Card Cycling: <b>" + yesNoFromBoolean(nOpt.CardCycle) + endspan
		}
		if nOpt.DeckPlays != tOpt.DeckPlays {
			options += span + "Bottom-Deck: <b>" + yesNoFromBoolean(nOpt.DeckPlays) + endspan
		}
		if nOpt.EmptyClues != tOpt.EmptyClues {
			options += span + "Empty Clues: <b>" + yesNoFromBoolean(nOpt.EmptyClues) + endspan
		}
		if nOpt.OneExtraCard != tOpt.OneExtraCard {
			options += span + "One Extra Card: <b>" + yesNoFromBoolean(nOpt.OneExtraCard) + endspan
		}
		if nOpt.OneLessCard != tOpt.OneLessCard {
			options += span + "One Less Card: <b>" + yesNoFromBoolean(nOpt.OneLessCard) + endspan
		}
		if nOpt.AllOrNothing != tOpt.AllOrNothing {
			options += span + "All or Nothing: <b>" + yesNoFromBoolean(nOpt.AllOrNothing) + endspan
		}
		if nOpt.DetrimentalCharacters != tOpt.DetrimentalCharacters {
			options += span + "Detrimental Characters: <b>" + yesNoFromBoolean(nOpt.DetrimentalCharacters) + endspan
		}

		if options == "" {
			// nothing is changed
			s.Warning("There are no new options proposed.")
			return
		}

		msg += options
		chatServerSend(ctx, msg, room, d.NoTablesLock)

		// New options
		jsonOptions, err := json.Marshal(nOpt)
		if err != nil {
			return
		}

		// Send a hyperlink to the table owner to apply the changes
		out := strings.ReplaceAll(string(jsonOptions), "\"", "'")
		msg = span + "<button class=\"new-options\" data-new-options=\"" +
			out +
			"\">click to apply the suggestion</button></span>"
		for _, p := range t.Players {
			if p.UserID == t.OwnerID {
				p.Session.Emit("chat", &ChatMessage{
					Msg:       msg,
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
