package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/characters"
)

type CharactersManager interface {
	GetCharacterByID(characterID int) (*characters.Character, error)
}
