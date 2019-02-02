// Imports
const Button = require('./button');

const ClueRecipientButton = function ClueRecipientButton(config) {
    Button.call(this, config);
    this.targetIndex = config.targetIndex;
};

Kinetic.Util.extend(ClueRecipientButton, Button);

module.exports = ClueRecipientButton;
