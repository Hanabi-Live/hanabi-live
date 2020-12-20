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
	GetRandomTableName() string
	GetUptime() (string, error)
	IsNewTablesAllowed() (bool, string)
}
