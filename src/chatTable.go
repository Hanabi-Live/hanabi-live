package main

import (
	"strconv"
	"time"
)

/*
	Game chat commands
*/

// /s
func chatS(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, len(t.Players)+1)
}

// /s2
func chatS2(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 2)
}

// /s3
func chatS3(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 3)
}

// /s4
func chatS4(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 4)
}

// /s5
func chatS5(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 5)
}

// /s6
func chatS6(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 6)
}

// /startin
func chatStartIn(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if t.Running {
		chatServerSend("The game is already started, so you cannot use that command.", d.Room)
		return
	}

	if s.UserID() != t.Owner {
		chatServerSend("Only the table owner can use that command.", d.Room)
		return
	}

	// If the user did not specify the amount of minutes, assume 1
	if len(d.Args) != 1 {
		d.Args = []string{"1"}
	}

	var minutesToWait int
	if v, err := strconv.Atoi(d.Args[0]); err != nil {
		chatServerSend("You must specify the amount of minutes to wait. (e.g. \"/startin 1\")",
			d.Room)
		return
	} else {
		minutesToWait = v
	}

	timeToWait := time.Duration(minutesToWait) * time.Minute
	timeToStart := time.Now().Add(timeToWait)
	t.DatetimePlannedStart = timeToStart
	announcement := "The game will automatically start in " + strconv.Itoa(minutesToWait) +
		" minute"
	if minutesToWait != 1 {
		announcement += "s"
	}
	announcement += "."
	chatServerSend(announcement, d.Room)
	go startIn(t, timeToWait, timeToStart)
}

// /pause
func chatPause(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if !t.Running {
		chatServerSend("The game is not yet started, so you cannot use that command.", d.Room)
		return
	}

	commandPause(s, &CommandData{
		Value: "pause",
	})
}

// /unpause
func chatUnpause(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if !t.Running {
		chatServerSend("The game is not yet started, so you cannot use that command.", d.Room)
		return
	}

	commandPause(s, &CommandData{
		Value: "unpause",
	})
}

// /findvariant
func chatFindVariant(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
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
		chatServerSend("You can only perform this command if the game or shared replay has "+
			"between 2 and 6 players.", d.Room)
		return
	}

	// Get all of the variant-specific stats for these players
	statsMaps := make([]map[int]UserStatsRow, 0)
	for _, userID := range userIDs {
		if v, err := models.UserStats.GetAll(userID); err != nil {
			logger.Error("Failed to get all of the variant-specific stats for player ID "+
				strconv.Itoa(userID)+":", err)
			chatServerSend("Something went wrong. Please contact an administrator.", d.Room)
			return
		} else {
			statsMaps = append(statsMaps, v)
		}
	}

	// Make a list of variants that no-one has the max score in
	variantsWithNoMaxScores := make([]string, 0)
	for _, variant := range variants {
		maxScore := 5 * len(variant.Suits)
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
	if t == nil {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if t.Running {
		chatServerSend("The game is already started, so you cannot use that command.", d.Room)
		return
	}

	if s.UserID() != t.Owner {
		chatServerSend("Only the table owner can use that command.", d.Room)
		return
	}

	if len(t.Players) == numPlayers {
		commandTableStart(s, nil)
	} else {
		t.AutomaticStart = numPlayers
		chatServerSend("The game will start as soon as "+strconv.Itoa(numPlayers)+
			" players have joined.", d.Room)
	}
}

func startIn(t *Table, timeToWait time.Duration, datetimePlannedStart time.Time) {
	// Sleep until it is time to automatically start
	time.Sleep(timeToWait)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the table still exists
	if _, ok := tables[t.ID]; !ok {
		return
	}

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
				room := "table" + strconv.Itoa(t.ID)
				chatServerSend("Aborting automatic game start since the table creator is away.",
					room)
				return
			}

			logger.Info(t.GetName() + " Automatically starting (from the /startin command).")
			commandTableStart(p.Session, nil)
			return
		}
	}

	logger.Error("Failed to find the owner of the game when attempting to automatically start it.")
}
