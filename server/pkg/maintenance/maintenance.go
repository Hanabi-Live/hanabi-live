package main

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Initialize logging (in "logger.go")
	hLogger := logger.New(true)
	defer hLogger.Sync()

	// Get the current working directory
	// (we do not use "os.Executable()" because that fails when doing "go run")
	var cwd string
	if v, err := os.Getwd(); err != nil {
		hLogger.Fatalf("Failed to get the current working directory: %v", err)
	} else {
		cwd = v
	}

	// Get the parent directory
	// https://stackoverflow.com/questions/48570228/get-the-parent-path
	// We use "filepath.Dir()" instead of "path.Dir()" because it is platform independent
	projectPath := filepath.Dir(cwd)

	// Check to see if the ".env" file exists
	envPath := path.Join(projectPath, ".env")
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		hLogger.Fatalf(
			"The \"%v\" file does not exist. Did you run the \"install_dependencies.sh\" script before running the server? This file should automatically be created when running this script.",
			envPath,
		)
	}

	// Load the ".env" file, which contains environment variables with secret values
	if err := godotenv.Load(envPath); err != nil {
		hLogger.Fatalf("Failed to load the \".env\" file: %v", err)
	}

	// Read some configuration values from environment variables
	portString := os.Getenv("PORT")
	var port int
	if len(portString) == 0 {
		port = 80
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			hLogger.Fatalf(
				"Failed to convert the \"PORT\" environment variable of \"%v\" to an integer: %v",
				portString,
				err,
			)
		} else {
			port = v
		}
	}
	tlsCertFile := os.Getenv("TLS_CERT_FILE")
	tlsKeyFile := os.Getenv("TLS_KEY_FILE")
	useTLS := false
	if len(tlsCertFile) != 0 && len(tlsKeyFile) != 0 {
		useTLS = true
		if port == 80 {
			port = 443
		}
	}

	// Create a new Gin HTTP router
	gin.SetMode(gin.ReleaseMode)                       // Comment this out to debug HTTP stuff
	httpRouter := gin.Default()                        // Has the "Logger" and "Recovery" middleware attached
	httpRouter.Use(gzip.Gzip(gzip.DefaultCompression)) // Add GZip compression middleware
	httpRouter.StaticFile("/", path.Join(projectPath, "maintenance", "index.html"))
	httpRouter.Static("/public", path.Join(projectPath, "public"))
	httpRouter.StaticFile("/favicon.ico", path.Join(projectPath, "public", "img", "favicon.ico"))

	if useTLS {
		// We want all HTTP requests to be redirected to HTTPS
		// The Gin router is using the default serve mux,
		// so we need to create a new fresh one for the HTTP handler
		HTTPServeMux := http.NewServeMux()
		HTTPServeMux.Handle(
			"/",
			http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				http.Redirect(
					w,
					req,
					"https://"+req.Host+req.URL.String(),
					http.StatusMovedPermanently,
				)
			}),
		)

		// ListenAndServe is blocking, so we need to start listening in a new goroutine
		go func() {
			// We need to create a new http.Server because the default one has no timeouts
			// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
			HTTPRedirectServerWithTimeout := &http.Server{ // nolint: exhaustivestruct
				Addr:         "0.0.0.0:80", // Listen on all IP addresses
				Handler:      HTTPServeMux,
				ReadTimeout:  constants.HTTPReadTimeout,
				WriteTimeout: constants.HTTPWriteTimeout,
			}
			if err := HTTPRedirectServerWithTimeout.ListenAndServe(); err != nil {
				hLogger.Fatalf("ListenAndServe failed to start on port 80: %v", err)
			}
			hLogger.Fatal("ListenAndServe ended for port 80.")
		}()
	}

	// Redirect mostly everything to the main maintenance page, e.g. "/"
	httpRouter.Use(func(c *gin.Context) {
		path := c.Request.URL.Path
		if path != "/" &&
			!strings.HasPrefix(path, "/public/") {

			c.Redirect(http.StatusFound, "/")
		}
	})

	// Start listening and serving requests (which is blocking)
	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	hLogger.Infof("Listening on port: %v", port)
	HTTPServerWithTimeout := &http.Server{ // nolint: exhaustivestruct
		Addr:         "0.0.0.0:" + strconv.Itoa(port), // Listen on all IP addresses
		Handler:      httpRouter,
		ReadTimeout:  constants.HTTPReadTimeout,
		WriteTimeout: constants.HTTPWriteTimeout,
	}
	if useTLS {
		if err := HTTPServerWithTimeout.ListenAndServeTLS(tlsCertFile, tlsKeyFile); err != nil {
			hLogger.Fatalf("ListenAndServeTLS failed: %v", err)
		}
		hLogger.Fatal("ListenAndServeTLS ended prematurely.")
	} else {
		if err := HTTPServerWithTimeout.ListenAndServe(); err != nil {
			hLogger.Fatalf("ListenAndServe failed: %v", err)
		}
		hLogger.Fatal("ListenAndServe ended prematurely.")
	}
}
