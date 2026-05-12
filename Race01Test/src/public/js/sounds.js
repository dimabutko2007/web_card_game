// Global sounds manager
const clickSound = new Audio('/assets/sounds/click_sound.mp3');
window.AudioManager.register(clickSound, 'sfx', 1.0);

const menuMusic = new Audio('/assets/sounds/menu_sound.mp3');
menuMusic.loop = true;
window.AudioManager.register(menuMusic, 'music', 0.2);

function initMenuMusic() {
    if (window.location.pathname.startsWith('/game/')) return;

    const savedTime = sessionStorage.getItem('menuMusicTime');
    if (savedTime) {
        menuMusic.currentTime = parseFloat(savedTime);
    }

    function playMusic() {
        if (menuMusic.paused) {
            const playPromise = menuMusic.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    sessionStorage.setItem('menuMusicPlaying', 'true');
                }).catch(err => {
                    if (err.name !== 'NotAllowedError') console.log('Music autoplay prevented:', err);
                });
            }
        }
    }

    if (sessionStorage.getItem('menuMusicPlaying') === 'true') {
        playMusic();
    }

    document.addEventListener('click', playMusic, { once: true });
    document.addEventListener('keydown', playMusic, { once: true });

    window.addEventListener('beforeunload', () => {
        sessionStorage.setItem('menuMusicTime', menuMusic.currentTime);
        sessionStorage.setItem('menuMusicPlaying', !menuMusic.paused ? 'true' : 'false');
    });
}
initMenuMusic();

function playClickSound() {
    clickSound.currentTime = 0;
    const playPromise = clickSound.play();
    if (playPromise !== undefined) {
        playPromise.catch(err => {
            if (err.name !== 'NotAllowedError') console.log('Audio play failed:', err);
        });
    }
}

const matchStartSound = new Audio('/assets/sounds/match_start_sound.mp3');
window.AudioManager.register(matchStartSound, 'sfx', 0.8);

function playMatchStartSound() {
    matchStartSound.currentTime = 0;

    // Pause menu music if it's playing
    if (!menuMusic.paused) {
        menuMusic.pause();
        sessionStorage.setItem('menuMusicPlaying', 'false');
    }

    const playPromise = matchStartSound.play();
    if (playPromise !== undefined) {
        playPromise.catch(err => {
            if (err.name !== 'NotAllowedError') console.log('Audio play failed:', err);
        });
    }
}


document.addEventListener('click', (e) => {
    if (window.location.pathname.startsWith('/game/')) return;

    const target = e.target.closest('button, a, input[type="submit"], input[type="button"]');

    if (target) {
        playClickSound();

        if (target.tagName === 'A' && target.href && !target.href.startsWith('javascript:') && !target.href.includes('#')) {
            if (target.target !== '_blank') {
                e.preventDefault();
                setTimeout(() => {
                    window.location.href = target.href;
                }, 150);
            }
        }
    }
});

document.addEventListener('submit', (e) => {
    if (window.location.pathname.startsWith('/game/')) return;

    const form = e.target;

    e.preventDefault();
    setTimeout(() => {
        form.submit();
    }, 150);
});
