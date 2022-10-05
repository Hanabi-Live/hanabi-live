// Sent when the user makes a new game
// (this is new functionality and not present in the vanilla Keldon server)
// "data" is empty

// Imports
const fs = require('fs-extra');
const path = require('path');

// Load the word list
const wordListLocation = path.join(__dirname, '..', 'assets', 'words.txt');
const wordList = fs.readFileSync(wordListLocation, 'utf8').toString().split('\n');

exports.step1 = (socket, data) => {
    // Generate a random table name
    const randomNumbers = [];
    const numWords = 3;
    for (let i = 0; i < numWords; i++) {
        let randomNumber;
        do {
            randomNumber = getRandomNumber(0, wordList.length - 1);
        } while (randomNumbers.indexOf(randomNumber) !== -1);
        randomNumbers.push(randomNumber);
    }
    let randomlyGeneratedName = '';
    for (let i = 0; i < numWords; i++) {
        randomlyGeneratedName += `${wordList[randomNumbers[i]]} `;
    }
    randomlyGeneratedName = randomlyGeneratedName.slice(0, -1);
    // Chop off the trailing space

    // Send it to them
    socket.emit('message', {
        type: 'name',
        resp: {
            name: randomlyGeneratedName,
        },
    });
};

function getRandomNumber(min, max) {
    // Get a random number between minNumber and maxNumber
    min = parseInt(min, 10);
    max = parseInt(max, 10);
    return Math.floor((Math.random() * (max - (min + 1))) + min);
}
