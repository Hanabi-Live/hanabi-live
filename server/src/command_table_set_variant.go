package main

import (
	"strconv"
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
func commandTableSetVariant(s *Session, d *CommandData) {
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}

	if t.Running {
		s.Warning(StartedFail)
		return
	}

	if s.UserID != t.Owner {
		s.Warning(NotOwnerFail)
		return
	}

	// Validate that they sent the options object
	if d.Options == nil {
		d.Options = &Options{}
	}

	if len(d.Options.VariantName) == 0 {
		s.Warning("You must specify the variant. (e.g. \"/setvariant Black & Rainbow (6 Suits)\")")
		return
	}

	if _, ok := variants[d.Options.VariantName]; !ok {
		s.Warning("The variant of \"" + d.Options.VariantName + "\" does not exist.")
		return
	}

	tableSetVariant(s, d, t)
}

func tableSetVariant(s *Session, d *CommandData, t *Table) {
	// Local variables
	variant := variants[d.Options.VariantName]

	// First, change the variant
	t.Options.VariantName = d.Options.VariantName

	// Update the variant-specific stats for each player at the table
	for _, p := range t.Players {
		var variantStats *UserStatsRow
		if v, err := models.UserStats.Get(p.ID, variant.ID); err != nil {
			logger.Error("Failed to get the stats for player \""+s.Username+"\" for variant "+
				strconv.Itoa(variant.ID)+":", err)
			s.Error(DefaultErrorMsg)
			return
		} else {
			variantStats = v
		}

		p.Stats = PregameStats{
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
	chatServerSend(msg, t.GetRoomName())
}
