package main

import (
	"context"
	"strconv"

	"github.com/sasha-s/go-deadlock"
)

type Tables struct {
	tables     map[uint64]*Table // Indexed by table ID
	playing    map[int][]uint64  // Indexed by user ID, values are table IDs
	spectating map[int][]uint64  // Indexed by user ID, values are table IDs
	// We also keep track of spectators who have disconnected
	// so that we can automatically put them back into the shared replay
	disconSpectating map[int]uint64    // Indexed by user ID, value is a table ID
	mutex            *deadlock.RWMutex // For handling concurrent access
}

func NewTables() *Tables {
	return &Tables{
		tables:           make(map[uint64]*Table),
		playing:          make(map[int][]uint64),
		spectating:       make(map[int][]uint64),
		disconSpectating: make(map[int]uint64),
		mutex:            &deadlock.RWMutex{},
	}
}

// ---------------------------
// Methods related to "tables"
// ---------------------------

func (ts *Tables) Get(tableID uint64, acquireTablesLock bool) (*Table, bool) {
	if acquireTablesLock {
		ts.mutex.RLock()
		defer ts.mutex.RUnlock()
	}

	t, ok := ts.tables[tableID]
	return t, ok
}

func (ts *Tables) GetList(acquireLock bool) []*Table {
	if acquireLock {
		ts.mutex.RLock()
		defer ts.mutex.RUnlock()
	}

	tableList := make([]*Table, 0)
	for _, t := range ts.tables {
		tableList = append(tableList, t)
	}
	return tableList
}

func (ts *Tables) GetTableIDs() []uint64 {
	// It is assumed that the tables mutex is locked when calling this function
	tableIDList := make([]uint64, 0)
	for tableID := range ts.tables {
		tableIDList = append(tableIDList, tableID)
	}
	return tableIDList
}

func (ts *Tables) Set(tableID uint64, t *Table) {
	// It is assumed that the tables mutex is locked when calling this function
	ts.tables[tableID] = t
}

func (ts *Tables) Delete(tableID uint64) {
	// It is assumed that the tables mutex is locked when calling this function
	delete(ts.tables, tableID)

	// If any users disconnected while spectating this table,
	// we need to clear out these fields to prevent them from rejoining a table that does not exist
	keysToDelete := make([]int, 0)
	for userID, disconTableID := range ts.disconSpectating {
		if disconTableID == tableID {
			keysToDelete = append(keysToDelete, userID)
		}
	}

	for _, userID := range keysToDelete {
		delete(ts.disconSpectating, userID)
	}
}

// ----------------------------
// Methods related to "playing"
// ----------------------------

func (ts *Tables) AddPlaying(userID int, tableID uint64) {
	// It is assumed that the tables mutex is locked when calling this function
	tableList, ok := ts.playing[userID]
	if !ok {
		tableList = make([]uint64, 0)
	}
	tableList = append(tableList, tableID)
	ts.playing[userID] = tableList
}

func (ts *Tables) DeletePlaying(userID int, tableID uint64) {
	// It is assumed that the tables mutex is locked when calling this function
	tableList, ok := ts.playing[userID]
	if !ok {
		return
	}

	i := indexOf(tableID, tableList)
	if i == -1 {
		return
	}

	tableList = append(tableList[:i], tableList[i+1:]...)
	if len(tableList) == 0 {
		delete(ts.playing, userID)
	} else {
		ts.playing[userID] = tableList
	}
}

func (ts *Tables) GetTablesUserPlaying(userID int) []uint64 {
	// It is assumed that the tables mutex is locked when calling this function
	if tablesList, ok := ts.playing[userID]; ok {
		return tablesList
	}
	return make([]uint64, 0)
}

// -------------------------------
// Methods related to "spectating"
// -------------------------------

