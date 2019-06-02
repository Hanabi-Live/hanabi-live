package main

import (
	"github.com/Zamiell/hanabi-live/src/models"
)

// In the database, the variant is stored as an integer
// After retrieving game history from the database,
// convert the variant number to the full name before sending it to the client
func historyFillVariants(history []*models.GameHistory) []*models.GameHistory {
	for _, g := range history {
		g.Variant = variantsID[g.VariantNum]
	}

	return history
}
