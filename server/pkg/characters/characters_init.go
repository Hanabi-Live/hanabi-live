package characters

import (
	"encoding/json"
	"io/ioutil"
	"path"
)

func (m *Manager) charactersInit(dataPath string) {
	// Import the JSON file
	filePath := path.Join(dataPath, "characters.json")
	var fileContents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		m.logger.Fatalf("Failed to read the \"%v\" file: %v", filePath, err)
	} else {
		fileContents = v
	}
	var charactersArray []*Character
	if err := json.Unmarshal(fileContents, &charactersArray); err != nil {
		m.logger.Fatalf("Failed to convert the characters file to JSON: %v", err)
	}

	// Convert the array to a map
	m.charactersNameMap = make(map[string]*Character)
	m.charactersIDMap = make(map[int]*Character)
	m.characterNames = make([]string, 0)
	for _, character := range charactersArray {
		// Validate the name
		if character.Name == "" {
			m.logger.Fatal("There is a character with an empty name in the \"characters.json\" file.")
		}

		// Validate the ID
		if character.ID < 0 { // The first character has an ID of 0
			m.logger.Fatalf("The \"%v\" character has an invalid ID.", character.Name)
		}

		// Validate the description
		if character.Description == "" {
			m.logger.Fatalf("The \"%v\" character does not have a description.", character.Name)
		}

		// Validate the emoji
		if character.Emoji == "" {
			m.logger.Fatalf("The \"%v\" character does not have an emoji.", character.Name)
		}

		// Validate that all of the names are unique
		if _, ok := m.charactersNameMap[character.Name]; ok {
			m.logger.Fatalf("There are two characters with the name of: %v", character.Name)
		}

		// Add it to the map
		m.charactersNameMap[character.Name] = character

		// Validate that all of the ID's are unique
		// And create a reverse mapping of ID to name
		// (so that we can easily find the associated character from a database entry)
		if _, ok := m.charactersIDMap[character.ID]; ok {
			m.logger.Fatalf("There are two characters with the ID of: %v", character.ID)
		}
		m.charactersIDMap[character.ID] = character

		// Create an array with every character name
		// (so that later we have the ability to easily get a random character)
		m.characterNames = append(m.characterNames, character.Name)
	}
}
