/*
    The navigation bar at the top of the lobby
*/

export const show = (target) => {
    const navTypes = [
        'games',
        'pregame',
        'history',
        'history-details',
    ];
    for (const navType of navTypes) {
        $(`#nav-buttons-${navType}`).hide();
    }
    if (target !== 'nothing') {
        $(`#nav-buttons-${target}`).show();
    }
};

export const signOut = () => {
    localStorage.removeItem('hanabiuser');
    localStorage.removeItem('hanabipass');
    window.location.reload();
};
