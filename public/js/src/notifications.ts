/*
    The site has the ability to send (optional) notifications
*/

export const test = () => {
    if (!('Notification' in window)) {
        return;
    }
    if (Notification.permission !== 'default') {
        return;
    }

    Notification.requestPermission();
};

export const send = (msg: string, tag: any) => {
    if (!('Notification' in window)) {
        return;
    }
    if (Notification.permission !== 'granted') {
        return;
    }

    new Notification(`Hanabi Live: ${msg}`, { /* eslint-disable-line no-new */
        tag,
    });
};
