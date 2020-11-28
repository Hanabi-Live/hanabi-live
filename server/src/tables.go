package main

import (
	"strconv"
	"sync"
)

type Tables struct {
	tables map[uint64]*Table // Indexed by table ID
	mutex  *sync.RWMutex     // For handling concurrent access
}

func NewTables() *Tables {
	return &Tables{
		tables: make(map[uint64]*Table),
	}
}

func (ts *Tables) Get(tableID uint64) (*Table, bool) {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()
	t, ok := ts.tables[tableID]
	return t, ok
}

func (ts *Tables) GetList() []*Table {
	tableList := make([]*Table, 0)
	ts.mutex.RLock()
	for _, t := range ts.tables {
		tableList = append(tableList, t)
	}
	ts.mutex.RUnlock()
	return tableList
}

func (ts *Tables) GetKeys() []uint64 {
	tableIDList := make([]uint64, 0)
	ts.mutex.RLock()
	for _, t := range ts.tables {
		tableIDList = append(tableIDList, t.ID)
	}
	ts.mutex.RUnlock()
	return tableIDList
}

func (ts *Tables) Set(tableID uint64, t *Table) {
	ts.mutex.Lock()
	ts.tables[tableID] = t
	ts.mutex.Unlock()
}

func (ts *Tables) Delete(tableID uint64) {
	ts.mutex.Lock()
	delete(ts.tables, tableID)
	ts.mutex.Unlock()
}

func (ts *Tables) Length() int {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()
	return len(ts.tables)
}

func getTable(s *Session, tableID uint64) (*Table, bool) {
	t, ok := tables.Get(tableID)
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
	if !exists {
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
	tableList := tables.GetList()
	for _, t := range tableList {
		foundTable := false
		t.Mutex.Lock()
		if t.Name == tableName {
			foundTable = true
		}
		t.Mutex.Unlock()

		if foundTable {
			return t.ID, true
		}
	}

	return 0, false
}

// deleteTable removes a table from the tables map
func deleteTable(t *Table) {
	tables.Delete(t.ID)
	t.Deleted = true // It is assumed that t.Mutex is locked at this point
	notifyAllTableGone(t)
}
