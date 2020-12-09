package httpmain

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/didip/tollbooth/v6"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-contrib/gzip"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

const (
	// The name supplied to the Gin session middleware can be any arbitrary string
	HTTPSessionName    = "hanabi.sid"
	HTTPSessionTimeout = 60 * 60 * 24 * 365 // 1 year in seconds
)

var (
	domain       string
	useTLS       bool
	GATrackingID string
	webpackPort  int

	// HTTPClientWithTimeout is used for sending web requests to external sites,
	// which is used in various middleware
	// We don't want to use the default http.Client because it has no default timeout set
	HTTPClientWithTimeout = &http.Client{ // nolint: exhaustivestruct
		Timeout: constants.HTTPWriteTimeout,
	}
)

func Start() {
	envVariables := readEnvVariables()

	// Create a new Gin HTTP router
	httpRouter := gin.Default()                        // Has the "Logger" and "Recovery" middleware attached
	httpRouter.Use(gzip.Gzip(gzip.DefaultCompression)) // Add GZip compression middleware

	// Attach rate-limiting middleware from Tollbooth
	// The limiter works per path request,
	// meaning that a user can only request one specific path every X seconds
	// Thus, this does not impact the ability of a user to download CSS and image files all at once
	// (However, we do not want to use the rate-limiter in development, since we might have multiple
	// tabs open that are automatically-refreshing with webpack-dev-server)
	//
	// The rate limiter is commented out for now to prevent bugs with Apple browsers
	// Apparently it sets an empty "X-Rate-Limit-Request-Forwarded-For:" header and that causes
	// problems
	/*
		if !isDev {
			limiter := tollbooth.NewLimiter(2, nil) // Limit each user to 2 requests per second
			limiter.SetMessage(http.StatusText(http.StatusTooManyRequests))
			limiterMiddleware := httpLimitHandler(limiter)
			httpRouter.Use(limiterMiddleware)
		}
	*/

	// Create a session store
	httpSessionStore := cookie.NewStore([]byte(sessionSecret))
	options := gsessions.Options{ // nolint: exhaustivestruct
		Path:   "/",                // The cookie should apply to the entire domain
		MaxAge: HTTPSessionTimeout, // In seconds
	}
	if !isDev {
		// Bind the cookie to this specific domain for security purposes
		options.Domain = domain

		// Only send the cookie over HTTPS:
		// https://www.owasp.org/index.php/Testing_for_cookies_attributes_(OTG-SESS-002)
		options.Secure = useTLS

		// Mitigate XSS attacks:
		// https://www.owasp.org/index.php/HttpOnly
		options.HttpOnly = true

		// Mitigate CSRF attacks:
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#SameSite_cookies
		options.SameSite = http.SameSiteStrictMode
	}
	httpSessionStore.Options(options)

	// Attach the sessions middleware
	httpRouter.Use(gsessions.Sessions(HTTPSessionName, httpSessionStore))

	// Initialize Google Analytics
	if len(GATrackingID) > 0 {
		httpRouter.Use(httpGoogleAnalytics) // Attach the Google Analytics middleware
	}

	// Attach the Sentry middleware
	if usingSentry {
		httpRouter.Use(sentrygin.New(sentrygin.Options{ // nolint: exhaustivestruct
			// https://github.com/getsentry/sentry-go/blob/master/gin/sentrygin.go
			Repanic: true, // Recommended as per the documentation
			Timeout: HTTPWriteTimeout,
		}))
		httpRouter.Use(sentryHTTPAttachMetadataMiddleware)
	}

	attachPathHandlers(httpRouter)

	if useTLS {
		// Create the LetsEncrypt directory structure
		// (CertBot will look for data in "/.well-known/acme-challenge/####")
		letsEncryptPath := path.Join(projectPath, "letsencrypt")
		if _, err := os.Stat(letsEncryptPath); os.IsNotExist(err) {
			if err := os.MkdirAll(letsEncryptPath, 0755); err != nil {
				hLog.Fatal(
					"Failed to create the \"%v\" directory: %v",
					letsEncryptPath,
					err,
				)
			}
		}

		wellKnownPath := path.Join(letsEncryptPath, ".well-known")
		if _, err := os.Stat(wellKnownPath); os.IsNotExist(err) {
			if err := os.MkdirAll(wellKnownPath, 0755); err != nil {
				hLog.Fatalf("Failed to create the \"%v\" directory: %v", wellKnownPath, err)
			}
		}

		acmeChallengePath := path.Join(wellKnownPath, "acme-challenge")
		if _, err := os.Stat(acmeChallengePath); os.IsNotExist(err) {
			if err := os.MkdirAll(acmeChallengePath, 0755); err != nil {
				hLog.Fatalf(
					"Failed to create the \"%v\" directory: %v",
					acmeChallengePath,
					err,
				)
			}
		}

		// We want all HTTP requests to be redirected to HTTPS
		// (but make an exception for Let's Encrypt)
		// The Gin router is using the default serve mux,
		// so we need to create a new fresh one for the HTTP handler
		HTTPServeMux := http.NewServeMux()
		HTTPServeMux.Handle(
			"/.well-known/acme-challenge/",
			http.FileServer(http.FileSystem(http.Dir(letsEncryptPath))),
		)
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
				ReadTimeout:  HTTPReadTimeout,
				WriteTimeout: HTTPWriteTimeout,
			}
			if err := HTTPRedirectServerWithTimeout.ListenAndServe(); err != nil {
				hLog.Fatalf("ListenAndServe failed to start on port 80: %v", err)
			}
			hLog.Fatal("ListenAndServe ended for port 80.")
		}()
	}

	// Start listening and serving requests (which is blocking)
	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	hLog.Infof("Listening on port: %v", port)
	HTTPServerWithTimeout := &http.Server{ // nolint: exhaustivestruct
		Addr:         fmt.Sprintf("0.0.0.0:%v", port), // Listen on all IP addresses
		Handler:      httpRouter,
		ReadTimeout:  HTTPReadTimeout,
		WriteTimeout: HTTPWriteTimeout,
	}
	if useTLS {
		if err := HTTPServerWithTimeout.ListenAndServeTLS(tlsCertFile, tlsKeyFile); err != nil {
			hLog.Fatalf("ListenAndServeTLS failed: %v", err)
		}
		hLog.Fatal("ListenAndServeTLS ended prematurely.")
	} else {
		if err := HTTPServerWithTimeout.ListenAndServe(); err != nil {
			hLog.Fatalf("ListenAndServe failed: %v", err)
		}
		hLog.Fatal("ListenAndServe ended prematurely.")
	}
}

