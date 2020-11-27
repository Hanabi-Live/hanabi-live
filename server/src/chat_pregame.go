package main

import (
	"math"
	"math/rand"
	"strconv"
	"strings"
	"time"
)

/*
	Pregame chat commands
*/

// /s - Automatically start the game as soon as someone joins
func chatS(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, len(t.Players)+1)
}

// /s2 - Automatically start the game as soon as there are 2 players
func chatS2(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 2)
}

// /s3 - Automatically start the game as soon as there are 3 players
func chatS3(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 3)
}

// /s4 - Automatically start the game as soon as there are 4 players
func chatS4(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 4)
}

// /s5 - Automatically start the game as soon as there are 5 players
func chatS5(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 5)
}

// /s6 - Automatically start the game as soon as there are 6 players
func chatS6(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 6)
}

// /startin [minutes]
func chatStartIn(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(NotInGameFail, d.Room)
		return
	}

	if t.Running {
		chatServerSend(NotStartedFail, d.Room)
		return
	}

	if s.UserID != t.Owner {
		chatServerSend(NotOwnerFail, d.Room)
		return
	}

	// If the user did not specify the amount of minutes, assume 1
	if len(d.Args) != 1 {
		chatServerSend(
			"You must specify the amount of minutes to wait. (e.g. \"/startin 1\")",
			d.Room,
		)
	}

	var minutesToWait float64
	if v, err := strconv.ParseFloat(d.Args[0], 64); err != nil {
		chatServerSend("\""+d.Args[0]+"\" is not a valid number.", d.Room)
		return
	} else {
		minutesToWait = v
	}

	if minutesToWait <= 0 {
		chatServerSend("The minutes to wait must be greater than 0.", d.Room)
		return
	}

	if minutesToWait > 10 {
		chatServerSend("The minutes to wait cannot be greater than 10.", d.Room)
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
	chatServerSend(announcement, d.Room)
	go startIn(t, timeToWait, timeToStart)
}

func chatKick(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(NotInGameFail, d.Room)
		return
	}

	if t.Running {
		chatServerSend(NotStartedFail, d.Room)
		return
	}

	if s.UserID != t.Owner {
		chatServerSend(NotOwnerFail, d.Room)
		return
	}

	if len(d.Args) != 1 {
		chatServerSend("The format of the /kick command is: /kick [username]", d.Room)
		return
	}

	// Check to make sure that they are not targeting themself
	normalizedUsername := normalizeString(d.Args[0])
	if normalizedUsername == normalizeString(s.Username) {
		chatServerSend("You cannot kick yourself.", d.Room)
		return
	}

	// Check to see if this person is in the game
	for _, p := range t.Players {
		if normalizedUsername == normalizeString(p.Name) {
			// Record this player's user ID so that they cannot rejoin the table afterward
			t.KickedPlayers[p.ID] = struct{}{}

			// Remove them from the table
			s2 := p.Session
			if s2 == nil {
				// A player's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s2 = NewFakeSession(p.ID, p.Name)
				logger.Info("Created a new fake session in the \"chatKick()\" function.")
			}
			commandTableLeave(s2, &CommandData{ // Manual invocation
				TableID: t.ID,
				NoLock:  true,
			})

			chatServerSend("Successfully kicked \""+d.Args[0]+"\" from the game.", d.Room)
			return
		}
	}

	chatServerSend("\""+d.Args[0]+"\" is not joined to this game.", d.Room)
}

/*
	Pregame or game chat commands
*/

// /missingscores
func chatMissingScores(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(NotInGameFail, d.Room)
		return
	}

	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	usernames := make([]string, 0)
	if t.Replay {
		for _, sp := range t.Spectators {
			usernames = append(usernames, sp.Name)
		}
	} else {
		for _, p := range t.Players {
			usernames = append(usernames, p.Name)
		}
	}

	if len(usernames) < 2 || len(usernames) > 6 {
		msg := "You can only perform this command if the game or shared replay has between 2 and 6 players."
		chatServerSend(msg, d.Room)
		return
	}

	path := "/shared-missing-scores/" + strings.Join(usernames, "/")
	msg := getURLFromPath(path)
	chatServerSend(msg, d.Room)
}

