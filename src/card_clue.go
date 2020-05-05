package main

type CardClue struct {
	Type     int
	Value    int
	Positive bool
}

func (c *CardClue) Name(g *Game) string {
	name := ""
	if c.Type == clueTypeRank {
		name = string(c.Value)
	} else if c.Type == clueTypeColor {
		name = variants[g.Options.Variant].ClueColors[c.Value]
	}
	if !c.Positive {
		name = "-" + name
	}
	return name
}
