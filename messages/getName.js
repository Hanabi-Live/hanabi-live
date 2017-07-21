'use strict';

// Sent when the user makes a new game
// (this is new functionality and not present in the vanilla Keldon server)
// "data" is empty

// Imports
const fs   = require('fs-extra');
const path = require('path');

// Load the word list
let wordListLocation = path.join(__dirname, '..', 'assets', 'words.txt');
let wordList = fs.readFileSync(wordListLocation, 'utf8').toString().split('\n');

exports.step1 = function(socket, data) {
    // Generate a random table name
    let randomNumbers = [];
    let numWords = 3;
    for (let i = 0; i < numWords; i++) {
        while (true) {
            let randomNumber = getRandomNumber(0, wordList.length - 1);
            if (randomNumbers.indexOf(randomNumber) === -1) {
                randomNumbers.push(randomNumber);
                break;
            }
        }
    }
    let randomlyGeneratedName = '';
    for (let i = 0; i < numWords; i++) {
        randomlyGeneratedName += wordList[randomNumbers[i]] + ' ';
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

function getRandomNumber(minNumber, maxNumber) {
    // Get a random number between minNumber and maxNumber
    return Math.floor(Math.random() * (parseInt(maxNumber) - parseInt(minNumber) + 1) + parseInt(minNumber));
}
