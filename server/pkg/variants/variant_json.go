package variants

// VariantJSON matches the format of an entry in the "variants.json" file.
// We convert this simple representation to a more complex object (e.g. a "Variant").
type VariantJSON struct {
	Name  string   `json:"name"`
	ID    int      `json:"id"`
	Suits []string `json:"suits"`
	// ClueColors and ClueRanks are optional elements
	// Thus, they must be pointers so that we can tell if the values were specified or not
	ClueColors             *[]string `json:"clueColors"`
	ClueRanks              *[]int    `json:"clueRanks"`
	ColorCluesTouchNothing bool      `json:"colorCluesTouchNothing"`
	RankCluesTouchNothing  bool      `json:"rankCluesTouchNothing"`
	SpecialRank            int       `json:"specialRank"` // For e.g. Rainbow-Ones
	SpecialAllClueColors   bool      `json:"specialAllClueColors"`
	SpecialAllClueRanks    bool      `json:"specialAllClueRanks"`
	SpecialNoClueColors    bool      `json:"specialNoClueColors"`
	SpecialNoClueRanks     bool      `json:"specialNoClueRanks"`
	SpecialDeceptive       bool      `json:"specialDeceptive"`
}
