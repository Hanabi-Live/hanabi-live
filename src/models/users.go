package models

type Users struct{}

func (*Users) Insert(room string, userID int, message string) error {
	return nil
}