// /findvariant
// This function does not consider modifiers (e.g. "Empty Clues")
func chatFindVariant(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(NotInGameFail, d.Room)
		return
	}

	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	userIDs := make([]int, 0)
	if t.Replay {
		for _, sp := range t.Spectators {
			userIDs = append(userIDs, sp.ID)
		}
	} else {
		for _, p := range t.Players {
			userIDs = append(userIDs, p.ID)
		}
	}

	if len(userIDs) < 2 || len(userIDs) > 6 {
		msg := "You can only perform this command if the game or shared replay has between 2 and 6 players."
		chatServerSend(msg, d.Room)
		return
	}

	// Get all of the variant-specific stats for these players
	statsMaps := make([]map[int]*UserStatsRow, 0)
	for _, userID := range userIDs {
		if statsMap, err := models.UserStats.GetAll(userID); err != nil {
			logger.Error("Failed to get all of the variant-specific stats for player ID "+
				strconv.Itoa(userID)+":", err)
			chatServerSend(DefaultErrorMsg, d.Room)
			return
		} else {
			statsMaps = append(statsMaps, statsMap)
		}
	}

	// Make a list of variants that no-one has the max score in
	variantsWithNoMaxScores := make([]string, 0)
	for _, variant := range variants {
		maxScore := len(variant.Suits) * PointsPerSuit
		someoneHasMaxScore := false
		for _, statsMap := range statsMaps {
			if stats, ok := statsMap[variant.ID]; ok {
				// This player has played at least one game in this particular variant
				// Check to see if they have a max score
				// We minus 2 because element 0 is for 2-player, element 1 is for 3-player, etc.
				if stats.BestScores[len(userIDs)-2].Score == maxScore {
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
	chatServerSend(msg, d.Room)
}

/*
	Subroutines
*/

func automaticStart(s *Session, d *CommandData, t *Table, numPlayers int) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(NotInGameFail, d.Room)
		return
	}

	if t.Running {
		chatServerSend(StartedFail, d.Room)
		return
	}

	if s.UserID != t.Owner {
		chatServerSend(NotOwnerFail, d.Room)
		return
	}

	if len(d.Args) > 0 {
		// They specific an argument, so make this take priority
		if v, err := strconv.Atoi(d.Args[0]); err != nil {
			chatServerSend("\""+d.Args[0]+"\" is not a number.", d.Room)
			return
		} else {
			numPlayers = v
		}

		if numPlayers < 2 || numPlayers > 6 {
			chatServerSend("You can only start a table with 2 to 6 players.", d.Room)
			return
		}
	}

	if len(t.Players) == numPlayers {
		commandTableStart(s, &CommandData{ // Manual invocation
			TableID: t.ID,
			NoLock:  true,
		})
	} else {
		t.AutomaticStart = numPlayers
		msg := "The game will start as soon as " + strconv.Itoa(numPlayers) + " players have joined."
		chatServerSend(msg, d.Room)
	}
}

// startIn is meant to be run in a goroutine
func startIn(t *Table, timeToWait time.Duration, datetimePlannedStart time.Time) {
	// Sleep until it is time to automatically start
	time.Sleep(timeToWait)

	// Check to see if the table still exists
	t2, exists := getTableAndLock(nil, t.ID, false)
	if !exists || t != t2 {
		return
	}
	t.Mutex.Lock()
	defer t.Mutex.Unlock()

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
		if p.ID == t.Owner {
			if !p.Present {
				msg := "Aborting automatic game start since the table creator is away."
				chatServerSend(msg, t.GetRoomName())
				return
			}

			logger.Info(t.GetName() + " Automatically starting (from the /startin command).")
			commandTableStart(p.Session, &CommandData{ // Manual invocation
				TableID: t.ID,
				NoLock:  true,
			})
			return
		}
	}

	logger.Error("Failed to find the owner of the game when attempting to automatically start it.")
}

func chatImpostor(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(NotInGameFail, d.Room)
		return
	}

	if t.Running {
		chatServerSend(NotStartedFail, d.Room)
		return
	}

	if s.UserID != t.Owner {
		chatServerSend(NotOwnerFail, d.Room)
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
			Datetime:  time.Now(),
			Recipient: p.Session.Username,
		}
		p.Session.Emit("chat", chatMessage)
	}
}
