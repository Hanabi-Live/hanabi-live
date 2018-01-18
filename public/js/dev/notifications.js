/*
    Code for browser notifications
    https://developer.mozilla.org/en-US/docs/Web/API/notification
*/

exports.test = () => {
    if (!('Notification' in window)) {
        return;
    }

    if (Notification.permission !== 'default') {
        return;
    }

    Notification.requestPermission();
};

exports.send = (msg, tag) => {
    if (!('Notification' in window)) {
        return;
    }

    if (Notification.permission !== 'granted') {
        return;
    }

    /* eslint-disable no-new */
    new Notification(`Hanabi Live: ${msg}`, {
        tag,
    });
};
