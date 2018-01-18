/*
    A collection of miscellaneous functions
*/

exports.closeAllTooltips = () => {
    // From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
    const instances = $.tooltipster.instances();
    $.each(instances, (i, instance) => {
        instance.close();
    });
};

exports.playSound = (file) => {
    const audio = new Audio(`public/sounds/${file}.mp3`);
    audio.play();
};
