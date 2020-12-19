package main

type Character struct {
	// Similar to variants, each character must have a unique numerical ID (for the database)
	Name                    string `json:"name"`
	ID                      int    `json:"id"`
	Description             string `json:"description"`
	Emoji                   string `json:"emoji"`
	WriteMetadataToDatabase bool   `json:"writeMetadataToDatabase"`
	Not2P                   bool   `json:"not2P"`
}
