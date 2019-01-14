/*
    A collection of miscellaneous functions
*/

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
