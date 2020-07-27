package main

import (
	"encoding/json"
	"io/ioutil"
	"math/rand"
	"path"
	"strconv"
	"strings"
)

type Character struct {
	// Similar to variants, each character must have a unique numerical ID (for the database)
	ID                      int    `json:"id"`
	Description             string `json:"description"`
	Emoji                   string `json:"emoji"`
	WriteMetadataToDatabase bool   `json:"writeMetadataToDatabase"`
	Not2P                   bool   `json:"not2P"`
}

var (
	characters      map[string]*Character
	characterNames  []string
	charactersID    map[int]string
	debugCharacters = []string{
		"Slow-Witted",
		"n/a",
		"n/a",
		"n/a",
		"n/a",
		"n/a",
	}
	debugUsernames = []string{
		"test",
		"test1",
		"test2",
		"test3",
		"test4",
		"test5",
		"test6",
		"test7",
	}
)

func characterInit() {
	// Import the JSON file
	filePath := path.Join(dataPath, "characters.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	characters = make(map[string]*Character)
	if err := json.Unmarshal(contents, &characters); err != nil {
		logger.Fatal("Failed to convert the characters file to JSON:", err)
		return
	}

	uniqueNameMap := make(map[string]struct{})
	uniqueIDMap := make(map[int]struct{})
	characterNames = make([]string, 0)
	charactersID = make(map[int]string)
	for name, character := range characters {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			logger.Fatal("There are two characters with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = struct{}{}

		// Validate that all of the ID's are unique
		if _, ok := uniqueIDMap[character.ID]; ok {
			logger.Fatal("There are two characters with the ID of " +
				"\"" + strconv.Itoa(character.ID) + "\".")
			return
		}
		uniqueIDMap[character.ID] = struct{}{}

		// Create an array with every character name
		// (so that later we have the ability to get a random character)
		characterNames = append(characterNames, name)

		// Create a reverse mapping of ID to name
		// (so that we can easily find the associated character from a database entry)
		charactersID[character.ID] = name
	}
}

func characterGenerate(g *Game) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	// If this is a replay of a game from the database (or a "!replay" game),
	// use the character selections from the database instead of generating new random ones
	if g.ExtraOptions.DatabaseID != 0 {
		// Get the players from the database
		var dbPlayers []*DBPlayer
		if v, err := models.Games.GetPlayers(g.ExtraOptions.DatabaseID); err != nil {
			logger.Error("Failed to get the players from the database for game "+
				strconv.Itoa(g.ExtraOptions.DatabaseID)+":", err)
			return
		} else {
			dbPlayers = v
		}

		for i, dbP := range dbPlayers {
			g.Players[i].Character = charactersID[dbP.CharacterAssignment]

			// Metadata is stored in the database as value + 1
			g.Players[i].CharacterMetadata = dbP.CharacterMetadata - 1
		}
		return
	}

	for i, p := range g.Players {
		// Initialize the metadata to -1 (it is 0 by default in order to save database space)
		p.CharacterMetadata = -1

		if stringInSlice(p.Name, debugUsernames) {
			// Hard-code some character assignments for testing purposes
			p.Character = debugCharacters[i]
		} else {
			for {
				// Get a random character assignment
				// We don't have to seed the PRNG,
				// since that was done just a moment ago when the deck was shuffled
				randomIndex := rand.Intn(len(characterNames))
				p.Character = characterNames[randomIndex]

				// Check to see if any other players have this assignment already
				alreadyAssigned := false
				for j, p2 := range g.Players {
					if i == j {
						break
					}

					if p2.Character == p.Character {
						alreadyAssigned = true
						break
					}
				}
				if alreadyAssigned {
					continue
				}

				// Check to see if this character is restricted from 2-player games
				if characters[p.Character].Not2P && len(g.Players) == 2 {
					continue
				}

				break
			}
		}

		if p.Character == "Fuming" { // 0
			// A random number from 0 to the number of colors in this variant
			p.CharacterMetadata = rand.Intn(len(variants[g.Options.VariantName].ClueColors))
		} else if p.Character == "Dumbfounded" { // 1
			// A random number from 1 to 5
			p.CharacterMetadata = rand.Intn(4) + 1
		} else if p.Character == "Inept" { // 2
			// A random number from 0 to the number of suits in this variant
			p.CharacterMetadata = rand.Intn(len(g.Stacks))
		} else if p.Character == "Awkward" { // 3
			// A random number from 1 to 5
			p.CharacterMetadata = rand.Intn(4) + 1
		}
	}
}

// characterValidateAction returns true if validation fails
func characterValidateAction(s *Session, d *CommandData, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	if p.Character == "Vindictive" && // 9
		p.CharacterMetadata == 0 &&
		(d.Type != ActionTypeColorClue && d.Type != ActionTypeRankClue) {

		s.Warning("You are " + p.Character + ", " +
			"so you must give a clue if you have been given a clue on this go-around.")
		return true
	} else if p.Character == "Insistent" && // 13
		p.CharacterMetadata != -1 &&
		(d.Type != ActionTypeColorClue && d.Type != ActionTypeRankClue) {

		s.Warning("You are " + p.Character + ", " +
			"so you must continue to clue the same card until it is played or discarded.")
		return true
	} else if p.Character == "Impulsive" && // 17
		p.CharacterMetadata == 0 &&
		(d.Type != ActionTypePlay ||
			d.Target != p.Hand[len(p.Hand)-1].Order) {

		s.Warning("You are " + p.Character + ", " +
			"so you must play your slot 1 card after it has been clued.")
		return true
	} else if p.Character == "Indolent" && // 18
		d.Type == ActionTypePlay &&
		p.CharacterMetadata == 0 {

		s.Warning("You are " + p.Character + ", " +
			"so you cannot play a card if you played one in the last round.")
		return true
	} else if p.Character == "Stubborn" && // 28
		d.Type == p.CharacterMetadata {

		s.Warning("You are " + p.Character + ", " +
			"so you cannot perform the same kind of action that the previous player did.")
		return true
	}

	return false
}

// characterValidateSecondAction returns true if validation fails
func characterValidateSecondAction(s *Session, d *CommandData, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	if p.CharacterMetadata == -1 {
		return false
	}

	if p.Character == "Genius" { // 24
		if d.Type != ActionTypeRankClue {
			s.Warning("You are " + p.Character + ", so you must now give a rank clue.")
			return true
		}

		if d.Target != p.CharacterMetadata {
			s.Warning("You are " + p.Character + ", " +
				"so you must give the second clue to the same player.")
			return true
		}
	} else if p.Character == "Panicky" && // 26
		d.Type != ActionTypeDiscard {

		s.Warning("You are " + p.Character + ", " +
			"so you must discard again since there are 4 or less clues available.")
		return true
	}

	return false
}

// characterValidateClue returns true if validation fails
func characterValidateClue(s *Session, d *CommandData, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	clue := NewClue(d)        // Convert the incoming data to a clue object
	p2 := g.Players[d.Target] // Get the target of the clue

	if p.Character == "Fuming" && // 0
		clue.Type == ClueTypeColor &&
		clue.Value != p.CharacterMetadata {

		s.Warning("You are " + p.Character + ", so you can not give that type of clue.")
		return true
	} else if p.Character == "Dumbfounded" && // 1
		clue.Type == ClueTypeRank &&
		clue.Value != p.CharacterMetadata {

		s.Warning("You are " + p.Character + ", so you can not give that type of clue.")
		return true
	} else if p.Character == "Inept" { // 2
		cardsTouched := p2.FindCardsTouchedByClue(clue)
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.SuitIndex == p.CharacterMetadata {
				s.Warning("You are " + p.Character + ", " +
					"so you cannot give clues that touch a specific suit.")
				return true
			}
		}
	} else if p.Character == "Awkward" { // 3
		cardsTouched := p2.FindCardsTouchedByClue(clue)
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.Rank == p.CharacterMetadata {
				s.Warning("You are " + p.Character + ", " +
					"so you cannot give clues that touch cards with a rank of " +
					strconv.Itoa(p.CharacterMetadata) + ".")
				return true
			}
		}
	} else if p.Character == "Conservative" && // 4
		len(p2.FindCardsTouchedByClue(clue)) != 1 {

		s.Warning("You are " + p.Character + ", " +
			"so you can only give clues that touch a single card.")
		return true
	} else if p.Character == "Greedy" && // 5
		len(p2.FindCardsTouchedByClue(clue)) < 2 {

		s.Warning("You are " + p.Character + ", so you can only give clues that touch 2+ cards.")
		return true
	} else if p.Character == "Picky" && // 6
		((clue.Type == ClueTypeRank &&
			clue.Value%2 == 0) ||
			(clue.Type == ClueTypeColor &&
				(clue.Value+1)%2 == 0)) {

		s.Warning("You are " + p.Character + ", " +
			"so you can only clue odd numbers or clues that touch odd amounts of cards.")
		return true
	} else if p.Character == "Spiteful" { // 7
		leftIndex := p.Index + 1
		if leftIndex == len(g.Players) {
			leftIndex = 0
		}
		if d.Target == leftIndex {
			s.Warning("You are " + p.Character + ", so you cannot clue the player to your left.")
			return true
		}
	} else if p.Character == "Insolent" { // 8
		rightIndex := p.Index - 1
		if rightIndex == -1 {
			rightIndex = len(g.Players) - 1
		}
		if d.Target == rightIndex {
			s.Warning("You are " + p.Character + ", so you cannot clue the player to your right.")
			return true
		}
	} else if p.Character == "Miser" && // 10
		(g.ClueTokens < 4 ||
			(strings.HasPrefix(g.Options.VariantName, "Clue Starved") && g.ClueTokens < 8)) {

		s.Warning("You are " + p.Character + ", " +
			"so you cannot give a clue unless there are 4 or more clues available.")
		return true
	} else if p.Character == "Compulsive" && // 11
		!p2.IsFirstCardTouchedByClue(clue) &&
		!p2.IsLastCardTouchedByClue(clue) {

		s.Warning("You are " + p.Character + ", " +
			"so you can only give a clue if it touches either the newest or oldest card in a hand.")
		return true
	} else if p.Character == "Mood Swings" && // 12
		p.CharacterMetadata == clue.Type {

		s.Warning("You are " + p.Character + ", so cannot give the same clue type twice in a row.")
		return true
	} else if p.Character == "Insistent" && // 13
		p.CharacterMetadata != -1 {

		cardsTouched := p2.FindCardsTouchedByClue(clue)
		touchedInsistentCard := false
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.InsistentTouched {
				touchedInsistentCard = true
				break
			}
		}
		if !touchedInsistentCard {
			s.Warning("You are " + p.Character + ", " +
				"so you must continue to clue a card until it is played or discarded.")
			return true
		}
	} else if p.Character == "Genius" && // 24
		p.CharacterMetadata == -1 {

		if g.ClueTokens < 2 ||
			(strings.HasPrefix(g.Options.VariantName, "Clue Starved") && g.ClueTokens < 4) {

			s.Warning("You are " + p.Character + ", " +
				"so there needs to be at least two clues available for you to give a clue.")
			return true
		}

		if clue.Type != ClueTypeColor {
			s.Warning("You are " + p.Character + ", so you must give a color clue first.")
			return true
		}
	}

	if p2.Character == "Vulnerable" && // 14
		clue.Type == ClueTypeRank &&
		(clue.Value == 2 || clue.Value == 5) {

		s.Warning("You cannot give a number 2 or number 5 clue to a " + p2.Character + " character.")
		return true
	} else if p2.Character == "Color-Blind" && // 15
		clue.Type == ClueTypeColor {

		s.Warning("You cannot give that color clue to a " + p2.Character + " character.")
		return true
	}

	return false
}

