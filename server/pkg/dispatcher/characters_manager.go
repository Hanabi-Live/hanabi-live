package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type CharactersManager interface {
	GetCharacterByID(characterID int) (*types.Character, error)
}
