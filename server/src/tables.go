package main

import (
	"strconv"
	"sync"
)

var (
	tables      = make(map[uint64]*Table)
	tablesMutex = sync.RWMutex{}

	// The counter is atomically incremented before assignment,
	// so the first ID will be 1 and will increase from there
	tableIDCounter uint64 = 0
)

func getTable(s *Session, tableID uint64) (*Table, bool) {
	// Golang maps are not safe for concurrent use
	tablesMutex.RLock()
	t, ok := tables[tableID]
	tablesMutex.RUnlock()

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
func getTableAndLock(s *Session, tableID uint64, acquireLock bool) (*Table, bool) {
	t, exists := getTable(s, tableID)
	if !exists || t.Deleted {
		return nil, false
	}

	if acquireLock {
		// By default, every table-related command will acquire the table lock before performing
		// any work on the table
		// After calling "getTableAndLock()", the parent function should immediately perform a
		// "defer t.Mutex.Unlock()"
		t.Mutex.Lock()

		// Prevent the race condition where the table can be removed from the map while the
		// above lock acquisition is blocking
		if t.Deleted {
			t.Mutex.Unlock()
			return nil, false
		}
	}

	return t, true
}

func getTableIDFromName(tableName string) (uint64, bool) {
	tablesMutex.RLock()
	defer tablesMutex.RUnlock()

	for _, t := range tables {
		if t.Name == tableName {
			return t.ID, true
		}
	}

	return 0, false
}

func deleteTable(t *Table) {
	logger.Debug("Acquiring tables write lock in the \"deleteTable()\" function.")
	tablesMutex.Lock()
	logger.Debug("Acquired tables write lock in the \"deleteTable()\" function.")
	delete(tables, t.ID)
	t.Deleted = true
	tablesMutex.Unlock()

	notifyAllTableGone(t)
}
