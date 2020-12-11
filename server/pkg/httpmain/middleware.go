package httpmain

import (
	"net/http"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	sentrygin "github.com/getsentry/sentry-go/gin"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

const (
	// The name supplied to the Gin session middleware can be any arbitrary string.
	HTTPSessionName    = "hanabi.sid"
	HTTPSessionTimeout = 60 * 60 * 24 * 365 // 1 year in seconds
)

func attachMiddleware(httpRouter *gin.Engine, m *Manager, envVars *envVars) {
	if !m.isDev {
		attachMiddlewareTollbooth(httpRouter)
	}

	attachMiddlewareSessionStore(httpRouter, m, envVars)

	// Initialize Google Analytics
	if len(m.gaTrackingID) > 0 {
		httpRouter.Use(m.googleAnalyticsMiddleware)
	}

	// Attach the Sentry middleware
	if m.usingSentry {
		attachMiddlewareSentry(httpRouter, m)
	}
}

func attachMiddlewareTollbooth(httpRouter *gin.Engine) {
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
	// https://github.com/didip/tollbooth/issues/92
	/*
		limiter := tollbooth.NewLimiter(2, nil) // Limit each user to 2 requests per second
		limiter.SetMessage(http.StatusText(http.StatusTooManyRequests))
		limiterMiddleware := limitHandler(limiter)
		httpRouter.Use(limiterMiddleware)
	*/
}

/*
// From: https://github.com/didip/tollbooth_gin/blob/master/tollbooth_gin.go
func limitHandler(lmt *limiter.Limiter) gin.HandlerFunc {
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
*/

func attachMiddlewareSessionStore(httpRouter *gin.Engine, m *Manager, envVars *envVars) {
	// Create a session store to handle cookies
	sessionStore := cookie.NewStore([]byte(envVars.sessionSecret))

	// Configure the options
	sessionsOptions := gsessions.Options{ // nolint: exhaustivestruct
		Path:   "/",                // The cookie should apply to the entire domain
		MaxAge: HTTPSessionTimeout, // In seconds
	}
	if !m.isDev {
		// Bind the cookie to this specific domain for security purposes
		sessionsOptions.Domain = m.Domain

		// Only send the cookie over HTTPS:
		// https://www.owasp.org/index.php/Testing_for_cookies_attributes_(OTG-SESS-002)
		sessionsOptions.Secure = m.UseTLS

		// Mitigate XSS attacks:
		// https://www.owasp.org/index.php/HttpOnly
		sessionsOptions.HttpOnly = true

		// Mitigate CSRF attacks:
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#SameSite_cookies
		sessionsOptions.SameSite = http.SameSiteStrictMode
	}
	sessionStore.Options(sessionsOptions)

	// Attach the sessions middleware
	httpRouter.Use(gsessions.Sessions(HTTPSessionName, sessionStore))
}

func attachMiddlewareSentry(httpRouter *gin.Engine, m *Manager) {
	httpRouter.Use(sentrygin.New(sentrygin.Options{ // nolint: exhaustivestruct
		// https://github.com/getsentry/sentry-go/blob/master/gin/sentrygin.go
		Repanic: true, // Recommended as per the documentation
		Timeout: constants.HTTPWriteTimeout,
	}))
	httpRouter.Use(m.sentryMiddleware)
}
