package characters

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

func (m *Manager) GetCharacterByID(characterID int) (*types.Character, error) {
	character, ok := m.charactersIDMap[characterID]
	if !ok {
		return nil, fmt.Errorf("\"%v\" is not a valid character ID", characterID)
	}

	return character, nil
}
