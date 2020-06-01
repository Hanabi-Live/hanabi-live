package main

import (
	"strconv"
)

// commandTableSetVariant is sent when a user types the "/setvariant [variant]" command
//
// Example data:
// {
//   tableID: 123,
//   variant: 'Black & Rainbow (6 Suit)',
// }
func commandTableSetVariant(s *Session, d *CommandData) {
	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	if t.Running {
		s.Warning(ChatCommandStartedFail)
		return
	}

	if s.UserID() != t.Owner {
		s.Warning(ChatCommandNotOwnerFail)
		return
	}

	// Validate that they send the options object
	if d.Options == nil {
		d.Options = &Options{}
	}

	if len(d.Options.Variant) == 0 {
		s.Warning("You must specify the variant. (e.g. \"/setvariant Black & Rainbow (6 Suits)\")")
		return
	}

	if _, ok := variants[d.Options.Variant]; !ok {
		s.Warning("The variant of \"" + d.Options.Variant + "\" does not exist.")
		return
	}

	// First, change the variant
	t.Options.Variant = d.Options.Variant

	// Update the variant-specific stats for each player at the table
	for _, p := range t.Players {
		var variantStats UserStatsRow
		if v, err := models.UserStats.Get(s.UserID(), variants[t.Options.Variant].ID); err != nil {
			logger.Error("Failed to get the stats for player \""+s.Username()+"\" "+
				"for variant "+strconv.Itoa(variants[t.Options.Variant].ID)+":", err)
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

	room := "table" + strconv.Itoa(tableID)
	chatServerSend(s.Username()+" has changed the variant to: "+d.Options.Variant, room)
}
