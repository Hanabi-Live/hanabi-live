package characters

/*
var (
	debugCharacters = []string{
		"Genius",
		"n/a",
		"n/a",
		"n/a",
		"n/a",
		"n/a",
	}
	debugCharacterMetadata = []int{
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
	}
	debugUsernames = []string{
		"test",
		"test1",
		"test2",
		"test3",
		"test4",
		"test5",
		"test6",
		"test7",
	}
)

func charactersGenerate(g *Game) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	// Local variables
	variant := variants[g.Options.VariantName]

	// If predefined character selections were specified, use those
	if g.ExtraOptions.CustomCharacterAssignments != nil &&
		len(g.ExtraOptions.CustomCharacterAssignments) != 0 {

		if len(g.ExtraOptions.CustomCharacterAssignments) != len(g.Players) {
			hLog.Errorf(
				"There are %v predefined characters, but there are %v players in the game.",
				len(g.ExtraOptions.CustomCharacterAssignments),
				len(g.Players),
			)
			return
		}

		for i, p := range g.Players {
			p.Character = g.ExtraOptions.CustomCharacterAssignments[i].Name
			p.CharacterMetadata = g.ExtraOptions.CustomCharacterAssignments[i].Metadata
		}
		return
	}

	// This is not a replay,
	// so we must generate new random character selections based on the game's seed
	util.SetSeedFromString(g.Seed) // Seed the random number generator

	for i, p := range g.Players {
		// Set the character
		if stringInSlice(p.Name, debugUsernames) {
			// Hard-code some character assignments for testing purposes
			p.Character = debugCharacters[i]
		} else {
			for {
				// Get a random character assignment
				// We don't have to seed the PRNG,
				// since that was done just a moment ago when the deck was shuffled
				randomIndex := rand.Intn(len(characterNames)) // nolint: gosec
				p.Character = characterNames[randomIndex]

				// Check to see if any other players have this assignment already
				alreadyAssigned := false
				for j, p2 := range g.Players {
					if i == j {
						break
					}

					if p2.Character == p.Character {
						alreadyAssigned = true
						break
					}
				}
				if alreadyAssigned {
					continue
				}

				// Check to see if this character is restricted from 2-player games
				if characters[p.Character].Not2P && len(g.Players) == 2 {
					continue
				}

				break
			}
		}

		// Initialize the metadata to -1
		p.CharacterMetadata = -1

		// Specific characters also have secondary attributes that are stored in the character
		// metadata field
		if stringInSlice(p.Name, debugUsernames) {
			p.CharacterMetadata = debugCharacterMetadata[i]
		} else {
			if p.Character == "Fuming" { // 0
				// A random number from 0 to the number of colors in this variant
				p.CharacterMetadata = rand.Intn(len(variant.ClueColors)) // nolint: gosec
			} else if p.Character == "Dumbfounded" { // 1
				// A random number from 1 to 5
				p.CharacterMetadata = rand.Intn(4) + 1 // nolint: gosec
			} else if p.Character == "Inept" { // 2
				// A random number from 0 to the number of colors in this variant
				p.CharacterMetadata = rand.Intn(len(variant.ClueColors)) // nolint: gosec
			} else if p.Character == "Awkward" { // 3
				// A random number from 1 to 5
				p.CharacterMetadata = rand.Intn(4) + 1 // nolint: gosec
			}
		}
	}
}

func characterPostAction(d *CommandData, g *Game, p *GamePlayer) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	// Clear the counter for characters that have abilities relating to
	// a single go-around of the table
	if p.Character == "Vindictive" { // 9
		p.CharacterMetadata = -1
	} else if p.Character == "Impulsive" { // 17
		p.CharacterMetadata = -1
	} else if p.Character == "Indolent" { // 18
		if d.Type == constants.ActionTypePlay {
			p.CharacterMetadata = 0
		} else {
			p.CharacterMetadata = -1
		}
	} else if p.Character == "Contrarian" { // 27
		g.TurnsInverted = !g.TurnsInverted
	}

	// Store the last action that was performed
	for _, p2 := range g.Players {
		if p2.Character == "Stubborn" { // 28
			p2.CharacterMetadata = d.Type
		}
	}
}

func characterNeedsToTakeSecondTurn(d *CommandData, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	// Local variables
	variant := variants[g.Options.VariantName]

	if p.Character == "Genius" { // 24
		// Must clue both a color and a number (uses 2 clues)
		// The clue target is stored in "p.CharacterMetadata"
		if d.Type == constants.ActionTypeColorClue {
			p.CharacterMetadata = d.Target
			return true
		} else if d.Type == constants.ActionTypeRankClue {
			p.CharacterMetadata = -1
			return false
		}
	} else if p.Character == "Panicky" && // 26
		d.Type == ActionTypeDiscard {

		// After discarding, discards again if there are 4 clues or less
		// "p.CharacterMetadata" represents the state, which alternates between -1 and 0
		if p.CharacterMetadata == -1 && g.ClueTokens <= variant.GetAdjustedClueTokens(4) {
			p.CharacterMetadata = 0
			return true
		} else if p.CharacterMetadata == 0 {
			p.CharacterMetadata = -1
			return false
		}
	}

	return false
}

func characterHasTakenLastTurn(g *Game) bool {
	if g.EndTurn == -1 {
		return false
	}
	originalPlayer := g.ActivePlayerIndex
	activePlayer := g.ActivePlayerIndex
	turnsInverted := g.TurnsInverted
	for turn := g.Turn + 1; turn <= g.EndTurn; turn++ {
		if turnsInverted {
			activePlayer += len(g.Players)
			activePlayer = (activePlayer - 1) % len(g.Players)
		} else {
			activePlayer = (activePlayer + 1) % len(g.Players)
		}
		if activePlayer == originalPlayer {
			return false
		}
		if g.Players[activePlayer].Character == "Contrarian" { // 27
			turnsInverted = !turnsInverted
		}
	}
	return true
}

func characterCheckSoftlock(g *Game, p *GamePlayer) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	// Local variables
	variant := variants[g.Options.VariantName]

	if g.ClueTokens < variant.GetAdjustedClueTokens(1) &&
		p.CharacterMetadata == 0 && // The character's "special ability" is currently enabled
		(p.Character == "Vindictive" || // 9
			p.Character == "Insistent") { // 13

		g.EndCondition = EndConditionCharacterSoftlock
		g.EndPlayer = p.Index
	}
}

*/
