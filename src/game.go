package main

import (
	"strconv"
	"strings"
	"time"
)

type Game struct {
	ID         int
	DatabaseID int
	Name       string
	// The user ID of the person who started the game
	// or the current leader of the shared replay
	Owner   int
	Visible bool // Whether or not this game is shown to other users
	// This is a salted SHA512 hash sent by the client,
	// but it can technically be any string at all
	Password           string
	Options            *Options
	Players            []*Player
	Spectators         []*Spectator
	DisconSpectators   map[int]bool
	Running            bool
	Replay             bool
	DatetimeCreated    time.Time
	DatetimeLastAction time.Time
	DatetimeStarted    time.Time
	DatetimeFinished   time.Time
	EndCondition       int  // See "database_schema.sql" for mappings
	AutomaticStart     int  // See "chatPregame.go"
	NoDatabase         bool // Set to true for games created from arbitrary JSON

	Seed            string
	Deck            []*Card
	DeckIndex       int
	Stacks          []int
	StackDirections []int // The possible values for this are listed in "constants.go"
	Turn            int   // Starts at 0; the client will represent turn 0 as turn 1 to the user
	TurnsInverted   bool
	ActivePlayer    int
	Clues           int
	Score           int
	MaxScore        int
	Progress        int
	Strikes         int
	// Different actions will have different fields
	// Thus, Actions is a slice of different action types
	// Furthermore, we don't want this to be a pointer of interfaces because
	// this simplifies action scrubbing
	Actions       []interface{}
	Sound         string
	TurnBeginTime time.Time
	// Set when the final card is drawn to determine when the game should end
	EndTurn     int
	BlindPlays  int                // The number of consecutive blind plays
	Misplays    int                // The number of consecutive misplays
	Chat        []*GameChatMessage // All of the in-game chat history
	ChatRead    map[int]int        // A map of which users have read which messages
	Paused      bool               // Only applicable to timed games
	PauseTime   time.Time          // Only applicable to timed games
	PauseCount  int                // Only applicable to timed games
	PausePlayer int                // The index of the player who paused

	Hypothetical bool // Whether or not we are in a post-game hypothetical
	HypoActions  []string
}

type Options struct {
	Variant              string
	Timed                bool
	BaseTime             int
	TimePerTurn          int
	Speedrun             bool
	DeckPlays            bool
	EmptyClues           bool
	CharacterAssignments bool
	Correspondence       bool // A table option to control the idle-timeout

	// The rest of the options are parsed from the game name
	SetSeed       string
	SetReplay     int
	SetReplayTurn int
	SetDeal       string
}

type GameChatMessage struct {
	UserID   int
	Username string
	Msg      string
	Datetime time.Time
	Server   bool
}

/*
	Initialization functions
*/

func (g *Game) InitDeck() {
	// Create the deck (the amount of cards will depend on the variant)
	g.Deck = make([]*Card, 0)

	// Suits are represented as a slice of integers from 0 to the number of suits - 1
	// (e.g. {0, 1, 2, 3, 4} for a "No Variant" game)
	for suit := range variants[g.Options.Variant].Suits {
		// Ranks are represented as a slice of integers
		// (e.g. {1, 2, 3, 4, 5} for a "No Variant" game)
		for _, rank := range variants[g.Options.Variant].Ranks {
			// In a normal suit of Hanabi, there are three 1's, two 2's, two 3's, two 4's, and one five
			var amountToAdd int
			if rank == 1 {
				amountToAdd = 3
				if strings.HasPrefix(g.Options.Variant, "Up or Down") {
					amountToAdd = 1
				}
			} else if rank == 5 {
				amountToAdd = 1
			} else if rank == startCardRank {
				amountToAdd = 1
			} else {
				amountToAdd = 2
			}
			if variants[g.Options.Variant].Suits[suit].OneOfEach {
				amountToAdd = 1
			}

			for i := 0; i < amountToAdd; i++ {
				// Add the card to the deck
				g.Deck = append(g.Deck, &Card{
					Suit: suit,
					Rank: rank,
					// We can't set the order here because the deck will be shuffled later
				})
			}
		}
	}
}

/*
	Miscellaneous functions
*/

func (g *Game) GetName() string {
	return "Game #" + strconv.Itoa(g.ID) + " (" + g.Name + ") - Turn " + strconv.Itoa(g.Turn) + " - "
}

func (g *Game) GetPlayerIndex(id int) int {
	for i, p := range g.Players {
		if p.ID == id {
			return i
		}
	}
	return -1
}

func (g *Game) GetSpectatorIndex(id int) int {
	for i, sp := range g.Spectators {
		if sp.ID == id {
			return i
		}
	}
	return -1
}

func (g *Game) GetHandSize() int {
	numPlayers := len(g.Players)
	if numPlayers == 2 || numPlayers == 3 {
		return 5
	} else if numPlayers == 4 || numPlayers == 5 {
		return 4
	} else if numPlayers == 6 {
		return 3
	}

	log.Fatal("Failed to get the hand size for " + strconv.Itoa(numPlayers) + " players for game: " + g.Name)
	return -1
}

// GetMaxScore calculates what the maximum score is,
// accounting for stacks that cannot be completed due to discarded cards
func (g *Game) GetMaxScore() int {
	// Getting the maximum score is much more complicated if we are playing a "Up or Down" variant
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		return variantUpOrDownGetMaxScore(g)
	}

	maxScore := 0
	for suit := range g.Stacks {
		for rank := 1; rank <= 5; rank++ {
			// Search through the deck to see if all the copies of this card are discarded already
			total, discarded := g.GetSpecificCardNum(suit, rank)
			if total > discarded {
				maxScore++
			} else {
				break
			}
		}
	}

	return maxScore
}

