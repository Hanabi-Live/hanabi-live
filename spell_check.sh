# Spell check every file using CSpell.
# We use no-progress and no-summary because we want to only output errors
npx cspell --no-progress --no-summary

# Check for orphaned words.
bash "$DIR/check-orphaned-words.sh"
