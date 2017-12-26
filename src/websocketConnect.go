package main

import (
	"io/ioutil"
	"path"
	"sort"
	"strconv"
	"time"

	melody "gopkg.in/olahol/melody.v1"
)

func websocketConnect(ms *melody.Session) {
	/*
		Establish the WebSocket session
	*/

	// Lock the command mutex for the duration of the function to ensure synchronous execution
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Turn the Melody session into a custom session
	s := &Session{ms}

	// Disconnect any existing connections with this username
	if s2, ok := sessions[s.UserID()]; ok {
		log.Info("Closing existing connection for user \"" + s.Username() + "\".")
		s2.Error("You have logged on from somewhere else, so you have been disconnected here.")
		if err := s.Close(); err != nil {
			log.Error("Attempted to manually close a WebSocket connection, but it failed.")
		} else {
			log.Info("Successfully terminated a WebSocket connection.")
		}

		// Wait until the existing connection is terminated
		commandMutex.Unlock()
		for {
			commandMutex.Lock()
			_, ok := sessions[s.UserID()]
			commandMutex.Unlock()
			if !ok {
				break
			}
		}
		commandMutex.Lock()
	}

	// Add the connection to a session map so that we can keep track of all of the connections
	sessions[s.UserID()] = s
	log.Info("User \""+s.Username()+"\" connected;", len(sessions), "user(s) now connected.")

	/*

	   // Check to see if this user was in any existing games
	   for (let gameID of Object.keys(globals.currentGames)) {
	       // Keys are strings by default, so convert it back to a number
	       gameID = parseInt(gameID, 10);

	       const game = globals.currentGames[gameID];
	       for (const player of game.players) {
	           if (player.username === socket.username) {
	               // Update the player object with the new socket
	               player.socket = socket;

	               // This was initialized to -1 earlier, so we need to update it
	               socket.currentGame = gameID;

	               // We can safely break here because the player can only be in one game at a time
	               break;
	           }
	       }
	   }

	   // Send them a random name
	   messages.getName.step1(socket, data);

	   // They have successfully logged in, so send initial messages to the client
	   socket.emit('message', {
	       type: 'hello',
	       resp: {
	           // We have to send the username back to the client because they may
	           // have logged in with the wrong case, and the client needs to know
	           // their exact username or various bugs will creep up
	           // (on vanilla Keldon, this hello message is empty)
	           username: socket.username,
	       },
	   });

	   // Alert everyone that a new user has logged in
	   // (note that Keldon sends users a message about themselves)
	   notify.allUserChange(socket);

	   // Send a "user" message for every currently connected user
	   for (let userID of Object.keys(globals.connectedUsers)) {
	       // Skip sending a message about ourselves since we already sent that
	       if (globals.connectedUsers[userID].username === socket.username) {
	           continue;
	       }

	       // Keys are strings by default, so convert it back to a number
	       userID = parseInt(userID, 10);

	       socket.emit('message', {
	           type: 'user',
	           resp: {
	               id: userID,
	               name: globals.connectedUsers[userID].username,
	               status: globals.connectedUsers[userID].status,
	           },
	       });
	   }

	   // Send a "table" message for every current table
	   for (const gameID of Object.keys(globals.currentGames)) {
	       data.gameID = gameID;
	       notify.playerTable(socket, data);
	   }

	   // Send past chat messages
	   // TODO

	   // Send the user's game history
	   models.games.getUserHistory(socket, data, step5);
	*/

	// Prepare some data about all of the ongoing races to send to the newly
	// connected user
	// (we only want to send the client a subset of the race information in
	// order to conserve bandwidth and hide some things that they don't need to
	// see)
	// https://stackoverflow.com/questions/18342784/how-to-iterate-through-a-map-in-golang-in-order/18342865
	raceIDs := make([]int, 0)
	for id := range races {
		raceIDs = append(raceIDs, id)
	}
	sort.Ints(raceIDs)
	raceListMessage := make([]RaceCreatedMessage, 0)
	for _, id := range raceIDs {
		race := races[id]
		msg := RaceCreatedMessage{
			ID:              race.ID,
			Name:            race.Name,
			Status:          race.Status,
			Ruleset:         race.Ruleset,
			Captain:         race.Captain,
			DatetimeCreated: race.DatetimeCreated,
			DatetimeStarted: race.DatetimeStarted,
		}
		racers := make([]string, 0)
		for racerName := range race.Racers {
			racers = append(racers, racerName)
		}
		msg.Racers = racers

		raceListMessage = append(raceListMessage, msg)
	}

	// Send it to the user
	websocketEmit(s, "raceList", raceListMessage)

	// Check to see if this user is in any ongoing races
	for _, id := range raceIDs {
		race := races[id]
		if _, ok := race.Racers[username]; !ok {
			// They are not in this race
			continue
		}

		// Join the user to the chat room coresponding to this race
		d.Room = "_race_" + strconv.Itoa(race.ID)
		websocketRoomJoinSub(s, d)

		// Send them all the information about the racers in this race
		racerListMessage(s, race)

		// If the race is currently in the 10 second countdown
		if race.Status == "starting" {
			// Get the time 10 seconds in the future
			startTime := time.Now().Add(10*time.Second).UnixNano() / (int64(time.Millisecond) / int64(time.Nanosecond))
			// This will technically put them behind the other racers by some amount of seconds, but it gives them 10 seconds to get ready after a disconnect

			// Send them a message describing exactly when it will start
			websocketEmit(s, "raceStart", &RaceStartMessage{
				race.ID,
				startTime,
			})
		}
	}

	// Send them the message(s) of the day
	websocketEmit(s, "adminMessage", &AdminMessageMessage{
		"[Server Notice] Most racers hang out in the Isaac Discord chat: https://discord.gg/JzbhWQb",
	})
	messageRaw, err := ioutil.ReadFile(path.Join(projectPath, "message_of_the_day.txt"))
	if err != nil {
		log.Error("Failed to read the \"message_of_the_day.txt\" file:", err)
		return
	}
	message := string(messageRaw)
	if len(message) > 0 {
		websocketEmit(s, "adminMessage", &AdminMessageMessage{
			string(messageRaw),
		})
	}
}
