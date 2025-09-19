package main

import (
	"context"
	"encoding/json"
	"math"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

/*
	Pregame chat commands
*/

// /s - Automatically start the game as soon as someone joins
func chatS(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if chatNotInTable(d, t) {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	var numPlayers int
	if cmd == "s" {
		numPlayers = len(t.Players) + 1
	} else {
		// Commands s2 to s6
		if v, err := strconv.Atoi(cmd[1:]); err != nil {
			sendInvalidCommand(s, cmd, d.Room)
			return
		} else {
			numPlayers = v
		}
	}

	automaticStart(ctx, s, d, t, numPlayers)
}

// /startin [minutes]
func chatStartIn(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if chatNotInTable(d, t) {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	if t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room, d.NoTablesLock)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, d.NoTablesLock)
		return
	}

	// If the user did not specify the amount of minutes, assume 1
	if len(d.Args) != 1 {
		msg := "You must specify the amount of minutes to wait. (e.g. \"/startin 1\")"
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}

	var minutesToWait float64
	if v, err := strconv.ParseFloat(d.Args[0], 64); err != nil {
		msg := "\"" + d.Args[0] + "\" is not a valid number."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	} else {
		minutesToWait = v
	}

	if minutesToWait <= 0 {
		msg := "The minutes to wait must be greater than 0."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	if minutesToWait > 10 {
		msg := "The minutes to wait cannot be greater than 10."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	secondsToWait := int(math.Ceil(minutesToWait * 60))
	timeToWait := time.Duration(secondsToWait) * time.Second
	timeToStart := time.Now().Add(timeToWait)
	t.DatetimePlannedStart = timeToStart
	announcement := "The game will automatically start in "
	if secondsToWait < 60 {
		announcement += strconv.Itoa(secondsToWait) + " seconds"
	} else if secondsToWait == 60 {
		announcement += "1 minute"
	} else {
		announcement += d.Args[0] + " minutes"
	}
	announcement += "."
	chatServerSend(ctx, announcement, d.Room, d.NoTablesLock)
	go startIn(ctx, t, timeToWait, timeToStart)
}

func chatKick(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if chatNotInTable(d, t) {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	if t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room, d.NoTablesLock)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, d.NoTablesLock)
		return
	}

	if len(d.Args) != 1 {
		msg := "The format of the /kick command is: /kick [username]"
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Check to make sure that they are not targeting themself
	normalizedUsername := normalizeString(d.Args[0])
	if normalizedUsername == normalizeString(s.Username) {
		msg := "You cannot kick yourself."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Check to see if this person is in the game
	for _, p := range t.Players {
		if normalizedUsername == normalizeString(p.Name) {
			// Record this player's user ID so that they cannot rejoin the table afterward
			t.KickedPlayers[p.UserID] = struct{}{}

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

			msg := "Successfully kicked \"" + d.Args[0] + "\" from the game."
			chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
			return
		}
	}

	msg := "\"" + d.Args[0] + "\" is not joined to this game."
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

/*
	Pregame or game chat commands
*/

// /missingscores
func chatMissingScores(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if chatNotInTable(d, t) {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	usernames := make([]string, 0)
	if t.Replay {
		for _, sp := range t.ActiveSpectators() {
			usernames = append(usernames, sp.Name)
		}
	} else {
		for _, p := range t.Players {
			usernames = append(usernames, p.Name)
		}
	}

	if len(usernames) < 2 || len(usernames) > 6 {
		msg := "You can only perform this command if the game or shared replay has between 2 and 6 players."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	path := "/shared-missing-scores/" + strconv.Itoa(len(usernames)) + "/" + strings.Join(usernames, "/")
	msg := getURLFromPath(path)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /findvariant
// This function does not consider modifiers (e.g. "Empty Clues")
func chatFindVariant(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if chatNotInTable(d, t) {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	userIDs := make([]int, 0)
	if t.Replay {
		for _, sp := range t.ActiveSpectators() {
			userIDs = append(userIDs, sp.UserID)
		}
	} else {
		for _, p := range t.Players {
			userIDs = append(userIDs, p.UserID)
		}
	}

	if len(userIDs) < 2 || len(userIDs) > 6 {
		msg := "You can only perform this command if the game or shared replay has between 2 and 6 players."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Get all of the variant-specific stats for these players
	statsMaps := make([]map[int]*UserStatsRow, 0)
	for _, userID := range userIDs {
		if statsMap, err := models.UserStats.GetAll(userID); err != nil {
			logger.Error("Failed to get all of the variant-specific stats for player ID " +
				strconv.Itoa(userID) + ": " + err.Error())
			chatServerSend(ctx, DefaultErrorMsg, d.Room, d.NoTablesLock)
			return
		} else {
			statsMaps = append(statsMaps, statsMap)
		}
	}

	// Make a list of variants that no-one has the max score in
	variantsWithNoMaxScores := make([]string, 0)
	for _, variant := range variants {
		someoneHasMaxScore := false
		for _, statsMap := range statsMaps {
			if stats, ok := statsMap[variant.ID]; ok {
				// This player has played at least one game in this particular variant
				// Check to see if they have a max score
				// We minus 2 because element 0 is for 2-player, element 1 is for 3-player, etc.
				if stats.BestScores[len(userIDs)-2].Score == variant.MaxScore {
					someoneHasMaxScore = true
					break
				}
			}
		}
		if !someoneHasMaxScore {
			variantsWithNoMaxScores = append(variantsWithNoMaxScores, variant.Name)
		}
	}

	// Get a random element from the list
	randomIndex := getRandom(0, len(variantsWithNoMaxScores)-1)
	randomVariant := variantsWithNoMaxScores[randomIndex]

	msg := "Here is a random variant that everyone needs the " +
		strconv.Itoa(len(userIDs)) + "-player max score in: " + randomVariant
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)

	// If we are in pregame
	if !t.Running && !t.Replay {
		// Copy the options
		newOptions := *t.Options
		// These values in t.Options are omitted, so fill them in
		newOptions.TableName = t.Name
		newOptions.MaxPlayers = t.MaxPlayers

		newOptions.VariantName = randomVariant
		jsonOptions, err := json.Marshal(newOptions)
		if err != nil {
			return
		}

		// Send a hyperlink to the table owner to apply the changes
		out := strings.ReplaceAll(string(jsonOptions), "\"", "'")
		message := "<span class=\"cp\"><button class=\"new-options\" data-new-options=\"" +
			out +
			"\">click to apply the suggestion</button></span>"
		for _, p := range t.Players {
			if p.UserID == t.OwnerID {
				chatServerSendPM(p.Session, message, t.GetRoomName())
				break
			}
		}
	}
}

/*
	Subroutines
*/

func automaticStart(ctx context.Context, s *Session, d *CommandData, t *Table, numPlayers int) {
	if chatNotInTable(d, t) {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	if t.Running {
		chatServerSend(ctx, StartedFail, d.Room, d.NoTablesLock)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, d.NoTablesLock)
		return
	}

	if len(d.Args) > 0 {
		// They specific an argument, so make this take priority
		if v, err := strconv.Atoi(d.Args[0]); err != nil {
			msg := "\"" + d.Args[0] + "\" is not a number."
			chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
			return
		} else {
			numPlayers = v
		}

		if numPlayers < 2 || numPlayers > 6 {
			msg := "You can only start a table with 2 to 6 players."
			chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
			return
		}
	}

	if len(t.Players) == numPlayers {
		commandTableStart(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:     t.ID,
			NoTableLock: true,
		})
	} else {
		t.AutomaticStart = numPlayers
		msg := "The game will start as soon as " + strconv.Itoa(numPlayers) + " players have joined."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}
}

// startIn is meant to be run in a goroutine
func startIn(
	ctx context.Context,
	t *Table,
	timeToWait time.Duration,
	datetimePlannedStart time.Time,
) {
	// Sleep until it is time to automatically start
	time.Sleep(timeToWait)

	// Check to see if the table still exists
	t2, exists := getTableAndLock(ctx, nil, t.ID, false, false)
	if !exists || t != t2 {
		return
	}
	t.Lock(ctx)
	defer t.Unlock(ctx)

	// Check to see if the game has already started
	if t.Running {
		return
	}

	// Check to see if the planned start time has changed
	if datetimePlannedStart != t.DatetimePlannedStart {
		return
	}

	// Check to see if the owner is present
	for _, p := range t.Players {
		if p.UserID == t.OwnerID {
			if !p.Present {
				msg := "Aborting automatic game start since the table creator is away."
				chatServerSend(ctx, msg, t.GetRoomName(), false)
				return
			}

			logger.Info(t.GetName() + " Automatically starting (from the /startin command).")
			commandTableStart(ctx, p.Session, &CommandData{ // nolint: exhaustivestruct
				TableID:     t.ID,
				NoTableLock: true,
			})
			return
		}
	}

	logger.Error("Failed to find the owner of the game when attempting to automatically start it.")
}

func chatImpostor(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if chatNotInTable(d, t) {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	if t.Running {
		chatServerSend(ctx, StartedFail, d.Room, d.NoTablesLock)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, d.NoTablesLock)
		return
	}

	if len(t.Players) == 2 {
		chatServerSend(ctx, NotInTwoPlayers, d.Room, d.NoTablesLock)
		return
	}

	randomIndex := rand.Intn(len(t.Players)) // nolint: gosec

	for i, p := range t.Players {
		var msg string
		if i == randomIndex {
			msg = "You are an IMPOSTOR."
		} else {
			msg = "You are a CREWMATE."
		}

		chatMessage := &ChatMessage{
			Msg:       msg,
			Who:       WebsiteName,
			Discord:   false,
			Server:    true,
			Datetime:  time.Now(),
			Room:      d.Room,
			Recipient: p.Session.Username,
		}
		p.Session.Emit("chat", chatMessage)
	}
}

func chatNotInTable(d *CommandData, t *Table) bool {
	return t == nil || d == nil || d.Room == "lobby"
}
