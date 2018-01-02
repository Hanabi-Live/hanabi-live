package main

type Action struct {
	Type      string `json:"type"`
	Who       int    `json:"who"`
	Suit      int    `json:"suit"`
	Rank      int    `json:"rank"`
	Text      string `json:"text"`
	Target    int    `json:"target"`
	HandOrder []int  `json:"handOrder"`
	Clue      Clue   `json:"clue"`
	Giver     int    `json:"giver"`
	List      []int  `json:"list"`
	Which     Which  `json:"which"`
	Num       int    `json:"num"`
	Order     int    `json:"order"`
	Size      int    `json:"size"`
	Clues     int    `json:"clues"`
	Score     int    `json:"score"`
	Loss      bool   `json:"loss"`
}

type Which struct {
	Index int `json:"index"`
	Rank  int `json:"rank"`
	Suit  int `json:"suit"`
	Order int `json:"order"`
}