// characterCheckPlay returns true if the card cannot be played
func characterCheckPlay(s *Session, d *CommandData, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	if p.Character == "Hesitant" && // 19
		p.GetCardSlot(d.Target) == 1 {

		s.Warning("You cannot play that card since you are a " + p.Character + " character.")
		return true
	}

	return false
}

// characterCheckMisplay returns true if the card should misplay
func characterCheckMisplay(g *Game, p *GamePlayer, c *Card) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	if p.Character == "Follower" { // 31
		// Look through the stacks to see if two cards of this rank have already been played
		numPlayedOfThisRank := 0
		for _, s := range g.Stacks {
			if s >= c.Rank {
				numPlayedOfThisRank++
			}
		}
		if numPlayedOfThisRank < 2 {
			return true
		}
	}

	return false
}

// characterCheckDiscard returns true if the player cannot currently discard
func characterCheckDiscard(s *Session, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	if p.Character == "Anxious" && // 21
		g.ClueTokens%2 == 0 { // Even amount of clues

		s.Warning("You are " + p.Character + ", " +
			"so you cannot discard when there is an even number of clues available.")
		return true
	} else if p.Character == "Traumatized" && // 22
		g.ClueTokens%2 == 1 { // Odd amount of clues

		s.Warning("You are " + p.Character + ", " +
			"so you cannot discard when there is an odd number of clues available.")
		return true
	} else if p.Character == "Wasteful" && // 23
		((!strings.HasPrefix(g.Options.VariantName, "Clue Starved") && g.ClueTokens >= 2) ||
			(strings.HasPrefix(g.Options.VariantName, "Clue Starved") && g.ClueTokens >= 4)) {

		s.Warning("You are " + p.Character + ", " +
			"so you cannot discard if there are 2 or more clues available.")
		return true
	}

	return false
}

