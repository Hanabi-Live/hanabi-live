/*
    A collection of miscellaneous functions
*/

exports.playSound = (file) => {
    const audio = new Audio(`public/sounds/${file}.mp3`);
    audio.play();
};

// From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
exports.closeAllTooltips = () => {
    const instances = $.tooltipster.instances();
    $.each(instances, (i, instance) => {
        instance.close();
    });
};

// From: https://stackoverflow.com/questions/9705123/how-can-i-get-sin-cos-and-tan-to-use-degrees-instead-of-radians
exports.toRadians = angle => angle * (Math.PI / 180);
