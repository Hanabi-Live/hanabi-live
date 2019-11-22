/*
    In-game chat
*/

// Imports
import interact from 'interactjs';
import { FADE_TIME } from '../constants';
import globals from '../globals';

export const init = () => {
    // Make the chat modal draggable (using the InteractJS library)
    interact('.draggable')
        .draggable({
            allowFrom: '#game-chat-modal-header',

            // Keep the modal within the bounds of the page
            // (the parent is the <body> element)
            modifiers: [
                interact.modifiers!.restrictRect({
                    restriction: 'parent',
                }),
            ],

            // Define the drag behavior
            onmove: (event: any) => {
                // Get the new position based on the delta between the event and the old position
                // (which is conveniently stored in the "data-x" and "data-y" attributes)
                const x = (parseFloat(event.target.getAttribute('data-x')) || 0) + event.dx;
                const y = (parseFloat(event.target.getAttribute('data-y')) || 0) + event.dy;

                // Move it
                const element = $(`#${event.target.id}`);
                moveElement(element, x, y);
            },
        })

        .resizable({
            // resize from all edges and corners
            edges: {
                // We don't want it to be resizable from the top since
                // it interferes with the area dedicated to moving the div
                left: true,
                right: true,
                bottom: true,
            },

            ignoreFrom: '#game-chat-modal-header',

            modifiers: [
                // Keep the modal within the bounds of the page
                // (the parent is the <body> element)
                interact.modifiers!.restrictEdges({
                    outer: 'parent',
                }),

                // Define a minimum size for the modal
                interact.modifiers!.restrictSize({
                    min: {
                        width: 200,
                        height: 200,
                    },
                }),
            ],
        })

        .on('resizemove', (event: any) => {
            // Get the new position based on the delta between the event and the old position
            // (which is conveniently stored in the "data-x" and "data-y" attributes)
            let x = (parseFloat(event.target.getAttribute('data-x')) || 0);
            let y = (parseFloat(event.target.getAttribute('data-y')) || 0);

            // Translate when resizing from top or left edges
            x += event.deltaRect.left;
            y += event.deltaRect.top;

            // Move it
            const element = $(`#${event.target.id}`);
            moveElement(element, x, y);

            // Resize it
            event.target.style.width = `${event.rect.width}px`;
            event.target.style.height = `${event.rect.height}px`;
        })

        .on('dragend resizeend', (event: any) => {
            // The modal was moved or resized;
            // store the window dimensions in a cookie so that it will persist between refreshes
            localStorage.setItem('chatWindowWidth', event.target.style.width);
            localStorage.setItem('chatWindowHeight', event.target.style.height);
            const chatElement = $(`#${event.target.id}`);
            if (chatElement) {
                localStorage.setItem('chatWindowX', chatElement.attr('data-x') || '0');
                localStorage.setItem('chatWindowY', chatElement.attr('data-y') || '0');
            } else {
                throw new Error(`Failed to get the "${event.target.id}" element.`);
            }
        });

    $('#game-chat-modal-header-close').click(() => {
        hide();
    });
};

export const toggle = () => {
    const modal = $('#game-chat-modal');
    if (modal.is(':visible')) {
        hide();
    } else {
        show();
    }
};

export const show = () => {
    const modal = $('#game-chat-modal');
    modal.fadeIn(FADE_TIME);

    // Check to see if there are any uncurrently unread chat messages
    if (globals.chatUnread !== 0) {
        // If the user is opening the chat, then we assume that all of the chat messages are read
        globals.chatUnread = 0;

        // We need to notify the server that we have read everything
        if (globals.conn) {
            globals.conn.send('chatRead');
        } else {
            throw new Error('The "globals.conn" object is not initialized.');
        }

        // Reset the "Chat" UI button back to normal
        if (globals.ui) {
            globals.ui.updateChatLabel();
        } else {
            throw new Error('The "globals.ui" object is not initialized.');
        }
    }

    // Set the modal to the default position
    modal.css('width', '20%');
    modal.css('height', '50%');
    modal.css('top', '1%');
    modal.css('left', '79%');

    // If there is a stored size + position for the chat box, set that
    let resetPosition = true;
    const width = localStorage.getItem('chatWindowWidth');
    const height = localStorage.getItem('chatWindowHeight');
    const x = localStorage.getItem('chatWindowX');
    const y = localStorage.getItem('chatWindowY');
    if (
        width !== null && width !== ''
        && height !== null && height !== ''
        && x !== null && x !== ''
        && y !== null && y !== ''
    ) {
        resetPosition = false;
        modal.css('width', width);
        modal.css('height', height);
        moveElement(modal, parseInt(x, 10), parseInt(y, 10));

        // Just in case,
        // reset the size and position if the stored location puts the chat box offscreen
        // (this is possible if the window size has changed since the last time)
        if (modal.is(':offscreen')) {
            resetPosition = true;
        }
    }

    if (resetPosition) {
        modal.css('width', '20%');
        modal.css('height', '50%');
        modal.css('webkitTransform', 'translate(0px, 0px)');
        modal.css('transform', 'translate(0px, 0px)');
        modal.attr('data-x', 0);
        modal.attr('data-y', 0);
    }

    // Scroll to the bottom of the chat
    const chat = document.getElementById('game-chat-text');
    if (chat) {
        chat.scrollTop = chat.scrollHeight;
    } else {
        throw new Error('Failed to get the "game-chat-text" element.');
    }

    $('#game-chat-input').focus();
};

export const hide = () => {
    $('#game-chat-modal').fadeOut(FADE_TIME);
};

// Subroutine to move an element (using the "transform" CSS property)
function moveElement(element: JQuery, x: number, y: number) {
    // Update the element's style
    const transform = `translate(${x}px, ${y}px)`;
    element.css('webkitTransform', transform);
    element.css('transform', transform);

    // Keep the dragged position in the "data-x" & "data-y" attributes
    element.attr('data-x', x);
    element.attr('data-y', y);
}
