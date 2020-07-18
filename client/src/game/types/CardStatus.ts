enum CardStatus {
  // Represents that the card needs to be played at some point in the future in order to get the
  // maximum score
  NeedsToBePlayed,
  // Represents that a card simultaneously needs to be played at some point in the future and is
  // critical (meaning that there is only one copy of this card left)
  Critical,
  // Represents that this card does not need to be played at some point in the future in order to
  // get the maximum score
  Trash,
}
export default CardStatus;
