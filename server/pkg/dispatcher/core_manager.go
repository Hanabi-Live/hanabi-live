package dispatcher

import (
	"time"
)

type CoreManager interface {
	DatetimeShutdownInit() time.Time
	GitCommitOnStart() string
	MaintenanceMode() bool
	ShuttingDown() bool

	GetCameOnline() string
	GetNewTableShutdownWarning() string
	GetRandomTableName() string
	GetShutdownTimeLeft() (string, error)
	GetUptime() (string, error)
	IsNewTablesAllowed() (bool, string)
	SetMaintenance(enabled bool)
	SetShutdown(enabled bool)
	Shutdown()
}
