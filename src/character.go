package main

import (
	"encoding/json"
	"io/ioutil"
	"math/rand"
	"path"
	"strconv"

	"github.com/Zamiell/hanabi-live/src/models"
)

const debugCharacter = "Insistent"

type Character struct {
	Name string `json:"name"`
	// Similar to variants, each character must have a unique numerical ID (for the database)
	ID          int    `json:"id"`
	Description string `json:"description"`
	Emoji       string `json:"emoji"`
	Not2P       bool   `json:"not2P"`
}

var (
	characters     map[string]Character
	characterNames []string
	charactersID   map[int]string
)

func characterInit() {
	// Import the JSON file
	filePath := path.Join(projectPath, "public", "data", "characters.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		log.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	characters = make(map[string]Character)
	if err := json.Unmarshal(contents, &characters); err != nil {
		log.Fatal("Failed to convert the characters file to JSON:", err)
		return
	}

	uniqueNameMap := make(map[string]bool)
	uniqueIDMap := make(map[int]bool)
	characterNames = make([]string, 0)
	charactersID = make(map[int]string)
	for name, character := range characters {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			log.Fatal("There are two characters with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = true

		// Validate that all of the ID's are unique
		if _, ok := uniqueIDMap[character.ID]; ok {
			log.Fatal("There are two characters with the ID of " +
				"\"" + strconv.Itoa(character.ID) + "\".")
			return
		}
		uniqueIDMap[character.ID] = true

		// Copy the name of the character inside the object for later use
		character.Name = name

		// Create an array with every character name
		// (so that later we have the ability to get a random character)
		characterNames = append(characterNames, name)

		// Create a reverse mapping of ID to name
		// (so that we can easily find the associated character from a database entry)
		charactersID[character.ID] = character.Name
	}
}

func characterGenerate(g *Game) {
	if !g.Options.CharacterAssignments {
		return
	}

	// If this is a "!replay" game, use the character selections from the database instead of
	// generating new random ones
	if g.Options.SetReplay != 0 {
		// Get the players from the database
		var dbPlayers []*models.Player
		if v, err := db.Games.GetPlayers(g.Options.SetReplay); err != nil {
			log.Error("Failed to get the players from the database for game "+strconv.Itoa(g.Options.SetReplay)+":", err)
			return
		} else {
			dbPlayers = v
		}

		for i, p := range dbPlayers {
			g.Players[i].Character = charactersID[p.CharacterAssignment]
			g.Players[i].CharacterMetadata = p.CharacterMetadata
		}
		return
	}

	// We don't have to seed the PRNG, since that was done just a moment ago when the deck was shuffled
	for i, p := range g.Players {
		for {
			// Get a random character assignment
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

			// Hard-code some character assignments for testing purposes
			if p.Name == "test" {
				for i, c := range characters {
					if c.Name == debugCharacter {
						p.Character = i
						break
					}
				}
			}

			break
		}

		if p.Character == "Fuming" {
			// A random number from 0 to the number of colors in this variant
			p.CharacterMetadata = rand.Intn(len(variants[g.Options.Variant].ClueColors))
		} else if p.Character == "Dumbfounded" {
			// A random number from 1 to 5
			p.CharacterMetadata = rand.Intn(4) + 1
		} else if p.Character == "Inept" {
			// A random number from 0 to the number of suits in this variant
			p.CharacterMetadata = rand.Intn(len(g.Stacks))
		} else if p.Character == "Awkward" {
			// A random number from 1 to 5
			p.CharacterMetadata = rand.Intn(4) + 1
		}
	}
}

func characterValidateAction(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.Character == "Vindictive" &&
		p.CharacterMetadata == 0 &&
		d.Type != actionTypeClue {

		s.Warning("You are " + p.Character + ", so you must give a clue if you have been given a clue on this go-around.")
		return true

	} else if p.Character == "Insistent" &&
		p.CharacterMetadata != -1 &&
		d.Type != actionTypeClue {

		s.Warning("You are " + p.Character + ", so you must continue to clue cards until one of them is played or discarded.")
		return true

	} else if p.Character == "Impulsive" &&
		p.CharacterMetadata == 0 &&
		(d.Type != actionTypePlay ||
			d.Target != p.Hand[len(p.Hand)-1].Order) {

		s.Warning("You are " + p.Character + ", so you must play your slot 1 card after it has been clued.")
		return true

	} else if p.Character == "Stubborn" &&
		d.Type == p.CharacterMetadata {

		s.Warning("You are " + p.Character + ", so you cannot perform the same kind of action that the previous player did.")
		return true

	} else if p.Character == "Indolent" &&
		d.Type == actionTypePlay &&
		p.CharacterMetadata == 0 {

		s.Warning("You are " + p.Character + ", so you cannot play a card if you played one in the last round.")
		return true
	}

	return false
}

func characterValidateSecondAction(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.CharacterMetadata == -1 {
		return false
	}

	if p.Character == "Genius" {
		if d.Type != actionTypeClue {
			s.Warning("You are " + p.Character + ", so you must now give your second clue.")
			return true
		}

		if d.Clue.Type != clueTypeColor {
			s.Warning("You are " + p.Character + ", so you must now give a color clue.")
			return true
		}

		if d.Target != p.CharacterMetadata {
			s.Warning("You are " + p.Character + ", so you must give the second clue to the same player.")
			return true
		}

	} else if p.Character == "Synesthetic" {
		if d.Type != actionTypeClue {
			s.Warning("You are " + p.Character + ", so you must now give your second clue.")
			return true
		}

		if d.Clue.Type != clueTypeColor {
			s.Warning("You are " + p.Character + ", so you must now give a color clue.")
			return true
		}

		if d.Target != p.CharacterMetadata {
			s.Warning("You are " + p.Character + ", so you must give the second clue to the same player.")
			return true
		}

		if d.Clue.Value != p.CharacterMetadata2 {
			s.Warning("You are " + p.Character + ", so you must give the matching color clue.")
			return true
		}

	} else if p.Character == "Panicky" &&
		d.Type != actionTypeDiscard {

		s.Warning("You are " + p.Character + ", so you must discard again since there are 4 or less clues available.")
		return true
	}

	return false
}

// characterCheckClue returns true if the clue cannot be given
func characterCheckClue(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	// Get the target of the clue
	p2 := g.Players[d.Target]

	if p.Character == "Fuming" &&
		d.Clue.Type == clueTypeColor &&
		d.Clue.Value != p.CharacterMetadata {

		s.Warning("You are " + p.Character + ", so you can not give that type of clue.")
		return true

	} else if p.Character == "Dumbfounded" &&
		d.Clue.Type == clueTypeRank &&
		d.Clue.Value != p.CharacterMetadata {

		s.Warning("You are " + p.Character + ", so you can not give that type of clue.")
		return true

	} else if p.Character == "Inept" {
		cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.Suit == p.CharacterMetadata {
				s.Warning("You are " + p.Character + ", so you cannot give clues that touch a specific suit.")
				return true
			}
		}

	} else if p.Character == "Awkward" {
		cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.Rank == p.CharacterMetadata {
				text := "You are " + p.Character + ", so you cannot give clues that touch cards "
				text += "with a rank of " + strconv.Itoa(p.CharacterMetadata) + "."
				s.Warning(text)
				return true
			}
		}

	} else if p.Character == "Conservative" &&
		len(p2.FindCardsTouchedByClue(d.Clue, g)) != 1 {

		s.Warning("You are " + p.Character + ", so you can only give clues that touch a single card.")
		return true

	} else if p.Character == "Greedy" &&
		len(p2.FindCardsTouchedByClue(d.Clue, g)) < 2 {

		s.Warning("You are " + p.Character + ", so you can only give clues that touch 2+ cards.")
		return true

	} else if p.Character == "Picky" &&
		((d.Clue.Type == clueTypeRank &&
			d.Clue.Value%2 == 0) ||
			(d.Clue.Type == clueTypeColor &&
				(d.Clue.Value+1)%2 == 0)) {

		s.Warning("You are " + p.Character + ", so you can only clue odd numbers or clues that touch odd amounts of cards.")
		return true

	} else if p.Character == "Spiteful" {
		leftIndex := p.Index + 1
		if leftIndex == len(g.Players) {
			leftIndex = 0
		}
		if d.Target == leftIndex {
			s.Warning("You are " + p.Character + ", so you cannot clue the player to your left.")
			return true
		}

	} else if p.Character == "Insolent" {
		rightIndex := p.Index - 1
		if rightIndex == -1 {
			rightIndex = len(g.Players) - 1
		}
		if d.Target == rightIndex {
			s.Warning("You are " + p.Character + ", so you cannot clue the player to your right.")
			return true
		}

	} else if p.Character == "Miser" &&
		g.Clues < 4 {

		s.Warning("You are " + p.Character + ", so you cannot give a clue unless there are 4 or more clues available.")
		return true

	} else if p.Character == "Compulsive" &&
		!p2.IsFirstCardTouchedByClue(d.Clue, g) &&
		!p2.IsLastCardTouchedByClue(d.Clue, g) {

		text := "You are " + p.Character + ", so you can only give a clue if it touches either the "
		text += "newest or oldest card in a hand."
		s.Warning(text)
		return true

	} else if p.Character == "Mood Swings" &&
		p.CharacterMetadata == d.Clue.Type {

		s.Warning("You are " + p.Character + ", so cannot give the same clue type twice in a row.")
		return true

	} else if p.Character == "Insistent" &&
		p.CharacterMetadata != -1 {

		if d.Target != p.CharacterMetadata {
			text := "You are " + p.Character + ", so you must continue to clue cards until one of "
			text += "them is played or discarded."
			s.Warning(text)
			return true
		}

		cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
		touchedInsistentCards := false
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.InsistentTouched {
				touchedInsistentCards = true
				break
			}
		}
		if !touchedInsistentCards {
			text := "You are " + p.Character + ", so you must continue to clue cards until one of "
			text += "them is played or discarded."
			s.Warning(text)
			return true
		}

	} else if p.Character == "Genius" &&
		p.CharacterMetadata == -1 {

		if g.Clues < 2 {
			s.Warning("You are " + p.Character + ", so there needs to be at least two clues available for you to give a clue.")
			return true
		}
		if d.Clue.Type != clueTypeRank {
			s.Warning("You are " + p.Character + ", so you must give a rank clue first.")
			return true
		}

	} else if p.Character == "Synesthetic" &&
		p.CharacterMetadata == -1 {

		if d.Clue.Type != clueTypeRank {
			s.Warning("You are " + p.Character + ", so you must give a rank clue first.")
			return true
		}

		clue := Clue{
			Type:  clueTypeColor,
			Value: d.Clue.Value - 1,
		}
		cardsTouched := p2.FindCardsTouchedByClue(clue, g)
		if len(cardsTouched) == 0 {
			s.Warning("You are " + p.Character + ", so both versions of the clue must touch at least 1 card in the hand.")
			return true
		}

	}
	if p2.Character == "Vulnerable" &&
		d.Clue.Type == clueTypeRank &&
		(d.Clue.Value == 2 ||
			d.Clue.Value == 5) {

		s.Warning("You cannot give a number 2 or number 5 clue to a " + p2.Character + " character.")
		return true

	} else if p2.Character == "Color-Blind" &&
		d.Clue.Type == clueTypeColor {

		s.Warning("You cannot give that color clue to a " + p2.Character + " character.")
		return true
	}

	return false
}

