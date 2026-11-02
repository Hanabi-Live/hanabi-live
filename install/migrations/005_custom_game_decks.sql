CREATE TABLE game_custom_decks (
    game_id integer PRIMARY KEY REFERENCES games (id) ON DELETE CASCADE,
    deck bytea NOT NULL CHECK (
        octet_length(deck) BETWEEN 2 AND 61
        AND get_byte(deck, 0) = 128 + octet_length(deck) - 1
    )
);
