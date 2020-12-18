package dispatcher

import (
	"time"
)

type coreManager interface {
	ShuttingDown() bool
	DatetimeShutdownInit() time.Time
	MaintenanceMode() bool

	GetRandomTableName() string
}
