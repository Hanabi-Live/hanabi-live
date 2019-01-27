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
    // Check to see if there are any uncurrently unread chat messages
    if (globals.chatUnread !== 0) {
        // If the user is opening the chat, then we assume that all of the chat messages are read
        globals.chatUnread = 0;
        globals.conn.send('chatRead'); // We need to notify the server that we have read everything
        globals.ui.updateChatLabel(); // Reset the "Chat" UI button back to normal
    }

    $('#game-chat-modal').fadeIn(globals.fadeTime);

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

function initDraggableDiv(elmnt) {
    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;
    let pos4 = 0;
    if (document.getElementById(`${elmnt.id}-header`)) {
        // If present, the header is where you move the div from
        document.getElementById(`${elmnt.id}-header`).onmousedown = dragMouseDown;
    } else {
        // Otherwise, move the div from anywhere inside the div
        elmnt.onmousedown = dragMouseDown;
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
        const oldTop = elmnt.style.top;
        const oldLeft = elmnt.style.left;

        // Set the element's new position
        elmnt.style.top = `${elmnt.offsetTop - pos2}px`;
        elmnt.style.left = `${elmnt.offsetLeft - pos1}px`;

        // Move if back if it is offscreen
        if ($('#game-chat-modal').is(':offscreen')) {
            elmnt.style.top = oldTop;
            elmnt.style.left = oldLeft;
        }
    }

    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;
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
            originalX = element.getBoundingClientRect().left;
            originalY = element.getBoundingClientRect().top;
            originalMouseX = e.pageX;
            originalMouseY = e.pageY;
            window.addEventListener('mousemove', resize)
            window.addEventListener('mouseup', stopResize)
        });

        function resize(e) {
            if (currentResizer.classList.contains('bottom-right')) {
                const width = originalWidth + (e.pageX - originalMouseX);
                const height = originalHeight + (e.pageY - originalMouseY);
                if (width > minimumSize) {
                    element.style.width = width + 'px';
                }
                if (height > minimumSize) {
                    element.style.height = height + 'px';
                }
            } else if (currentResizer.classList.contains('bottom-left')) {
                const height = originalHeight + (e.pageY - originalMouseY);
                const width = originalWidth - (e.pageX - originalMouseX);
                if (height > minimumSize) {
                    element.style.height = height + 'px';
                }
                if (width > minimumSize) {
                    element.style.width = width + 'px';
                    element.style.left = originalX + (e.pageX - originalMouseX) + 'px';
                }
            } else if (currentResizer.classList.contains('top-right')) {
                const width = originalWidth + (e.pageX - originalMouseX);
                const height = originalHeight - (e.pageY - originalMouseY);
                if (width > minimumSize) {
                    element.style.width = width + 'px';
                }
                if (height > minimumSize) {
                    element.style.height = height + 'px';
                    element.style.top = originalY + (e.pageY - originalMouseY) + 'px';
                }
            } else {
                const width = originalWidth - (e.pageX - originalMouseX)
                const height = originalHeight - (e.pageY - originalMouseY)
                if (width > minimumSize) {
                    element.style.width = width + 'px'
                    element.style.left = originalX + (e.pageX - originalMouseX) + 'px';
                }
                if (height > minimumSize) {
                    element.style.height = height + 'px';
                    element.style.top = originalY + (e.pageY - originalMouseY) + 'px';
                }
            }
        }

        function stopResize() {
            window.removeEventListener('mousemove', resize)
        }
    }
}
/* eslint-enable */
