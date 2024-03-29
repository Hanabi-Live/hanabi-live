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

	// First, change the variant
	t.Options.VariantName = d.Options.VariantName

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

	msg := s.Username + " has changed the variant to: " + d.Options.VariantName
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}
