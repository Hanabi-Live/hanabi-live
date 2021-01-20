package characters

import (
	"fmt"
)

func (m *Manager) GetCharacterByID(characterID int) (*Character, error) {
	character, ok := m.charactersIDMap[characterID]
	if !ok {
		return nil, fmt.Errorf("\"%v\" is not a valid character ID", characterID)
	}

	return character, nil
}
