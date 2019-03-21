/*
    A collection of miscellaneous functions
*/

$(document).ready(() => {
    // Detect if an element is off screen
    // e.g. if ($('#asdf').is(':offscreen'))
    jQuery.expr.filters.offscreen = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.top < 1 // Above the top
            || rect.bottom > window.innerHeight - 5 // Below the bottom
            || rect.left < 1 // Left of the left edge
            || rect.right > window.innerWidth - 5; // Right of the right edge
        // We modify the top/left by 1 and the bottom/right by 5
        // to prevent scroll bars from appearing
    };
});

exports.timerFormatter = (milliseconds) => {
    if (!milliseconds) {
        milliseconds = 0;
    }
    const time = new Date();
    time.setHours(0, 0, 0, milliseconds);
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();
    const secondsFormatted = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${secondsFormatted}`;
};

// From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
exports.closeAllTooltips = () => {
    const instances = $.tooltipster.instances();
    $.each(instances, (i, instance) => {
        if (instance.status().open) {
            instance.close();
        }
    });
};

// From: https://techoverflow.net/2018/03/30/copying-strings-to-the-clipboard-using-pure-javascript/
exports.copyStringToClipboard = (str) => {
    // Create new element
    const el = document.createElement('textarea');
    // Set value (string to be copied)
    el.value = str;
    // Set non-editable to avoid focus and move outside of view
    el.setAttribute('readonly', '');
    el.style = { position: 'absolute', left: '-9999px' };
    document.body.appendChild(el);
    // Select text inside element
    el.select();
    // Copy text to clipboard
    document.execCommand('copy');
    // Remove temporary element
    document.body.removeChild(el);
};
