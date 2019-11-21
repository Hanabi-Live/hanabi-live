// Imports
import Character from './Character';
import charactersJSON from './data/characters.json';

export default () => {
    const CHARACTERS: Map<string, Character> = new Map();

    for (const [characterName, characterJSON] of Object.entries(charactersJSON)) {
        // Validate the name
        const name: string = characterName;
        if (name === '') {
            throw new Error('There is a character with an empty name in the "characters.json" file.');
        }

        // Validate the ID
        const id: number = characterJSON.id;
        if (id < 0) {
            throw new Error(`The "${name}" character has an invalid ID.`);
        }

        // Validate the description
        const description: string = characterJSON.description || '';
        if (description === '') {
            throw new Error(`The "${characterName}" character does not have a description.`);
        }

        // Validate the emoji
        const emoji: string = characterJSON.emoji || '';
        if (emoji === '') {
            throw new Error(`The "${characterName}" character does not have an emoji.`);
        }

        // Add it to the map
        const character: Character = {
            name,
            id,
            description,
            emoji,
        };
        CHARACTERS.set(characterName, character);
    }

    return CHARACTERS;
};
