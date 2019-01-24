package main

// This is a very long line This is a very long lineThis is a very long lineThis is a very long lineThis is a alsdhflajksdhflkjahsdfljkahsfldkjahsdlfjhasdlkfjhaslkfjhaljksdfjhlasdjhflaksjdhflkadsjhlfadjshlkadsfhjldafsjhv
import (
	"strconv"
	"strings"
	"time"
)

type Game struct {
	ID    int
	Name  string
	Owner int
	// The user ID of the person who started the game
	// or the current leader of the shared replay
	Password string
	// This is a salted SHA512 hash sent by the client,
	// but it can technically be any string at all
	Options            *Options
	Players            []*Player
	Spectators         []*Session
	DisconSpectators   map[int]bool
	Running            bool
	SharedReplay       bool
	DatetimeCreated    time.Time
	DatetimeLastAction time.Time
	DatetimeStarted    time.Time
	DatetimeFinished   time.Time
	EndCondition       int // See "database_schema.sql" for mappings

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
	Actions         []interface{}
	// Different actions will have different fields
	// Thus, Actions is a slice of different action types
	// Furthermore, we don't want this to be a pointer of interfaces because
	// this simplifies action scrubbing
	Sound         string
	TurnBeginTime time.Time
	EndTurn       int
	// Set when the final card is drawn to determine when the game should end
	BlindPlays int                // The number of consecutive blind plays
	Chat       []*GameChatMessage // All of the in-game chat history
}

type Options struct {
	Variant              string
	Timed                bool
	TimeBase             float64
	TimePerTurn          int
	DeckPlays            bool
	EmptyClues           bool
	CharacterAssignments bool
}

type GameChatMessage struct {
	UserID       int
	Username     string
	Msg          string
	DatetimeSent time.Time
}

/*
	Miscellaneous functions
*/

func (g *Game) GetName() string {
	return "Game #" + strconv.Itoa(g.ID) + " (" + g.Name + ") - Turn " + strconv.Itoa(g.Turn) + " - "
}

func (g *Game) GetPlayerIndex(id int) int {
	// If this function is called for a replay, the game will be nil, so account for this
	if g == nil {
		return -1
	}

	for i, p := range g.Players {
		if p.ID == id {
			return i
		}
	}
	return -1
}

func (g *Game) GetSpectatorIndex(id int) int {
	// If this function is called for a replay, the game will be nil, so account for this
	if g == nil {
		return -1
	}

	for i, s := range g.Spectators {
		if s.UserID() == id {
			return i
		}
	}
	return -1
}

// UpdateMaxScore goes through the deck to see if needed cards have been discarded
func (g *Game) UpdateMaxScore() {
	// Adjusting the maximum score is much more complicated if we are playing a "Up or Down" variant,
	// so the logic for this is stored in a separate file
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		variantUpOrDownUpdateMaxScore(g)
		return
	}

	g.MaxScore = 0
	for suit := range g.Stacks {
		for rank := 1; rank <= 5; rank++ {
			// Search through the deck to see if all the coipes of this card are discarded already
			total, discarded := g.GetSpecificCardNum(suit, rank)
			if total > discarded {
				g.MaxScore++
			} else {
				break
			}
		}
	}
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
func (g *Game) CheckTimer(turn int, p *Player) {
	// Sleep until the active player runs out of time
	time.Sleep(p.Time)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the game ended already
	if g.EndCondition > 0 {
		return
	}

	// Check to see if we have made a move in the meanwhile
	if turn != g.Turn {
		return
	}

	p.Time = 0
	log.Info(g.GetName() + "Time ran out for \"" + p.Name + "\".")

	// End the game
	d := &CommandData{
		Type: 4,
	}
	p.Session.Set("currentGame", g.ID)
	commandAction(p.Session, d)
}

func (g *Game) CheckEnd() bool {
	// Check for 3 strikes
	if g.Strikes == 3 {
		log.Info(g.GetName() + "3 strike maximum reached; ending the game.")
		g.EndCondition = 2
		return true
	}

	// Check to see if the final go-around has completed
	// (which is initiated after the last card is played from the deck)
	if g.Turn == g.EndTurn {
		log.Info(g.GetName() + "Final turn reached; ending the game.")
		g.EndCondition = 1
		return true
	}

	// Check to see if the maximum score has been reached
	if g.Score == g.MaxScore {
		log.Info(g.GetName() + "Maximum score reached; ending the game.")
		g.EndCondition = 1
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
			neededSuit := i
			neededRank := stackLen + 1
			for _, c := range g.Deck {
				if c.Suit == neededSuit &&
					c.Rank == neededRank &&
					!c.Discarded {

					return false
				}
			}
		}
	}

	// If we got this far, nothing can be played
	log.Info(g.GetName() + "No remaining cards can be played; ending the game.")
	g.EndCondition = 1
	return true
}

// CheckIdle is meant to be called in a new goroutine
func (g *Game) CheckIdle() {
	// Set the last action
	commandMutex.Lock()
	g.DatetimeLastAction = time.Now()
	commandMutex.Unlock()

	// We want to clean up idle games, so sleep for a reasonable amount of time
	time.Sleep(idleGameTimeout + time.Second)
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

	if g.SharedReplay {
		// If this is a shared replay, we want to send a message to the client that will take them back to the lobby
		g.NotifyBoot()
	}

	// Boot all of the spectators, if any
	for len(g.Spectators) > 0 {
		s := g.Spectators[0]
		s.Set("currentGame", g.ID)
		s.Set("status", "Spectating")
		commandGameUnattend(s, nil)
	}

	if g.SharedReplay {
		// If this is a shared replay, then we are done;
		// the shared should automatically end now that all of the spectators have left
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
		d := &CommandData{
			Type: actionTypeIdleLimitReached,
		}
		s.Set("currentGame", g.ID)
		s.Set("status", "Playing")
		commandAction(s, d)
	} else {
		// We need to end a game that hasn't started yet
		// Force the owner to leave, which should subsequently eject everyone else
		// (this will send everyone back to the main lobby screen)
		s.Set("currentGame", g.ID)
		s.Set("status", "Pre-Game")
		commandGameLeave(s, nil)
	}
}
