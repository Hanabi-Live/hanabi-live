package main

type CardIdentity struct {
	// When reading data from a client, the server will accept either "suitIndex" or "suit" for
	// backwards compatibility
	// When sending data to a client, it will prefer the first tag e.g. "suitIndex"
	SuitIndex int `json:"suitIndex" json:"suit"` // nolint: staticcheck
	Rank      int `json:"rank"`
}