// GetPerfectScore returns the theoretical perfect score for this variant
// (which assumes that there are 5 points per stack)
func (g *Game) GetPerfectScore() int {
	return len(g.Stacks) * 5
}

// GetSpecificCardNum returns the total cards in the deck of the specified suit and rank
// as well as how many of those that have been already discarded
func (g *Game) GetSpecificCardNum(suit int, rank int) (int, int) {
	total := 0
	discarded := 0
	for _, c := range g.Deck {
		if c.Suit == suit && c.Rank == rank {
			total++
			if c.Discarded {
				discarded++
			}
		}
	}

	return total, discarded
}

/*
	Other major functions
*/

// CheckTimer is meant to be called in a new goroutine
func (g *Game) CheckTimer(turn int, pauseCount int, p *Player) {
	// Sleep until the active player runs out of time
	time.Sleep(p.Time)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the game ended already
	if g.EndCondition > endConditionInProgress {
		return
	}

	// Check to see if we have made a move in the meanwhile
	if turn != g.Turn {
		return
	}

	// Check to see if the game is currently paused
	if g.Paused {
		return
	}

	// Check to see if the game was paused while we were sleeping
	if pauseCount != g.PauseCount {
		return
	}

	p.Time = 0
	log.Info(g.GetName() + "Time ran out for \"" + p.Name + "\".")

	// End the game
	p.Session.Set("currentGame", g.ID)
	p.Session.Set("status", statusPlaying)
	commandAction(p.Session, &CommandData{
		Type: actionTypeTimeLimitReached,
	})
}

func (g *Game) CheckEnd() bool {
	// Check to see if one of the players ran out of time
	if g.EndCondition == endConditionTimeout {
		return true
	}

	// Check to see if the game ended to idleness
	if g.EndCondition == actionTypeIdleLimitReached {
		return true
	}

	// Check for 3 strikes
	if g.Strikes == 3 {
		log.Info(g.GetName() + "3 strike maximum reached; ending the game.")
		g.EndCondition = endConditionStrikeout
		return true
	}

	// Check to see if the final go-around has completed
	// (which is initiated after the last card is played from the deck)
	if g.Turn == g.EndTurn {
		log.Info(g.GetName() + "Final turn reached; ending the game.")
		g.EndCondition = endConditionNormal
		return true
	}

	// Check to see if the maximum score has been reached
	if g.Score == g.MaxScore {
		log.Info(g.GetName() + "Maximum score reached; ending the game.")
		g.EndCondition = endConditionNormal
		return true
	}

	// In a speedrun, check to see if a perfect score can still be achieved
	if g.Options.Speedrun && g.GetMaxScore() < g.GetPerfectScore() {
		g.EndCondition = endConditionSpeedrunFail
		return true
	}

	// Check to see if there are any cards remaining that can be played on the stacks
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		// Searching for the next card is much more complicated if we are playing a "Up or Down" variant,
		// so the logic for this is stored in a separate file
		if !variantUpOrDownCheckAllDead(g) {
			return false
		}
	} else {
		for i, stackLen := range g.Stacks {
			// Search through the deck
			if stackLen == 5 {
				continue
			}
			neededSuit := i
			neededRank := stackLen + 1
			for _, c := range g.Deck {
				if c.Suit == neededSuit &&
					c.Rank == neededRank &&
					!c.Discarded &&
					!c.CannotBePlayed {

					return false
				}
			}
		}
	}

	// If we got this far, nothing can be played
	log.Info(g.GetName() + "No remaining cards can be played; ending the game.")
	g.EndCondition = endConditionNormal
	return true
}

// CheckIdle is meant to be called in a new goroutine
func (g *Game) CheckIdle() {
	// Set the last action
	commandMutex.Lock()
	g.DatetimeLastAction = time.Now()
	commandMutex.Unlock()

	// We want to clean up idle games, so sleep for a reasonable amount of time
	if g.Options.Correspondence {
		time.Sleep(idleGameTimeoutCorrespondence)
	} else {
		time.Sleep(idleGameTimeout)
	}
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the game still exists
	if _, ok := games[g.ID]; !ok {
		return
	}

	// Don't do anything if there has been an action in the meantime
	if time.Since(g.DatetimeLastAction) < idleGameTimeout {
		return
	}

	log.Info(g.GetName() + " Idle timeout has elapsed; ending the game.")

	if g.Replay {
		// If this is a replay,
		// we want to send a message to the client that will take them back to the lobby
		g.NotifyBoot()
	}

	// Boot all of the spectators, if any
	for len(g.Spectators) > 0 {
		s := g.Spectators[0].Session
		s.Set("currentGame", g.ID)
		s.Set("status", statusSpectating)
		commandGameUnattend(s, nil)
	}

	if g.Replay {
		// If this is a replay, then we are done;
		// it should automatically end now that all of the spectators have left
		return
	}

	// Get the session of the owner
	var s *Session
	for _, p := range g.Players {
		if p.Session.UserID() == g.Owner {
			s = p.Session
			break
		}
	}

	if g.Running {
		// We need to end a game that has started
		// (this will put everyone in a non-shared replay of the idle game)
		s.Set("currentGame", g.ID)
		s.Set("status", statusPlaying)
		commandAction(s, &CommandData{
			Type: actionTypeIdleLimitReached,
		})
	} else {
		// We need to end a game that hasn't started yet
		// Force the owner to leave, which should subsequently eject everyone else
		// (this will send everyone back to the main lobby screen)
		s.Set("currentGame", g.ID)
		s.Set("status", statusPregame)
		commandGameLeave(s, nil)
	}
}
