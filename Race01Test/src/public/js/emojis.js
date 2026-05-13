document.addEventListener('DOMContentLoaded', () => {
    const emojiCount = 25;
    let emojiPickerOpen = false;

    const clickSound = new Audio('/assets/sounds/click_sound.mp3');
    const sendEmojiSound = new Audio('/assets/sounds/send_emoji_sound.mp3');
    if (window.AudioManager) {
        window.AudioManager.register(clickSound, 'sfx', 0.5);
        window.AudioManager.register(sendEmojiSound, 'sfx', 0.6);
    }

    const myPlayerInfo = document.querySelector('.player-area:not(.opponent-area) .player-info');
    const oppPlayerInfo = document.querySelector('.opponent-area .player-info');

    const emojiFloating = document.createElement('div');
    emojiFloating.id = 'emoji-floating';

    const triggerBtn = document.createElement('button');
    triggerBtn.id = 'emoji-trigger-btn';
    triggerBtn.innerHTML = '😀';
    triggerBtn.title = 'Send Emoji';
    triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clickSound.currentTime = 0;
        clickSound.play().catch(e => {});
        toggleEmojiPicker();
    });

    const pickerContainer = document.createElement('div');
    pickerContainer.id = 'emoji-picker';
    pickerContainer.className = 'emoji-picker hidden';

    const emojiGrid = document.createElement('div');
    emojiGrid.className = 'emoji-grid';

    for (let i = 1; i <= emojiCount; i++) {
        const emojiId = i < 10 ? `0${i}` : `${i}`;
        const img = document.createElement('img');
        img.src = `/assets/emoji/emoji_${emojiId}.png`;
        img.className = 'emoji-item';
        img.dataset.id = emojiId;

        img.addEventListener('click', () => {
            sendEmojiSound.currentTime = 0;
            sendEmojiSound.play().catch(e => {});
            sendEmoji(emojiId);
            toggleEmojiPicker();
        });

        emojiGrid.appendChild(img);
    }

    pickerContainer.appendChild(emojiGrid);
    emojiFloating.appendChild(pickerContainer);
    emojiFloating.appendChild(triggerBtn);
    document.body.appendChild(emojiFloating);

    const myBubble = document.createElement('div');
    myBubble.id = 'my-emoji-bubble';
    myBubble.className = 'emoji-bubble emoji-bubble-fixed hidden';
    document.body.appendChild(myBubble);

    const oppBubble = document.createElement('div');
    oppBubble.id = 'opp-emoji-bubble';
    oppBubble.className = 'emoji-bubble opp-bubble hidden';
    if (oppPlayerInfo) oppPlayerInfo.appendChild(oppBubble);

    function toggleEmojiPicker() {
        emojiPickerOpen = !emojiPickerOpen;
        if (emojiPickerOpen) {
            pickerContainer.classList.remove('hidden');
            triggerBtn.classList.add('active');
        } else {
            pickerContainer.classList.add('hidden');
            triggerBtn.classList.remove('active');
        }
    }

    document.addEventListener('click', (e) => {
        if (emojiPickerOpen && !emojiFloating.contains(e.target)) {
            toggleEmojiPicker();
        }
    });

    function sendEmoji(emojiId) {
        showEmojiBubble(false, emojiId);
        if (typeof socket !== 'undefined' && typeof gameId !== 'undefined') {
            socket.emit('sendEmoji', { gameId, emojiId, senderId: typeof myUserId !== 'undefined' ? myUserId : null });
        }
    }

    let myBubbleTimeout = null;
    let oppBubbleTimeout = null;

    function showEmojiBubble(isOpponent, emojiId) {
        const bubble = isOpponent ? oppBubble : myBubble;
        const timeoutRef = isOpponent ? oppBubbleTimeout : myBubbleTimeout;

        if (timeoutRef) clearTimeout(timeoutRef);

        if (!isOpponent) {
            const btnRect = triggerBtn.getBoundingClientRect();
            myBubble.style.left = (btnRect.left + btnRect.width / 2) + 'px';
            myBubble.style.bottom = (window.innerHeight - btnRect.top + 10) + 'px';
        }

        bubble.innerHTML = `<img src="/assets/emoji/emoji_${emojiId}.png" class="emoji-in-bubble">`;
        bubble.classList.remove('hidden');
        bubble.classList.remove('fade-out');
        bubble.classList.remove('pop-in');
        
        void bubble.offsetWidth;
        
        bubble.classList.add('pop-in');

        const newTimeout = setTimeout(() => {
            bubble.classList.remove('pop-in');
            bubble.classList.add('fade-out');
            setTimeout(() => {
                bubble.classList.add('hidden');
            }, 300);
        }, 3000);

        if (isOpponent) {
            oppBubbleTimeout = newTimeout;
        } else {
            myBubbleTimeout = newTimeout;
        }
    }

    if (typeof socket !== 'undefined') {
        socket.on('receiveEmoji', (data) => {
            const isMe = typeof myUserId !== 'undefined' && data.senderId === myUserId;
            if (!isMe) {
                showEmojiBubble(true, data.emojiId);
            }
        });
    }
});