func characterPostClue(d *CommandData, g *Game, p *GamePlayer) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	clue := NewClue(d)        // Convert the incoming data to a clue object
	p2 := g.Players[d.Target] // Get the target of the clue

	if p.Character == "Mood Swings" { // 12
		p.CharacterMetadata = clue.Type
	} else if p.Character == "Insistent" { // 13
		// Don't do anything if they are already in their "Insistent" state
		if p.CharacterMetadata == -1 {
			// Mark that the cards that they clued must be continue to be clued
			cardsTouched := p2.FindCardsTouchedByClue(clue)
			for _, order := range cardsTouched {
				c := g.Deck[order]
				c.InsistentTouched = true
			}
			p.CharacterMetadata = 0 // 0 means that the "Insistent" state is activated
		}
	}

	if p2.Character == "Vindictive" { // 9
		// Store that they have had at least one clue given to them on this go-around of the table
		p2.CharacterMetadata = 0
	} else if p2.Character == "Impulsive" && // 17
		p2.IsFirstCardTouchedByClue(clue) {

		// Store that they had their slot 1 card clued
		p2.CharacterMetadata = 0
	}
}

func characterPostRemoveCard(g *Game, p *GamePlayer, c *Card) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	if !c.InsistentTouched {
		return
	}

	for _, c2 := range p.Hand {
		c2.InsistentTouched = false
	}

	// Find the "Insistent" player and reset their state so that
	// they are not forced to give a clue on their subsequent turn
	for _, p2 := range g.Players {
		if p2.Character == "Insistent" { // 13
			p2.CharacterMetadata = -1
			break // Only one player should be Insistent
		}
	}
}

