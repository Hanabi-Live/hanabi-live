package main

import (
	"strconv"
)

// commandChangeVariant is sent when a user types the "/changevariant [variant]" command
//
// Example data:
// {
//   tableID: 123,
//   variant: 'Black & Rainbow (6 Suit)',
// }
func commandChangeVariant(s *Session, d *CommandData) {
	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	if t.Running {
		s.Warning(ChatCommandStartedFail)
		return
	}

	if s.UserID() != t.Owner {
		s.Warning(ChatCommandNotOwnerFail)
		return
	}

	if len(d.Variant) == 0 {
		s.Warning("You must specify the variant. (e.g. \"/changevariant Black & Rainbow (6 Suits)\")")
		return
	}

	if _, ok := variants[d.Variant]; !ok {
		s.Warning("The variant of \"" + d.Variant + "\" does not exist.")
		return
	}

	t.Options.Variant = d.Variant
	room := "table" + strconv.Itoa(tableID)
	chatServerSend(s.Username()+" has changed the variant to: "+d.Variant, room)

	// Update the variant in the table list for everyone in the lobby
	notifyAllTable(t)

	// Even though no-one has joined or left the game,
	// this function will update the display of the variant on the client
	t.NotifyPlayerChange()
}
