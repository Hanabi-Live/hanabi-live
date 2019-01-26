/*
    A collection of miscellaneous functions
*/

$(document).ready(() => {
    // Detect if an element is off screen
    // e.g. if ($('#asdf').is(':offscreen'))
    jQuery.expr.filters.offscreen = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.top < 0
            || rect.bottom > window.innerHeight
            || rect.left < 0
            || rect.right > window.innerWidth;
    };
});

exports.closeAllTooltips = () => {
    // From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
    const instances = $.tooltipster.instances();
    $.each(instances, (i, instance) => {
        if (instance.status().open) {
            instance.close();
        }
    });
};

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
