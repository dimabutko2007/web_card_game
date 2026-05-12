window.AudioManager = {
    audioElements: {
        music: [],
        sfx: []
    },
    volumes: {
        music: parseFloat(localStorage.getItem('musicVolume') ?? '0.5'),
        sfx: parseFloat(localStorage.getItem('sfxVolume') ?? '0.8')
    },
    register: function(audio, type, baseVolume = 1.0) {
        this.audioElements[type].push({ audio, baseVolume });
        this.updateAudioElement(audio, type, baseVolume);
    },
    updateAudioElement: function(audio, type, baseVolume) {
        audio.volume = baseVolume * this.volumes[type];
    },
    setVolume: function(type, volume) {
        this.volumes[type] = parseFloat(volume);
        localStorage.setItem(type + 'Volume', volume);
        this.audioElements[type].forEach(item => {
            this.updateAudioElement(item.audio, type, item.baseVolume);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.createElement('div');
    container.className = 'volume-controls-container';
    
    container.innerHTML = `
        <div class="volume-control-group">
            <button class="volume-btn" id="btn-music" title="Music Volume">🎵</button>
            <div class="volume-slider-popup">
                <input type="range" id="slider-music" min="0" max="1" step="0.01" value="${window.AudioManager.volumes.music}">
            </div>
        </div>
        <div class="volume-control-group">
            <button class="volume-btn" id="btn-sfx" title="SFX Volume">🔊</button>
            <div class="volume-slider-popup">
                <input type="range" id="slider-sfx" min="0" max="1" step="0.01" value="${window.AudioManager.volumes.sfx}">
            </div>
        </div>
    `;
    
    document.body.appendChild(container);

    const btnMusic = document.getElementById('btn-music');
    const btnSfx = document.getElementById('btn-sfx');
    
    btnMusic.addEventListener('click', (e) => {
        e.stopPropagation();
        btnMusic.parentElement.classList.toggle('active');
        btnSfx.parentElement.classList.remove('active');
    });
    
    btnSfx.addEventListener('click', (e) => {
        e.stopPropagation();
        btnSfx.parentElement.classList.toggle('active');
        btnMusic.parentElement.classList.remove('active');
    });

    document.getElementById('slider-music').addEventListener('input', (e) => {
        window.AudioManager.setVolume('music', e.target.value);
    });

    document.getElementById('slider-sfx').addEventListener('input', (e) => {
        window.AudioManager.setVolume('sfx', e.target.value);
        if (!window.sfxPreviewTimeout) {
            window.sfxPreviewTimeout = setTimeout(() => {
                if (typeof playClickSound === 'function') {
                    playClickSound();
                }
                window.sfxPreviewTimeout = null;
            }, 100);
        }
    });

    document.addEventListener('click', () => {
        btnMusic.parentElement.classList.remove('active');
        btnSfx.parentElement.classList.remove('active');
    });
    
    container.querySelectorAll('.volume-slider-popup').forEach(p => {
        p.addEventListener('click', (e) => e.stopPropagation());
    });
});
