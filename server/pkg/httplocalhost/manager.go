// The server also listens on a separate port that only accepts connections from the local system;
// this allows administrative tasks to be performed without having to go through a browser

package httplocalhost

import (
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/gin-gonic/gin"
)

type Manager struct {
	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher
}

func NewManager(logger *logger.Logger, models *models.Models) *Manager {
	// Get environment variables
	envVars := getEnvVars(logger)
	if envVars == nil {
		return nil
	}

	m := &Manager{
		logger:     logger,
		models:     models,
		Dispatcher: nil, // This will be filled in after this object is instantiated
	}
	go m.start(envVars)

	return m
}

type envVars struct {
	port int
}

// getEnvVars reads some specific environment variables relating to HTTP localhost configuration.
// (They were loaded from the ".env" file in "main.go".)
func getEnvVars(logger *logger.Logger) *envVars {
	portString := os.Getenv("LOCALHOST_PORT")
	var port int
	if len(portString) == 0 {
		port = 8081
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			logger.Fatalf(
				"Failed to convert the \"LOCALHOST_PORT\" environment variable of \"%v\" to an integer: %v",
				portString,
				err,
			)
		} else {
			port = v
		}
	}

	return &envVars{
		port: port,
	}
}

// start launches the HTTP localhost server, used for administrative-related tasks.
// It is meant to be run in a new goroutine.
func (m *Manager) start(envVars *envVars) {
	// Create a new Gin HTTP router
	httpRouter := gin.Default() // Has the "Logger" and "Recovery" middleware attached

	attachPathHandlers(httpRouter, m)

	// Listen only on the localhost interface
	addr := fmt.Sprintf("127.0.0.1:%v", envVars.port)

	// Create an HTTP server
	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	HTTPServerWithTimeout := &http.Server{ // nolint: exhaustivestruct
		Addr:         addr,
		Handler:      httpRouter,
		ReadTimeout:  constants.HTTPReadTimeout,
		WriteTimeout: constants.HTTPWriteTimeout,
	}

	// Start listening and serving requests (which is blocking)
	m.logger.Infof("Listening on port: %v (for localhost)", envVars.port)
	if err := HTTPServerWithTimeout.ListenAndServe(); err != nil {
		m.logger.Fatalf("ListenAndServe failed (for localhost): %v", err)
	}
	m.logger.Fatal("ListenAndServe ended prematurely (for localhost).")
}

func attachPathHandlers(httpRouter *gin.Engine, m *Manager) {
	httpRouter.POST("/ban", m.userAction)
	httpRouter.GET("/debugFunction", m.debugFunction)
	httpRouter.GET("/gracefulRestart", m.gracefulRestart)
	httpRouter.GET("/maintenance", m.maintenance)
	httpRouter.GET("/maintenanceCancel", m.maintenanceCancel)
	httpRouter.POST("/mute", m.userAction)
	httpRouter.GET("/saveTables", m.saveTables)
	httpRouter.POST("/sendWarning", m.userAction)
	httpRouter.POST("/sendError", m.userAction)
	httpRouter.GET("/shutdown", m.shutdown)
	httpRouter.GET("/shutdownCancel", m.shutdownCancel)
	httpRouter.GET("/timeLeft", m.timeLeft)
	httpRouter.GET("/uptime", m.uptime)
	httpRouter.GET("/version", m.version)
}
