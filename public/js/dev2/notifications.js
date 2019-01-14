/*
    The site has the ability to send (optional) notifications
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

    new Notification(`Hanabi: ${msg}`, { /* eslint-disable-line no-new */
        tag,
    });
};
