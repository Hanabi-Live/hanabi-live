package main

/*

// TouchesCard returns true if a clue will touch a particular suit.
// For example, a yellow clue will not touch a green card in a normal game,
// but it will the "Dual-Color" variant.
// This mirrors the client function "touchesCard()" in "clues.ts".
func (m *Manager) TouchesCard(variantName string, clue Clue, card *Card) bool {
	variant := variants[variantName]
	suit := variant.Suits[card.SuitIndex]

	if clue.Type == ClueTypeColor {
		if variant.ColorCluesTouchNothing {
			return false
		}

		if suit.AllClueColors {
			return true
		}
		if suit.NoClueColors {
			return false
		}

		if variant.SpecialRank == card.Rank {
			if variant.SpecialAllClueColors {
				return true
			}
			if variant.SpecialNoClueColors {
				return false
			}
		}

		clueColorName := variant.ClueColors[clue.Value]

		if suit.Prism {
			// The color that touches a prism card is contingent upon the card's rank
			prismColorIndex := (card.Rank - 1) % len(variant.ClueColors)
			if card.Rank == StartCardRank {
				// "START" cards count as rank 0, so they are touched by the final color
				prismColorIndex = len(variant.ClueColors) - 1
			}
			prismColorName := variant.ClueColors[prismColorIndex]
			return clueColorName == prismColorName
		}

		return stringInSlice(clueColorName, suit.ClueColors)
	}

	if clue.Type == ClueTypeRank {
		if variant.RankCluesTouchNothing {
			return false
		}

		if variant.Suits[card.SuitIndex].AllClueRanks {
			return true
		}
		if variant.Suits[card.SuitIndex].NoClueRanks {
			return false
		}

		if variant.SpecialRank == card.Rank {
			if variant.SpecialAllClueRanks {
				return true
			}
			if variant.SpecialNoClueRanks {
				return false
			}
			if variant.SpecialDeceptive {
				// The rank that touches a deceptive card is contingent upon the card's suit
				deceptiveRank := variant.ClueRanks[card.SuitIndex%len(variant.ClueRanks)]
				return clue.Value == deceptiveRank
			}
		}

		return clue.Value == card.Rank
	}

	return false
}

*/
