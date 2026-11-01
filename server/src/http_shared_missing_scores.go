package main

import (
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpSharedMissingScores(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name(s) from the URL
	var playerIDs []int
	var playerNames []string

	// Parse the number of players from the URL
	numPlayersString := c.Param("numPlayers")
	numPlayers := 0
	if numPlayersString != "" {
		if v, err := strconv.Atoi(numPlayersString); err == nil {
			numPlayers = v
		} else {
			http.Error(w, "Error: You must first specify the number of players.", http.StatusBadRequest)
			return
		}
		if numPlayers < 2 || numPlayers > 6 {
			http.Error(w, "Error: Number of players must be between 2 and 6.", http.StatusBadRequest)
			return
		}
	}

	if v1, v2, ok := httpParsePlayerNames(c); !ok {
		return
	} else {
		playerIDs = v1
		playerNames = v2
	}

	if len(playerIDs) < 2 {
		http.Error(w, "Error: You must specify at least two players.", http.StatusNotFound)
		return
	}

	// Parse the advanced filters from the query string
	// e.g. "?excludePlayers=Alice&excludeVariants=Up or Down,Duck&minEfficiency=1&maxEfficiency=1.5"
	excludedPlayers := httpParseCommaSeparatedQuery(c, "excludePlayers")
	excludedVariants := httpParseCommaSeparatedQuery(c, "excludeVariants")
	minEfficiencyString := strings.TrimSpace(c.Query("minEfficiency"))
	maxEfficiencyString := strings.TrimSpace(c.Query("maxEfficiency"))
	var minEfficiency, maxEfficiency float64
	if minEfficiencyString != "" {
		if v, err := strconv.ParseFloat(minEfficiencyString, 64); err == nil {
			minEfficiency = v
		} else {
			http.Error(w, "Error: The minimum efficiency must be a number.", http.StatusBadRequest)
			return
		}
	}
	if maxEfficiencyString != "" {
		if v, err := strconv.ParseFloat(maxEfficiencyString, 64); err == nil {
			maxEfficiency = v
		} else {
			http.Error(w, "Error: The maximum efficiency must be a number.", http.StatusBadRequest)
			return
		}
	}

	// Figure out which players will be used in the calculation
	players := make([]*SharedMissingScoresPlayer, 0)
	includedPlayerIDs := make([]int, 0)
	includedPlayerNames := make([]string, 0)
	for i, playerName := range playerNames {
		excluded := stringInSlice(normalizeString(playerName), excludedPlayers)
		players = append(players, &SharedMissingScoresPlayer{
			Name:     playerName,
			Excluded: excluded,
		})
		if !excluded {
			includedPlayerIDs = append(includedPlayerIDs, playerIDs[i])
			includedPlayerNames = append(includedPlayerNames, playerName)
		}
	}
	if len(includedPlayerIDs) == 0 {
		http.Error(w, "Error: You can not exclude every player.", http.StatusBadRequest)
		return
	}

	// Get all of the variant-specific stats for each player
	variantStatsListList := make([][]*UserVariantStats, 0)
	for i, playerID := range includedPlayerIDs {
		var statsMap map[int]*UserStatsRow
		if v, err := models.UserStats.GetAll(playerID); err != nil {
			logger.Error("Failed to get all of the variant-specific stats for player " +
				"\"" + includedPlayerNames[i] + "\": " + err.Error())
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			statsMap = v
		}

		_, _, variantStatsList := httpGetVariantStatsList(statsMap)
		variantStatsListList = append(variantStatsListList, variantStatsList)
	}

	// Make a combined list that always uses the maximum score from any player
	// Start by copying the list for the 0th player
	combinedVariantStatsList := variantStatsListList[0]
	for i, variantStatsList := range variantStatsListList {
		if i == 0 {
			// We skip the 0th list because this is the one that we are using as a baseline
			continue
		}
		for j, variantStats := range variantStatsList {
			for k, candidateResult := range variantStats.BestScores {
				workingBestResult := combinedVariantStatsList[j].BestScores[k]
				if candidateResult.IsBetterThan(workingBestResult) {
					combinedVariantStatsList[j].BestScores[k] = candidateResult
				}
			}
		}
	}

	// Efficiencies
	// (and remove any variants that do not match the advanced filters)
	filteredVariantStatsList := make([]*UserVariantStats, 0)
	variantsEfficiencies := make([]float64, 0)
	for _, v := range combinedVariantStatsList {
		if httpVariantNameMatchesAny(v.Name, excludedVariants) {
			continue
		}

		variant := variants[v.Name]
		efficiency := variant.CalculateEfficiency(numPlayers)

		// Compare against the rounded value, since that is what is shown on the page
		roundedEfficiency := math.Round(efficiency*100) / 100
		if minEfficiencyString != "" && roundedEfficiency < minEfficiency {
			continue
		}
		if maxEfficiencyString != "" && roundedEfficiency > maxEfficiency {
			continue
		}

		filteredVariantStatsList = append(filteredVariantStatsList, v)
		variantsEfficiencies = append(variantsEfficiencies, efficiency)
	}

	lastIndex := len(playerNames) - 1
	data := &TemplateData{ // nolint: exhaustivestruct
		Title:               "Missing Scores",
		NamesTitle:          "Missing Scores for " + strings.Join(playerNames[:lastIndex], ", ") + " and " + playerNames[lastIndex],
		RequestedNumPlayers: numPlayers,
		SharedMissingScores: true,

		SharedMissingScoresPlayers: players,
		ExcludeVariants:            strings.TrimSpace(c.Query("excludeVariants")),
		MinEfficiency:              minEfficiencyString,
		MaxEfficiency:              maxEfficiencyString,
		AdvancedFiltersActive: len(includedPlayerIDs) < len(playerIDs) ||
			len(excludedVariants) > 0 ||
			minEfficiencyString != "" ||
			maxEfficiencyString != "",

		VariantStats: filteredVariantStatsList,
		Efficiencies: variantsEfficiencies,
	}
	httpServeTemplate(w, data, "profile", "missing-scores")
}

type SharedMissingScoresPlayer struct {
	Name     string
	Excluded bool
}

// httpParseCommaSeparatedQuery returns the normalized, non-empty values of a comma-separated query
// parameter, e.g. "?excludeVariants=Up or Down, Duck" --> ["up or down", "duck"]
func httpParseCommaSeparatedQuery(c *gin.Context, key string) []string {
	values := make([]string, 0)
	for _, value := range strings.Split(c.Query(key), ",") {
		value = strings.TrimSpace(value)
		if value != "" {
			values = append(values, normalizeString(value))
		}
	}
	return values
}

// httpVariantNameMatchesAny returns true if the variant name contains any of the (normalized) terms
func httpVariantNameMatchesAny(variantName string, terms []string) bool {
	normalizedVariantName := normalizeString(variantName)
	for _, term := range terms {
		if strings.Contains(normalizedVariantName, term) {
			return true
		}
	}
	return false
}
