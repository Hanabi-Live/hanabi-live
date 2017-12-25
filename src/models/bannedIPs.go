package models

import (
	"database/sql"
)

type BannedIPs struct{}

func (*BannedIPs) Check(ip string) (bool, error) {
	var id int
	if err := db.QueryRow(`
		SELECT id
		FROM banned_ips
		WHERE ip = ?
	`, ip).Scan(&id); err == sql.ErrNoRows {
		return false, nil
	} else if err != nil {
		return false, err
	}

	return true, nil
}
