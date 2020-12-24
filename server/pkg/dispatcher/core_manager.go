package dispatcher

import (
	"time"
)

type CoreManager interface {
	GitCommitOnStart() string
	ShuttingDown() bool
	DatetimeShutdownInit() time.Time
	MaintenanceMode() bool

	GetCameOnline() string
	GetNewTableShutdownWarning() string
	GetRandomTableName() string
	GetShutdownTimeLeft() (string, error)
	GetUptime() (string, error)
	IsNewTablesAllowed() (bool, string)
}