func (ts *Tables) AddSpectating(userID int, tableID uint64) {
	// It is assumed that the tables mutex is locked when calling this function
	tableList, ok := ts.spectating[userID]
	if !ok {
		tableList = make([]uint64, 0)
	}
	tableList = append(tableList, tableID)
	ts.spectating[userID] = tableList
}

func (ts *Tables) DeleteSpectating(userID int, tableID uint64) {
	// It is assumed that the tables mutex is locked when calling this function
	tableList, ok := ts.spectating[userID]
	if !ok {
		return
	}

	i := indexOf(tableID, tableList)
	if i == -1 {
		return
	}

	tableList = append(tableList[:i], tableList[i+1:]...)
	if len(tableList) == 0 {
		delete(ts.spectating, userID)
	} else {
		ts.spectating[userID] = tableList
	}
}

func (ts *Tables) GetTablesUserSpectating(userID int) []uint64 {
	// It is assumed that the tables mutex is locked when calling this function
	if tablesList, ok := ts.spectating[userID]; ok {
		return tablesList
	}
	return make([]uint64, 0)
}

// -------------------------------------
// Methods related to "disconSpectating"
// -------------------------------------

func (ts *Tables) SetDisconSpectating(userID int, tableID uint64) {
	ts.mutex.Lock()
	ts.disconSpectating[userID] = tableID
	ts.mutex.Unlock()
}

func (ts *Tables) DeleteDisconSpectating(userID int) {
	// It is assumed that the tables mutex is locked when calling this function
	delete(ts.disconSpectating, userID)
}

func (ts *Tables) GetDisconSpectatingTable(userID int) (uint64, bool) {
	// It is assumed that the tables mutex is locked when calling this function
	tableID, ok := ts.disconSpectating[userID]
	return tableID, ok
}

// --------------------------
// Methods related to "mutex"
// --------------------------

func (ts *Tables) Lock(ctx context.Context) {
	ts.mutex.Lock()
}

func (ts *Tables) Unlock(ctx context.Context) {
	ts.mutex.Unlock()
}

func (ts *Tables) RLock() {
	ts.mutex.RLock()
}

func (ts *Tables) RUnlock() {
	ts.mutex.RUnlock()
}

// ----------------
// Helper functions
// ----------------

func getTable(s *Session, tableID uint64, acquireTablesLock bool) (*Table, bool) {
	t, ok := tables.Get(tableID, acquireTablesLock)
	if !ok {
		if s != nil {
			s.Warning("Table " + strconv.FormatUint(tableID, 10) + " does not exist.")
		}
		return nil, false
	}

	return t, true
}

// getTableAndLock checks to see if the given table exists
// If it does, it locks the table mutex and returns it
func getTableAndLock(
	ctx context.Context,
	s *Session,
	tableID uint64,
	acquireTableLock bool,
	acquireTablesLock bool,
) (*Table, bool) {
	t, ok := getTable(s, tableID, acquireTablesLock)
	if !ok {
		return nil, false
	}

	if acquireTableLock {
		// By default, every table-related command will acquire the table lock before performing
		// any work on the table
		// After calling "getTableAndLock()", the parent function should immediately perform a
		// "defer t.Mutex.Unlock()"
		t.Lock(ctx)

		// Prevent the race condition where the table can be removed from the map while the above
		// lock acquisition is blocking
		if t.Deleted {
			t.Unlock(ctx)
			return nil, false
		}
	}

	return t, true
}

func getTableIDFromName(ctx context.Context, tableName string) (uint64, bool) {
	tableList := tables.GetList(false)
	for _, t := range tableList {
		foundTable := false
		t.Lock(ctx)
		if t.Name == tableName {
			foundTable = true
		}
		t.Unlock(ctx)

		if foundTable {
			return t.ID, true
		}
	}

	return 0, false
}

func deleteTable(t *Table) {
	tables.Delete(t.ID) // It is assumed that tables.mutex is locked at this point
	t.Deleted = true    // It is assumed that t.Mutex is locked at this point
	notifyAllTableGone(t)
}
