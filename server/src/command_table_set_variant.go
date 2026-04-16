package main

import (
	"context"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// commandTableSetVariant is sent when a user types the "/setvariant [variant]" command
//
// Example data:
// {
//   tableID: 123,
//   options: {
//     variant: 'Black & Rainbow (6 Suit)',
//   },
// }
func commandTableSetVariant(ctx context.Context, s *Session, d *CommandData) {
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

	// Validate that they sent the options object
	if d.Options == nil {
		d.Options = NewOptions()
	}

	if len(d.Options.VariantName) == 0 {
		s.Warning("You must specify the variant. (e.g. \"/setvariant Black & Rainbow (6 Suits)\")")
		return
	}

	if _, ok := variants[d.Options.VariantName]; !ok {
		s.Warning("The variant of \"" + d.Options.VariantName + "\" does not exist.")
		return
	}

	tableSetVariant(ctx, s, d, t)
}

func tableSetVariant(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	variant := variants[d.Options.VariantName]

	// First, change the variant (do this before releasing the lock so that any concurrent
	// commandTableJoin will fetch stats for the new variant automatically).
	t.Options.VariantName = d.Options.VariantName

	// Snapshot each player's userID and numGames before releasing t.Lock.
	// models.UserStats.Get issues a DB query; holding t.Lock during that call can exhaust
	// the pgxpool and deadlock the server.
	type playerSnapshot struct {
		userID   int
		numGames int
	}
	snapshot := make([]playerSnapshot, len(t.Players))
	for i, p := range t.Players {
		snapshot[i] = playerSnapshot{userID: p.UserID, numGames: p.Stats.NumGames}
	}

	if !d.NoTableLock {
		t.Unlock(ctx)
	}
	variantStatsMap := make(map[int]*UserStatsRow, len(snapshot))
	for _, entry := range snapshot {
		v, err := models.UserStats.Get(entry.userID, variant.ID)
		if err != nil {
			logger.Error("Failed to get the stats for player \"" + s.Username + "\" for variant " +
				strconv.Itoa(variant.ID) + ": " + err.Error())
			if !d.NoTableLock {
				t.Lock(ctx)
			}
			s.Error(DefaultErrorMsg)
			return
		}
		variantStatsMap[entry.userID] = v
	}
	if !d.NoTableLock {
		t.Lock(ctx)
	}

	// Build a numGames lookup from the snapshot taken before the unlock.
	numGamesMap := make(map[int]int, len(snapshot))
	for _, entry := range snapshot {
		numGamesMap[entry.userID] = entry.numGames
	}
	// Apply stats to original players.  Any player who joined while we were unlocked
	// already got correct variant stats via commandTableJoin, so we leave them as-is.
	for _, p := range t.Players {
		if variantStats, ok := variantStatsMap[p.UserID]; ok {
			p.Stats = &PregameStats{
				NumGames: numGamesMap[p.UserID],
				Variant:  variantStats,
			}
		}
	}

	// Even though no-one has joined or left the game, this function will update the display of the
	// variant on the client and refresh all of the variant-specific stats
	t.NotifyPlayerChange()

	// Update the variant in the table list for everyone in the lobby
	notifyAllTable(t)

	msg := s.Username + " has changed the variant to: " + d.Options.VariantName
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}
