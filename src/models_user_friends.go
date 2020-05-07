package main

type UserFriends struct{}

func (*UserFriends) Insert(userID int, friendID int) error {
	return nil
}

func (*UserFriends) GetAll(userID int) error {
	return nil
}
