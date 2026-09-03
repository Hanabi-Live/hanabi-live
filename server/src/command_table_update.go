package main

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// commandTableUpdate is sent when the user submits
// the "Create a New Game" form from within pre-game
//
// Example data:
//
//	{
//	  name: 'my new table',
//	  options: {
//	    variant: 'No Variant',
//	    [other options omitted; see "Options.ts"]
//	  },
//	}
func commandTableUpdate(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	tableLocked := !d.NoTableLock
	if !d.NoTableLock {
		defer func() {
			if tableLocked {
				t.Unlock(ctx)
			}
		}()
	}

	if t.Running {
		s.Warning(StartedFail)
		return
	}

	if s.UserID != t.OwnerID {
		// Non game host sends new options
		// They are sent to the table chat as a proposal

		// Perform name fixes
		d.Name = truncateTrimCheckEmpty(d.Name)

		if valid, message := isTableNameValid(d.Name); !valid {
			s.Warning(message)
			return
		}

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
		endSpan := "</b></span>"

		// output in chat only what's changed
		options := ""

		if d.Name != t.Name {
			options += span + "Table Name: <b>" + d.Name + endSpan
		}
		if newOptions.VariantName != tableOptions.VariantName {
			options += span + "Variant: <b>" + newOptions.VariantName + endSpan
		}
		if newOptions.Timed && !tableOptions.Timed {
			options += span + "Timed: <b>" + strconv.Itoa(newOptions.TimeBase) + " / " + strconv.Itoa(newOptions.TimePerTurn) + endSpan
		} else if tableOptions.Timed {
			options += span + "Timed: <b>No" + endSpan
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
			options += span + "Max Players: <b>" + colorStart + strconv.Itoa(d.MaxPlayers) + colorEnd + endSpan
		}
		if newOptions.Speedrun != tableOptions.Speedrun {
			options += span + "Speedrun: <b>" + yesNoFromBoolean(newOptions.Speedrun) + endSpan
		}
		if newOptions.CardCycle != tableOptions.CardCycle {
			options += span + "Card Cycling: <b>" + yesNoFromBoolean(newOptions.CardCycle) + endSpan
		}
		if newOptions.DeckPlays != tableOptions.DeckPlays {
			options += span + "Bottom-Deck: <b>" + yesNoFromBoolean(newOptions.DeckPlays) + endSpan
		}
		if newOptions.EmptyClues != tableOptions.EmptyClues {
			options += span + "Empty Clues: <b>" + yesNoFromBoolean(newOptions.EmptyClues) + endSpan
		}
		if newOptions.OneExtraCard != tableOptions.OneExtraCard {
			options += span + "One Extra Card: <b>" + yesNoFromBoolean(newOptions.OneExtraCard) + endSpan
		}
		if newOptions.OneLessCard != tableOptions.OneLessCard {
			options += span + "One Less Card: <b>" + yesNoFromBoolean(newOptions.OneLessCard) + endSpan
		}
		if newOptions.AllOrNothing != tableOptions.AllOrNothing {
			options += span + "All or Nothing: <b>" + yesNoFromBoolean(newOptions.AllOrNothing) + endSpan
		}
		if newOptions.DetrimentalCharacters != tableOptions.DetrimentalCharacters {
			options += span + "Detrimental Characters: <b>" + yesNoFromBoolean(newOptions.DetrimentalCharacters) + endSpan
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

	d.Name = truncateTrimCheckEmpty(d.Name)

	// Set default values for data relating to tables created with a special prefix or custom data
	data := &SpecialGameData{
		DatabaseID:       -1, // Normally, the database ID of an ongoing game should be -1
		CustomNumPlayers: 0,
		CustomActions:    nil,

		SetSeedSuffix: "",
		SetReplay:     false,
		SetReplayTurn: 0,
	}

	if valid, message := isTableNameValid(d.Name); !valid {
		s.Warning(message)
		return
	}

	if d.NoTableLock || d.NoTablesLock {
		logger.Error("commandTableUpdate was called while the caller held table locks.")
		s.Error(DefaultErrorMsg)
		return
	}

	t.Unlock(ctx)
	tableLocked = false
	if valid, message := isTableCommandValid(s, d, data); !valid {
		s.Warning(message)
		return
	}

	reloadedTable, tableExists := getTableAndLock(ctx, s, d.TableID, true, !d.NoTablesLock)
	if !tableExists {
		return
	}
	t = reloadedTable
	tableLocked = true

	if t.Running {
		s.Warning(StartedFail)
		return
	}
	if s.UserID != t.OwnerID {
		s.Warning("Only the table owner can change game options.")
		return
	}

	d.Options = fixGameOptions(d.Options)

	if valid, message := areGameOptionsValid(d.Options); !valid {
		s.Warning(message)
		return
	}

	d.MaxPlayers = between(d.MaxPlayers, 2, 6, 5)
	for {
		kickPlayersOverLimit(ctx, d, t)

		players := make([]*Player, len(t.Players))
		copy(players, t.Players)
		numGamesByUserID := make(map[int]int, len(players))
		for _, p := range players {
			numGamesByUserID[p.UserID] = p.Stats.NumGames
		}
		variant := variants[d.Options.VariantName]

		t.Unlock(ctx)
		tableLocked = false
		variantStatsByUserID := make(map[int]*UserStatsRow, len(players))
		for _, p := range players {
			v, err := models.UserStats.Get(p.UserID, variant.ID)
			if err != nil {
				logger.Error("Failed to get the stats for player \"" + s.Username +
					"\" for variant " + strconv.Itoa(variant.ID) + ": " + err.Error())
				s.Error(DefaultErrorMsg)
				return
			}
			variantStatsByUserID[p.UserID] = v
		}

		reloadedTable, exists := getTableAndLock(ctx, s, d.TableID, true, !d.NoTablesLock)
		if !exists {
			return
		}
		t = reloadedTable
		tableLocked = true
		if t.Running {
			s.Warning(StartedFail)
			return
		}
		if s.UserID != t.OwnerID {
			s.Warning("Only the table owner can change game options.")
			return
		}
		if sameTablePlayers(players, t.Players) {
			tableUpdate(ctx, s, d, data, t, variantStatsByUserID, numGamesByUserID)
			return
		}
	}
}

func kickPlayersOverLimit(ctx context.Context, d *CommandData, t *Table) {
	if d.MaxPlayers >= len(t.Players) {
		return
	}

	extraPlayers := t.Players[d.MaxPlayers:]
	for _, p := range extraPlayers {
		s := p.Session
		if s == nil {
			s = NewFakeSession(p.UserID, p.Name)
			logger.Info("Created a new fake session in the \"kickPlayersOverLimit()\" function.")
		}

		commandTableLeave(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:     t.ID,
			NoTableLock: true,
		})
		chatServerSendPM(
			s,
			"You have been removed from the table due to new max players restriction.",
			"lobby",
		)
	}
}

func tableUpdate(
	ctx context.Context,
	s *Session,
	d *CommandData,
	data *SpecialGameData,
	t *Table,
	variantStatsByUserID map[int]*UserStatsRow,
	numGamesByUserID map[int]int,
) {

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

	for _, p := range t.Players {
		if variantStats, ok := variantStatsByUserID[p.UserID]; ok {
			p.Stats = &PregameStats{
				NumGames: numGamesByUserID[p.UserID],
				Variant:  variantStats,
			}
		}
	}

	// Even though no-one has joined or left the game, this function will update the display of the
	// variant on the client and refresh all of the variant-specific stats
	t.NotifyPlayerChange()

	// Update the variant in the table list for everyone in the lobby
	notifyAllTable(t)

	msg := s.Username + " has changed game options."
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}
