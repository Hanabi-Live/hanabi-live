package dispatcher

import (
	"time"
)

type CoreManager interface {
	DatetimeShutdownInit() time.Time
	GetCameOnline() string
	GetNewTableShutdownWarning() string
	GetRandomTableName() string
	GetShutdownTimeLeft() (string, error)
	GetUptime() (string, error)
	GitCommitOnStart() string
	IsDev() bool
	IsNewTablesAllowed() (bool, string)
	MaintenanceMode() bool
	SetMaintenance(enabled bool)
	SetShutdown(enabled bool)
	Shutdown()
	ShuttingDown() bool
}
