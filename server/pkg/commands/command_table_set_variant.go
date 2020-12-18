package commands

/*
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
	if d.Options == nil || len(d.Options.VariantName) == 0 {
		s.Warning("You must specify the variant. (e.g. \"/setvariant Black & Rainbow (6 Suits)\")")
		return
	}

	// Validate that the variant name is valid
	// (and store the variant ID on the options object)
	if variant, ok := variants[d.Options.VariantName]; !ok {
		s.Warningf("The variant of \"%v\" does not exist.", d.Options.VariantName)
		return
	} else {
		d.Options.VariantID = variant.ID
	}

	tableSetVariant(ctx, s, d, t)
}

func tableSetVariant(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// First, change the variant
	t.Options.VariantID = d.Options.VariantID
	t.Options.VariantName = d.Options.VariantName

	// Update the variant-specific stats for each player at the table
	for _, p := range t.Players {
		var variantStats *UserStatsRow
		if v, err := models.UserStats.Get(p.UserID, variant.ID); err != nil {
			hLog.Errorf(
				"Failed to get the stats for %v for variant %v: %v",
				util.PrintUser(s.UserID, s.Username),
				variant.ID,
				err,
			)
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

	msg := fmt.Sprintf("%v has changed the variant to: %v", s.Username, d.Options.VariantName)
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}
*/