func characterPostAction(d *CommandData, g *Game, p *GamePlayer) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	// Clear the counter for characters that have abilities relating to
	// a single go-around of the table
	if p.Character == "Vindictive" { // 9
		p.CharacterMetadata = -1
	} else if p.Character == "Impulsive" { // 17
		p.CharacterMetadata = -1
	} else if p.Character == "Indolent" { // 18
		if d.Type == ActionTypePlay {
			p.CharacterMetadata = 0
		} else {
			p.CharacterMetadata = -1
		}
	} else if p.Character == "Contrarian" { // 27
		g.TurnsInverted = !g.TurnsInverted
	}

	// Store the last action that was performed
	for _, p2 := range g.Players {
		if p2.Character == "Stubborn" { // 28
			p2.CharacterMetadata = d.Type
		}
	}
}

func characterNeedsToTakeSecondTurn(d *CommandData, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	if p.Character == "Genius" { // 24
		// Must clue both a color and a number (uses 2 clues)
		// The clue target is stored in "p.CharacterMetadata"
		if d.Type == ActionTypeColorClue {
			p.CharacterMetadata = d.Target
			return true
		} else if d.Type == ActionTypeRankClue {
			p.CharacterMetadata = -1
			return false
		}
	} else if p.Character == "Panicky" && // 26
		d.Type == ActionTypeDiscard {

		// After discarding, discards again if there are 4 clues or less
		// "p.CharacterMetadata" represents the state, which alternates between -1 and 0
		if p.CharacterMetadata == -1 &&
			(g.ClueTokens <= 4 ||
				(strings.HasPrefix(g.Options.VariantName, "Clue Starved") && g.ClueTokens <= 8)) {

			p.CharacterMetadata = 0
			return true
		} else if p.CharacterMetadata == 0 {
			p.CharacterMetadata = -1
			return false
		}
	}

	return false
}

func characterHideCard(a *ActionDraw, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	if p.Character == "Blind Spot" && a.PlayerIndex == p.GetLeftPlayer() { // 29
		return true
	} else if p.Character == "Oblivious" && a.PlayerIndex == p.GetRightPlayer() { // 30
		return true
	} else if p.Character == "Slow-Witted" { // 33
		return true
	}

	return false
}

func characterShouldSendCardIdentityOfSlot2(g *Game) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	for _, p := range g.Players {
		if p.Character == "Slow-Witted" { // 33
			return true
		}
	}

	return false
}

func characterAdjustEndTurn(g *Game) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	// Check to see if anyone is playing as a character that will adjust
	// the final go-around of the table
	for _, p := range g.Players {
		if p.Character == "Contrarian" { // 27
			g.EndTurn = g.Turn + 2
		}
	}
}

func characterCheckSoftlock(g *Game, p *GamePlayer) {
	if !g.Options.DetrimentalCharacters {
		return
	}

	if g.ClueTokens == 0 &&
		p.CharacterMetadata == 0 && // The character's "special ability" is currently enabled
		(p.Character == "Vindictive" || // 9
			p.Character == "Insistent") { // 13

		g.EndCondition = EndConditionCharacterSoftlock
	}
}

func characterEmptyClueAllowed(d *CommandData, g *Game, p *GamePlayer) bool {
	if !g.Options.DetrimentalCharacters {
		return false
	}

	if p.Character == "Blind Spot" && d.Target == p.GetLeftPlayer() { // 29
		return true
	} else if p.Character == "Oblivious" && d.Target == p.GetRightPlayer() { // 30
		return true
	}

	return false
}
