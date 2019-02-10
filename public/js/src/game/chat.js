/*
    In-game chat
*/

// Imports
const globals = require('../globals');

$(document).ready(() => {
    initDraggableDiv(document.getElementById('game-chat-modal'));
    initResizableDiv('.resizable');

    $('#game-chat-modal-header-close').click(() => {
        hide();
    });
});

exports.toggle = () => {
    const modal = $('#game-chat-modal');
    if (modal.is(':visible')) {
        hide();
    } else {
        show();
    }
};

const show = () => {
    const modal = $('#game-chat-modal');
    modal.fadeIn(globals.fadeTime);

    // Check to see if there are any uncurrently unread chat messages
    if (globals.chatUnread !== 0) {
        // If the user is opening the chat, then we assume that all of the chat messages are read
        globals.chatUnread = 0;
        globals.conn.send('chatRead'); // We need to notify the server that we have read everything
        globals.ui.updateChatLabel(); // Reset the "Chat" UI button back to normal
    }

    // If there is a stored size / position for the chat box, set that
    let putChatInDefaultPosition = true;
    const width = localStorage.getItem('chatWindowWidth');
    const height = localStorage.getItem('chatWindowHeight');
    const top = localStorage.getItem('chatWindowTop');
    const left = localStorage.getItem('chatWindowLeft');
    if (
        width !== null && width !== ''
        && height !== null && height !== ''
        && top !== null && top !== ''
        && left !== null && left !== ''
    ) {
        putChatInDefaultPosition = false;
        modal.css('width', width);
        modal.css('height', height);
        modal.css('top', top);
        modal.css('left', left);
    }

    // Just in case, reset the size and position if the stored location puts the chat box offscreen
    if (modal.is(':offscreen')) {
        putChatInDefaultPosition = true;
    }

    if (putChatInDefaultPosition) {
        modal.css('width', '20%');
        modal.css('height', '50%');
        modal.css('top', '1%');
        modal.css('left', '79%');
    }

    // Scroll to the bottom of the chat
    const chat = document.getElementById('game-chat-text');
    chat.scrollTop = chat.scrollHeight;

    $('#game-chat-input').focus();
};
exports.show = show;

const hide = () => {
    $('#game-chat-modal').fadeOut(globals.fadeTime);
};
exports.hide = hide;

/*
    Make draggable div
    https://www.w3schools.com/howto/howto_js_draggable.asp
*/

function initDraggableDiv(element) {
    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;
    let pos4 = 0;
    if (document.getElementById(`${element.id}-header`)) {
        // If present, the header is where you move the div from
        document.getElementById(`${element.id}-header`).onmousedown = dragMouseDown;
    } else {
        // Otherwise, move the div from anywhere inside the div
        element.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();

        // Get the mouse cursor position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;

        // Call a function whenever the cursor moves
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();

        // Calculate the new cursor position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        // Record the current position
        const oldTop = element.style.top;
        const oldLeft = element.style.left;

        // Set the element's new position
        element.style.top = `${element.offsetTop - pos2}px`;
        element.style.left = `${element.offsetLeft - pos1}px`;

        // Move if back if it is offscreen
        if ($('#game-chat-modal').is(':offscreen')) {
            element.style.top = oldTop;
            element.style.left = oldLeft;
        }
    }

    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;

        // Store the size and location of the div
        localStorage.setItem('chatWindowWidth', element.style.width);
        localStorage.setItem('chatWindowHeight', element.style.height);
        localStorage.setItem('chatWindowTop', element.style.top);
        localStorage.setItem('chatWindowLeft', element.style.left);
    }
}

/*
    Make resizable div by Hung Nguyen
    https://codepen.io/ZeroX-DG/pen/vjdoYe
*/

/* eslint-disable */
function initResizableDiv(div) {
    const element = document.querySelector(div);
    const resizers = document.querySelectorAll(`${div} .resizer`);
    const minimumSize = 20;
    let originalWidth = 0;
    let originalHeight = 0;
    let originalX = 0;
    let originalY = 0;
    let originalMouseX = 0;
    let originalMouseY = 0;
    for (let i = 0; i < resizers.length; i++) {
        const currentResizer = resizers[i];
        currentResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            originalWidth = parseFloat(getComputedStyle(element, null)
                .getPropertyValue('width')
                .replace('px', ''));
            originalHeight = parseFloat(getComputedStyle(element, null)
                .getPropertyValue('height')
                .replace('px', ''));
            const rect = element.getBoundingClientRect();
            originalX = rect.left;
            originalY = rect.top;
            originalMouseX = e.pageX;
            originalMouseY = e.pageY;
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResize);
        });

        function resize(e) {
            if (currentResizer.classList.contains('bottom-right')) {
                const width = originalWidth + (e.pageX - originalMouseX);
                const height = originalHeight + (e.pageY - originalMouseY);
                if (width > minimumSize) {
                    element.style.width = `${width}px`;
                }
                if (height > minimumSize) {
                    element.style.height = `${height}px`;
                }
            } else if (currentResizer.classList.contains('bottom-left')) {
                const height = originalHeight + (e.pageY - originalMouseY);
                const width = originalWidth - (e.pageX - originalMouseX);
                if (height > minimumSize) {
                    element.style.height = `${height}px`;
                }
                if (width > minimumSize) {
                    element.style.width = `${width}px`;
                    element.style.left = `${originalX + (e.pageX - originalMouseX)}px`;
                }
            } else if (currentResizer.classList.contains('top-right')) {
                const width = originalWidth + (e.pageX - originalMouseX);
                const height = originalHeight - (e.pageY - originalMouseY);
                if (width > minimumSize) {
                    element.style.width = `${width}px`;
                }
                if (height > minimumSize) {
                    element.style.height = `${height}px`;
                    element.style.top = `${originalY + (e.pageY - originalMouseY)}px`;
                }
            } else {
                const width = originalWidth - (e.pageX - originalMouseX);
                const height = originalHeight - (e.pageY - originalMouseY);
                if (width > minimumSize) {
                    element.style.width = `${width}px`;
                    element.style.left = `${originalX + (e.pageX - originalMouseX)}px`;
                }
                if (height > minimumSize) {
                    element.style.height = `${height}px`;
                    element.style.top = `${originalY + (e.pageY - originalMouseY)}px`;
                }
            }
        }

        function stopResize() {
            window.removeEventListener('mousemove', resize);

            // Store the size and location of the div
            localStorage.setItem('chatWindowWidth', element.style.width);
            localStorage.setItem('chatWindowHeight', element.style.height);
            localStorage.setItem('chatWindowTop', element.style.top);
            localStorage.setItem('chatWindowLeft', element.style.left);
        }
    }
}
/* eslint-enable */