// readEnvVariables reads some specific environment variables relating to HTTP configuration
// (they were loaded from the ".env" file in "main.go")
func readEnvVariables() {
	domain = os.Getenv("DOMAIN")
	if len(domain) == 0 {
		hLog.Info("The \"DOMAIN\" environment variable is blank; aborting HTTP initialization.")
		return
	}

	sessionSecret := os.Getenv("SESSION_SECRET")
	if len(sessionSecret) == 0 {
		hLog.Info("The \"SESSION_SECRET\" environment variable is blank; aborting HTTP initialization.")
		return
	}

	portString := os.Getenv("PORT")
	var port int
	if len(portString) == 0 {
		port = 80
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			hLog.Fatalf(
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
	if len(tlsCertFile) != 0 && len(tlsKeyFile) != 0 {
		useTLS = true
		if port == 80 {
			port = 443
		}
	}

	GATrackingID = os.Getenv("GA_TRACKING_ID")

	webpackPortString := os.Getenv("WEBPACK_DEV_SERVER_PORT")
	if len(webpackPortString) == 0 {
		webpackPort = 8080
	} else {
		if v, err := strconv.Atoi(webpackPortString); err != nil {
			hLog.Fatalf(
				"Failed to convert the \"WEBPACK_DEV_SERVER_PORT\" environment variable of \"%v\" to an integer: %v",
				webpackPortString,
				err,
			)
		} else {
			webpackPort = v
		}
	}
}

func attachMiddleware(httpRouter *gin.Engine) {

}

func attachPathHandlers(httpRouter *gin.Engine) {
	// Path handlers (for cookies and logging in)
	httpRouter.POST("/login", httpLogin)
	httpRouter.GET("/logout", httpLogout)
	httpRouter.GET("/test-cookie", httpTestCookie)
	httpRouter.GET("/ws", httpWS)

	// Path handlers (for the main website)
	httpRouter.GET("/", httpMain)
	httpRouter.GET("/lobby", httpMain)
	httpRouter.GET("/pre-game", httpMain)
	httpRouter.GET("/pre-game/:tableID", httpMain)
	httpRouter.GET("/game", httpMain)
	httpRouter.GET("/game/:tableID", httpMain)
	httpRouter.GET("/replay", httpMain)
	httpRouter.GET("/replay/:databaseID", httpMain)
	httpRouter.GET("/replay/:databaseID/:turnID", httpMain) // Deprecated; needed for older links to work
	httpRouter.GET("/shared-replay", httpMain)
	httpRouter.GET("/shared-replay/:databaseID", httpMain)
	httpRouter.GET("/shared-replay/:databaseID/:turnID", httpMain) // Deprecated; needed for older links to work
	httpRouter.GET("/create-table", httpMain)

	// Path handlers for other URLs
	httpRouter.GET("/scores", httpScores)
	httpRouter.GET("/scores/:player1", httpScores)
	httpRouter.GET("/profile", httpScores) // "/profile" is an alias for "/scores"
	httpRouter.GET("/profile/:player1", httpScores)
	httpRouter.GET("/history", httpHistory)
	httpRouter.GET("/history/:player1", httpHistory)
	httpRouter.GET("/history/:player1/:player2", httpHistory)
	httpRouter.GET("/history/:player1/:player2/:player3", httpHistory)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4", httpHistory)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4/:player5", httpHistory)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4/:player5/:player6", httpHistory)
	httpRouter.GET("/missing-scores", httpMissingScores)
	httpRouter.GET("/missing-scores/:player1", httpMissingScores)
	httpRouter.GET("/missing-scores/:player1/:numPlayers", httpMissingScores)
	httpRouter.GET("/shared-missing-scores", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4/:player5", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4/:player5/:player6", httpSharedMissingScores)
	httpRouter.GET("/tags", httpTags)
	httpRouter.GET("/tags/:player1", httpTags)
	httpRouter.GET("/seed", httpSeed)
	httpRouter.GET("/seed/:seed", httpSeed) // Display all games played on a given seed
	httpRouter.GET("/stats", httpStats)
	httpRouter.GET("/variant", httpVariant)
	httpRouter.GET("/variant/:id", httpVariant)
	httpRouter.GET("/tag", httpTag)
	httpRouter.GET("/tag/:tag", httpTag)
	httpRouter.GET("/videos", httpVideos)
	httpRouter.GET("/password-reset", httpPasswordReset)
	httpRouter.POST("/password-reset", httpPasswordResetPost)

	// Path handlers for bots, developers, researchers, etc.
	httpRouter.GET("/export", httpExport)
	httpRouter.GET("/export/:databaseID", httpExport)

	// Other
	httpRouter.Static("/public", path.Join(projectPath, "public"))
	httpRouter.StaticFile("/favicon.ico", path.Join(projectPath, "public", "img", "favicon.ico"))
}

// From: https://github.com/didip/tollbooth_gin/blob/master/tollbooth_gin.go
func httpLimitHandler(lmt *limiter.Limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		httpError := tollbooth.LimitByRequest(lmt, c.Writer, c.Request)
		if httpError != nil {
			c.Data(httpError.StatusCode, lmt.GetMessageContentType(), []byte(httpError.Message))
			c.Abort()
		} else {
			c.Next()
		}
	}
}
