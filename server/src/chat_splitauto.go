package main

import (
	"context"
	"sort"
	"strings"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// /splitauto - Automatically split players into two lobbies based on game count
func chatSplitAuto(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
}

func commandTableSplitAuto(ctx context.Context, s *Session, d *CommandData, tableID uint64) {
	// Acquire the tables lock first so that we can safely get the table and determine players to move
	tables.Lock(ctx)

	t, exists := getTableAndLock(ctx, s, tableID, true, false)
	if !exists {
		tables.Unlock(ctx)
		return
	}

	if t.Running {
		t.Unlock(ctx)
		tables.Unlock(ctx)
		chatServerSend(ctx, NotStartedFail, d.Room, true)
		return
	}

	if s.UserID != t.OwnerID {
		t.Unlock(ctx)
		tables.Unlock(ctx)
		chatServerSend(ctx, NotOwnerFail, d.Room, true)
		return
	}

	if len(t.Players) < 2 {
		t.Unlock(ctx)
		tables.Unlock(ctx)
		chatServerSend(ctx, "There must be at least 2 players to split.", d.Room, true)
		return
	}

	// Pre-compute game counts to avoid repeated nil checks during sort
	gameCounts := make([]int, len(t.Players))
	playerMap := make(map[*Player]int, len(t.Players))
	for i, p := range t.Players {
		if p.Stats != nil {
			gameCounts[i] = p.Stats.NumGames
		}
		playerMap[p] = i
	}

	// Sort players by NumGames descending (highest games first)
	sortedPlayers := make([]*Player, len(t.Players))
	copy(sortedPlayers, t.Players)
	sort.Slice(sortedPlayers, func(i, j int) bool {
		return gameCounts[playerMap[sortedPlayers[i]]] > gameCounts[playerMap[sortedPlayers[j]]]
	})

	// Determine which group to move (the one without the owner)
	movedGroup := getGroupToMove(sortedPlayers, t.OwnerID)

	if len(movedGroup) == 0 || len(movedGroup) > t.MaxPlayers {
		chatServerSend(ctx,
			"Cannot split: resulting group is empty or exceeds player limit.",
			d.Room,
			true,
		)
		return
	}

	// Extract player names and delegate to /split
	movedGroupNames := getPlayerNames(movedGroup)
	logger.Info(t.GetName() + "User \"" + s.Username + "\" initiated automatic split by game count. " +
		"Moving: " + strings.Join(movedGroupNames, ", "))

	// Release locks before delegating to /split so that commandTableSplit can
	// acquire locks in its own correct order (tables -> table) without deadlock.
	t.Unlock(ctx)
	tables.Unlock(ctx)

	// Use the existing /split command logic by setting d.Args and calling commandTableSplit
	d.Args = movedGroupNames
	commandTableSplit(ctx, s, d, tableID)
}

// getGroupToMove returns the group of players that should be moved (not containing the owner).
// Players are already sorted by game count (highest first).
// Owner stays in current lobby with their group; the other group moves.
// If odd number of players, owner's group gets the extra player.
func getGroupToMove(sortedPlayers []*Player, ownerID int) []*Player {
	if len(sortedPlayers) == 0 {
		return []*Player{}
	}
	splitPoint := len(sortedPlayers) / 2
	topHalf := sortedPlayers[:splitPoint]
	bottomHalf := sortedPlayers[splitPoint:]

	// Split at midpoint; bottomHalf will contain the lower game counts because
	// `sortedPlayers` is descending by NumGames. Move the half that does NOT
	// contain the owner.
	for _, p := range topHalf {
		if p.UserID == ownerID {
			return bottomHalf
		}
	}
	return topHalf
}

// getPlayerNames returns a slice of player names from a slice of players
func getPlayerNames(players []*Player) []string {
	names := make([]string, 0, len(players))
	for _, p := range players {
		names = append(names, p.Name)
	}
	return names
}
