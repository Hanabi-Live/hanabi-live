package main

import (
	"bytes"
	"fmt"
)

// The header is 0x80 plus the card count; each following byte stores suit*8 + rank.
// Owned engine decks can be shorter than public JSON imports (e.g. final-round setups).
func encodeCustomDeck(cards []*CardIdentity, variant *Variant) ([]byte, error) {
	if variant == nil || len(cards) == 0 || len(cards) > 60 || len(cards) > variant.GetDeckSize() {
		return nil, fmt.Errorf("invalid custom deck length")
	}
	data := make([]byte, len(cards)+1)
	data[0] = byte(0x80 + len(cards))
	for i, card := range cards {
		if card == nil || card.SuitIndex < 0 || card.SuitIndex >= len(variant.Suits) || card.SuitIndex > 5 ||
			((card.Rank < 1 || card.Rank > 5) && card.Rank != StartCardRank) {
			return nil, fmt.Errorf("invalid custom deck card at order %d", i)
		}
		data[i+1] = byte(card.SuitIndex*8 + card.Rank)
	}
	return data, nil
}

func decodeCustomDeck(data []byte, variant *Variant) ([]*CardIdentity, error) {
	count := len(data) - 1
	if variant == nil || count < 1 || count > 60 || count > variant.GetDeckSize() ||
		int(data[0]) != 0x80+count {
		return nil, fmt.Errorf("malformed stored custom deck length")
	}
	cards := make([]*CardIdentity, count)
	for i, value := range data[1:] {
		cards[i] = &CardIdentity{SuitIndex: int(value) / 8, Rank: int(value) % 8}
	}
	if _, err := encodeCustomDeck(cards, variant); err != nil {
		return nil, err
	}
	return cards, nil
}

func customDeckForSeed(cards []*CardIdentity, variant *Variant, seed string) ([]byte, error) {
	actual, err := encodeCustomDeck(cards, variant)
	if err != nil {
		return nil, err
	}
	seeded := &Game{Variant: variant, Seed: seed, ExtraOptions: &ExtraOptions{}}
	seeded.InitDeck()
	seeded.ShuffleDeck()
	reconstructed, err := encodeCustomDeck(seeded.CardIdentities, variant)
	if err != nil {
		return nil, err
	}
	if bytes.Equal(actual, reconstructed) {
		return nil, nil
	}
	return actual, nil
}
