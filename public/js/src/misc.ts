/*
    A collection of miscellaneous functions
*/

// From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
export const closeAllTooltips = () => {
    const instances = $.tooltipster.instances();
    $.each(instances, (_: number, instance: any) => {
        if (instance.status().open) {
            instance.close();
        }
    });
};

// From: https://techoverflow.net/2018/03/30/copying-strings-to-the-clipboard-using-pure-javascript/
export const copyStringToClipboard = (str: string) => {
    const el = document.createElement('textarea'); // Create new element
    el.value = str; // Set the value (the string to be copied)
    el.setAttribute('readonly', ''); // Set non-editable to avoid focus
    document.body.appendChild(el);
    el.select(); // Select text inside element
    document.execCommand('copy'); // Copy text to clipboard
    document.body.removeChild(el); // Remove temporary element
};

export const getRandomNumber = (
    min: number,
    max: number,
) => Math.floor((Math.random() * (max - min + 1)) + min);

export const timerFormatter = (milliseconds: number) => {
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
