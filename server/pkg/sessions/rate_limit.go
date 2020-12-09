package sessions

import (
	"context"
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

func rateLimitIncomingMsg(ctx context.Context, m *Manager, s *session) {
	// Validate that the user is not attempting to flood the server
	// Algorithm from: http://stackoverflow.com/questions/667508
	now := time.Now()
	timePassed := now.Sub(s.rateLimitLastCheck).Seconds()
	s.rateLimitLastCheck = now

	newRateLimitAllowance := s.rateLimitAllowance + timePassed*incomingMsgRateAmount
	if newRateLimitAllowance > incomingMsgRateAmount {
		newRateLimitAllowance = incomingMsgRateAmount
	}

	if newRateLimitAllowance < 1 {
		// They are flooding, so automatically ban them
		m.logger.Warnf(
			"%v triggered rate-limiting; banning them.",
			util.PrintUserCapitalized(s.userID, s.username),
		)

		if err := ban(ctx, m, s); err != nil {
			m.logger.Errorf(
				"Failed to ban %v from IP address \"%v\": %v",
				util.PrintUser(s.userID, s.username),
				s.ip,
				err,
			)
		} else {
			m.logger.Infof(
				"Successfully banned %v from IP address: %v",
				util.PrintUser(s.userID, s.username),
				s.ip,
			)
		}
		return
	}

	newRateLimitAllowance--
	s.rateLimitAllowance = newRateLimitAllowance
}

func ban(ctx context.Context, m *Manager, s *session) error {
	// Disconnect their session
	m.DeleteSession(s)

	// Check to see if this IP is already banned
	if banned, err := m.models.BannedIPs.Check(ctx, s.ip); err != nil {
		return fmt.Errorf("failed to check to see if the IP \"%v\" is banned: %w", s.ip, err)
	} else if banned {
		return nil
	}

	// Insert a new row in the database for this IP
	if err := m.models.BannedIPs.Insert(ctx, s.ip, s.userID); err != nil {
		return fmt.Errorf("failed to insert the banned IP row: %w", err)
	}

	return nil
}
