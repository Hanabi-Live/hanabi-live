package main

import (
	"errors"
	"net/http"

	"github.com/Hanabi-Live/hanabi-live/logger"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

type APIIdentityTokenResponse struct {
	Username  string `json:"username"`
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"`
}

type APIIdentityLookupResponse struct {
	Username string `json:"username"`
}

func apiIdentityTokenGet(c *gin.Context) {
	if apiCheckIPBanned(c) {
		return
	}

	userID, username, ok := apiIdentityGetAuthenticatedUser(c)
	if !ok {
		return
	}

	row, token, err := identityTokenRegenerate(userID)
	if err != nil {
		logger.Error("Failed to regenerate identity token for user \"" + username + "\": " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": http.StatusText(http.StatusInternalServerError)})
		return
	}

	c.JSON(http.StatusOK, APIIdentityTokenResponse{
		Username:  username,
		Token:     token,
		ExpiresAt: row.ExpiresAt.UTC().Format(http.TimeFormat),
	})
}

func apiIdentityTokenPost(c *gin.Context) {
	if apiCheckIPBanned(c) {
		return
	}

	userID, username, ok := apiIdentityGetAuthenticatedUser(c)
	if !ok {
		return
	}

	row, token, err := identityTokenRegenerate(userID)
	if err != nil {
		logger.Error("Failed to regenerate identity token for user \"" + username + "\": " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": http.StatusText(http.StatusInternalServerError)})
		return
	}

	c.JSON(http.StatusOK, APIIdentityTokenResponse{
		Username:  username,
		Token:     token,
		ExpiresAt: row.ExpiresAt.UTC().Format(http.TimeFormat),
	})
}

func apiIdentityLookup(c *gin.Context) {
	if apiCheckIPBanned(c) {
		return
	}

	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing identity token."})
		return
	}

	tokenHash, err := identityTokenHash(token)
	if err != nil {
		logger.Error("Failed to hash identity token: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": http.StatusText(http.StatusInternalServerError)})
		return
	}

	exists, username, expiresAt, err := models.UserIdentityTokens.GetUsernameByTokenHash(tokenHash)
	if err != nil {
		logger.Error("Failed to look up identity token: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": http.StatusText(http.StatusInternalServerError)})
		return
	}
	if !exists || identityTokenIsExpired(expiresAt) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Identity token not found."})
		return
	}

	c.JSON(http.StatusOK, APIIdentityLookupResponse{
		Username: username,
	})
}

func apiIdentityGetAuthenticatedUser(c *gin.Context) (int, string, bool) {
	session := gsessions.Default(c)
	v := session.Get("userID")
	if v == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "You must be logged in."})
		return 0, "", false
	}

	userID, ok := v.(int)
	if !ok {
		logger.Error("Failed to parse the user ID from the HTTP session cookie.")
		c.JSON(http.StatusInternalServerError, gin.H{"error": http.StatusText(http.StatusInternalServerError)})
		return 0, "", false
	}

	username, err := models.Users.GetUsername(userID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "You must be logged in."})
		return 0, "", false
	} else if err != nil {
		logger.Error("Failed to get username for authenticated identity API user: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": http.StatusText(http.StatusInternalServerError)})
		return 0, "", false
	}

	return userID, username, true
}
