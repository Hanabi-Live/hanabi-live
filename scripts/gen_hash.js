// Includes
const prompt = require('prompt');
const sha256 = require('./sha256');

// Prompt for input
prompt.get([{
    name: 'password',
    required: true,
    hidden: true,
}], (err, result) => {
    const hash = sha256(result.password);
    console.log(hash);
});
