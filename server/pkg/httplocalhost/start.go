// The server also listens on a separate port that only accepts connections from the local system;
// this allows administrative tasks to be performed without having to go through a browser

package httplocalhost

import (
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/gin-gonic/gin"
)

var (
	hLogger *logger.Logger
	hModels *models.Models
)

// Start launches the HTTP localhost server, used for administrative-related tasks
// It is meant to be run in a new goroutine
func Start(logger *logger.Logger, models *models.Models) {
	// Store references on global variables for convenience
	hLogger = logger
	hModels = models

	envVariables := readEnvVariables()

	// Create a new Gin HTTP router
	httpRouter := gin.Default() // Has the "Logger" and "Recovery" middleware attached

	attachPathHandlers(httpRouter)

	// Listen only on the localhost interface
	addr := fmt.Sprintf("127.0.0.1:%v", envVariables.port)

	// Create the HTTP server and start it
	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	hLogger.Infof("Listening on port: %v (for localhost)", envVariables.port)
	HTTPServerWithTimeout := &http.Server{ // nolint: exhaustivestruct
		Addr:         addr,
		Handler:      httpRouter,
		ReadTimeout:  constants.HTTPReadTimeout,
		WriteTimeout: constants.HTTPWriteTimeout,
	}
	if err := HTTPServerWithTimeout.ListenAndServe(); err != nil {
		hLogger.Fatalf("ListenAndServe failed (for localhost): %v", err)
	}
	hLogger.Fatal("ListenAndServe ended prematurely (for localhost).")
}

type envVariables struct {
	port int
}

// readEnvVariables reads some specific environment variables relating to HTTP configuration
// (they were loaded from the ".env" file in "main.go")
func readEnvVariables() *envVariables {
	portString := os.Getenv("LOCALHOST_PORT")
	var port int
	if len(portString) == 0 {
		port = 8081
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			hLogger.Fatalf(
				"Failed to convert the \"LOCALHOST_PORT\" environment variable of \"%v\" to an integer: %v",
				portString,
				err,
			)
		} else {
			port = v
		}
	}

	return &EnvVariables{
		port: port,
	}
}

func attachPathHandlers(httpRouter *gin.Engine) {
	httpRouter.POST("/ban", userAction)
	httpRouter.GET("/cancel", cancel)
	httpRouter.GET("/clearEmptyTables", clearEmptyTables)
	httpRouter.GET("/debugFunction", debugFunction)
	httpRouter.GET("/getLongTables", getLongTables)
	httpRouter.GET("/maintenance", maintenance)
	httpRouter.POST("/mute", userAction)
	httpRouter.GET("/print", print)
	httpRouter.GET("/gracefulRestart", gracefulRestart)
	httpRouter.GET("/saveTables", saveTables)
	httpRouter.POST("/sendWarning", userAction)
	httpRouter.POST("/sendError", userAction)
	httpRouter.GET("/shutdown", shutdown)
	httpRouter.GET("/terminate", terminate)
	httpRouter.GET("/timeLeft", timeLeft)
	httpRouter.GET("/uptime", uptime)
	httpRouter.GET("/version", version)
	httpRouter.GET("/unmaintenance", unmaintenance)
}
