package main

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

const splitLobbySuffix = " (split)"

// /split [username] [username] ...
func chatSplit(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
}

func commandTableSplit(ctx context.Context, s *Session, d *CommandData, tableID uint64) {
	// Acquire the tables lock first so that we can safely create a new table while holding
	// the source table lock.
	tables.Lock(ctx)
	defer tables.Unlock(ctx)

	t, exists := getTableAndLock(ctx, s, tableID, true, false)
	if !exists {
		return
	}
	defer t.Unlock(ctx)

	if t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room, true)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, true)
		return
	}

	if len(d.Args) == 0 {
		msg := "The format of the /split command is: /split [username] [username] ..."
		chatServerSend(ctx, msg, d.Room, true)
		return
	}

	selectedPlayers := make([]*Player, 0, len(d.Args))
	selectedNames := make([]string, 0, len(d.Args))
	seenNames := make(map[string]struct{})
	for _, arg := range d.Args {
		normalized := normalizeString(arg)
		if _, ok := seenNames[normalized]; ok {
			chatServerSend(ctx, "You cannot list the same player more than once in /split.", d.Room, true)
			return
		}
		seenNames[normalized] = struct{}{}

		var matchedPlayer *Player
		for _, p := range t.Players {
			if normalizeString(p.Name) == normalized {
				matchedPlayer = p
				break
			}
		}
		if matchedPlayer == nil {
			chatServerSend(ctx, "\""+arg+"\" is not joined to this table.", d.Room, true)
			return
		}

		selectedPlayers = append(selectedPlayers, matchedPlayer)
		selectedNames = append(selectedNames, matchedPlayer.Name)
	}

	if len(selectedPlayers) > t.MaxPlayers {
		chatServerSend(ctx,
			"You cannot split more than "+strconv.Itoa(t.MaxPlayers)+" players into one lobby.",
			d.Room,
			true,
		)
		return
	}

	selectedIDs := make(map[int]struct{}, len(selectedPlayers))
	for _, p := range selectedPlayers {
		selectedIDs[p.UserID] = struct{}{}
	}

	remainingPlayers := make([]*Player, 0, len(t.Players)-len(selectedPlayers))
	for _, p := range t.Players {
		if _, ok := selectedIDs[p.UserID]; !ok {
			remainingPlayers = append(remainingPlayers, p)
		}
	}

	newTableName := makeSplitTableName(t.Name)
	newTable := NewTable(newTableName, selectedPlayers[0].UserID)
	newOptions := *t.Options
	newTable.Options = &newOptions
	newTable.Visible = t.Visible
	newTable.PasswordHash = t.PasswordHash
	newTable.MaxPlayers = t.MaxPlayers
	newTable.Players = make([]*Player, 0, len(selectedPlayers))
	newTable.OwnerID = selectedPlayers[0].UserID
	tables.Set(newTable.ID, newTable)

	if !t.DatetimePlannedStart.IsZero() {
		t.DatetimePlannedStart = time.Time{}
		chatServerSend(ctx, "Automatic game start has been canceled.", t.GetRoomName(), true)
	}

	for _, p := range selectedPlayers {
		movePlayerToSplitLobby(p, t, newTable)
	}

	if len(remainingPlayers) > 0 {
		t.Players = remainingPlayers
		if _, ok := selectedIDs[t.OwnerID]; ok {
			t.OwnerID = remainingPlayers[0].UserID
		}
		t.NotifyPlayerChange()
		notifyAllTable(t)
	} else {
		deleteTable(t)
	}

	newTable.DatetimeLastJoined = time.Now()
	newTable.NotifyPlayerChange()
	notifyAllTable(newTable)

	for _, p := range selectedPlayers {
		if p.Session != nil {
			p.Session.NotifyTableJoined(newTable)
		}
	}

	msg := s.Username + " split " + strings.Join(selectedNames, ", ") + " into a new lobby."
	chatServerSend(ctx, msg, t.GetRoomName(), true)
	chatServerSend(ctx, "This lobby was created by splitting " + t.Name + ".", newTable.GetRoomName(), true)

	logger.Info(t.GetName() + "User \"" + s.Username + "\" split players into a new lobby named \"" +
		newTableName + "\".")
}

func movePlayerToSplitLobby(p *Player, source *Table, destination *Table) {
	if p.Session == nil {
		p.Session = NewFakeSession(p.UserID, p.Name)
	}

	if p.Typing {
		source.NotifyChatTyping(p.Name, false)
		p.Typing = false
	}

	tables.DeletePlaying(p.UserID, source.ID)
	tables.AddPlaying(p.UserID, destination.ID)
	p.Present = true
	p.Session.SetStatus(StatusPregame)
	p.Session.SetTableID(destination.ID)
	notifyAllUser(p.Session)
	destination.Players = append(destination.Players, p)
}

func makeSplitTableName(sourceName string) string {
	name := strings.TrimSpace(sourceName)
	if len(name)+len(splitLobbySuffix) > MaxGameNameLength {
		name = name[0 : MaxGameNameLength-len(splitLobbySuffix)]
	}
	return strings.TrimSpace(name + splitLobbySuffix)
}