// characterCheckPlay returns true if the card cannot be played
func characterCheckPlay(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.Character == "Hesitant" &&
		p.GetCardSlot(d.Target) == 1 {

		s.Warning("You cannot play that card since you are a " + p.Character + " character.")
		return true
	}

	return false
}

// characterCheckMisplay returns true if the card should misplay
func characterCheckMisplay(g *Game, p *Player, c *Card) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.Character == "Follower" {
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
func characterCheckDiscard(s *Session, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.Character == "Anxious" &&
		g.Clues%2 == 0 { // Even amount of clues

		s.Warning("You are " + p.Character + ", so you cannot discard when there is an even number of clues available.")
		return true

	} else if p.Character == "Traumatized" &&
		g.Clues%2 == 1 { // Odd amount of clues

		s.Warning("You are " + p.Character + ", so you cannot discard when there is an odd number of clues available.")
		return true

	} else if p.Character == "Wasteful" &&
		g.Clues >= 2 {

		s.Warning("You are " + p.Character + ", so you cannot discard if there are 2 or more clues available.")
		return true
	}

	return false
}

func characterPostClue(d *CommandData, g *Game, p *Player) {
	if !g.Options.CharacterAssignments {
		return
	}

	// Get the target of the clue
	p2 := g.Players[d.Target]

	if p.Character == "Mood Swings" {
		p.CharacterMetadata = d.Clue.Type
	} else if p.Character == "Insistent" {
		// Mark that the cards that they clued must be continue to be clued
		cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
		for _, order := range cardsTouched {
			c := g.Deck[order]
			c.InsistentTouched = true
		}
	}

	if p2.Character == "Vindictive" {
		// Store that they have had at least one clue given to them on this go-around of the table
		p2.CharacterMetadata = 0

	} else if p2.Character == "Impulsive" &&
		p2.IsFirstCardTouchedByClue(d.Clue, g) {

		// Store that they had their slot 1 card clued
		p2.CharacterMetadata = 0
	}
}

func characterPostRemove(g *Game, p *Player, c *Card) {
	if !g.Options.CharacterAssignments {
		return
	}

	if !c.InsistentTouched {
		return
	}

	for _, c2 := range p.Hand {
		if c2.InsistentTouched {
			c2.InsistentTouched = false
		}
	}

	// Find the "Insistent" player and reset their state so that
	// they are not forced to give a clue on their subsequent turn
	for _, p2 := range g.Players {
		if characters[p2.Character].Name == "Insistent" {
			p2.CharacterMetadata = -1
			break // Only one player should be Insistent
		}
	}
}

func characterPostAction(d *CommandData, g *Game, p *Player) {
	if !g.Options.CharacterAssignments {
		return
	}

	// Clear the counter for characters that have abilities relating to a single go-around of the table
	if p.Character == "Vindictive" {
		p.CharacterMetadata = -1
	} else if p.Character == "Impulsive" {
		p.CharacterMetadata = -1
	} else if p.Character == "Indolent" {
		if d.Type == actionTypePlay {
			p.CharacterMetadata = 0
		} else {
			p.CharacterMetadata = -1
		}
	} else if p.Character == "Contrarian" {
		g.TurnsInverted = !g.TurnsInverted
	}

	// Store the last action that was performed
	for _, p2 := range g.Players {
		name2 := characters[p2.Character].Name
		if name2 == "Stubborn" {
			p2.CharacterMetadata = d.Type
		}
	}
}

func characterTakingSecondTurn(d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.Character == "Genius" &&
		d.Type == actionTypeClue {

		// Must clue both a number and a color (uses 2 clues)
		// The clue target is stored in "p.CharacterMetadata"
		if p.CharacterMetadata == -1 {
			p.CharacterMetadata = d.Target
			return true
		}
		p.CharacterMetadata = -1
		return false

	} else if p.Character == "Synesthetic" &&
		d.Type == actionTypeClue {

		// Must clue both a number and a color of the same value (uses 1 clue)
		// The clue target is stored in "p.CharacterMetadata"
		// The value of the clue is stored in "p.CharacterMetadata2"
		if p.CharacterMetadata == -1 {
			p.CharacterMetadata = d.Target
			p.CharacterMetadata2 = d.Clue.Value - 1
			g.Clues++ // The second clue given should not cost a clue
			return true
		}
		p.CharacterMetadata = -1
		p.CharacterMetadata2 = -1
		return false

	} else if p.Character == "Panicky" &&
		d.Type == actionTypeDiscard {

		// After discarding, discards again if there are 4 clues or less
		// "p.CharacterMetadata" represents the state, which alternates between -1 and 0
		if p.CharacterMetadata == -1 &&
			g.Clues <= 4 {

			p.CharacterMetadata = 0
			return true

		} else if p.CharacterMetadata == 0 {
			p.CharacterMetadata = -1
			return false
		}
	}

	return false
}

func characterShuffle(g *Game, p *Player) {
	if !g.Options.CharacterAssignments {
		return
	}

	if p.Character == "Forgetful" {
		p.ShuffleHand(g)
	}
}

func characterHideCard(a *ActionDraw, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.Character == "Blind Spot" && a.Who == p.GetLeftPlayer(g) {
		return true
	} else if p.Character == "Oblivious" && a.Who == p.GetRightPlayer(g) {
		return true
	}

	return false
}

func characterAdjustEndTurn(g *Game) {
	if !g.Options.CharacterAssignments {
		return
	}

	// Check to see if anyone is playing as a character that will adjust the final go-around of the table
	for _, p := range g.Players {
		if p.Character == "Contrarian" {
			g.EndTurn = g.Turn + 2
		}
	}
}

func characterCheckSoftlock(g *Game, p *Player) {
	if !g.Options.CharacterAssignments {
		return
	}

	if g.Clues == 0 &&
		(p.Character == "Vindictive" || p.Character == "Insistent") {

		g.Strikes = 3
	}

	text := p.Name + " was left with 0 clues!"
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	g.NotifyAction()
}

func characterEmptyClueAllowed(d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.Character == "Blind Spot" && d.Target == p.GetLeftPlayer(g) {
		return true
	} else if p.Character == "Oblivious" && d.Target == p.GetRightPlayer(g) {
		return true
	}

	return false
}
