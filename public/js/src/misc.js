/*
    A collection of miscellaneous functions
*/

export const timerFormatter = (milliseconds) => {
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
export const closeAllTooltips = () => {
    const instances = $.tooltipster.instances();
    $.each(instances, (i, instance) => {
        if (instance.status().open) {
            instance.close();
        }
    });
};

// From: https://techoverflow.net/2018/03/30/copying-strings-to-the-clipboard-using-pure-javascript/
export const copyStringToClipboard = (str) => {
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
