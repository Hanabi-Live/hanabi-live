// Includes
const prompt = require('prompt');
const sha256 = require('./sha256');

// Constants
const prefix = 'Hanabi password ';

// Prompt for input
prompt.get([{
    name: 'password',
    required: true,
    //hidden: true,
}], (err, result) => {
    const hash = sha256(prefix + result.password);
    console.log(hash);
});
