(function () {
    function initShop() {
        const openButton = document.getElementById('open-shop-btn');
        const modal = document.getElementById('shop-modal');
        const closeButton = document.getElementById('shop-close-btn');
        const grid = document.getElementById('shop-grid');
        const emptyMessage = document.getElementById('shop-empty');
        const messageBox = document.getElementById('shop-message');
        const buySuccessSound = new Audio('/assets/sounds/buy_succes_sound.mp3');
        const buyErrorSound = new Audio('/assets/sounds/buy_error_sound.mp3');

        if (!openButton || !modal || !grid) return;

        function playShopSound(sound) {
            sound.currentTime = 0;
            const playPromise = sound.play();
            if (playPromise) {
                playPromise.catch(() => {});
            }
        }

        function openShop() {
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            clearMessage();
        }

        function closeShop() {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }

        function clearMessage() {
            if (!messageBox) return;
            messageBox.textContent = '';
            messageBox.classList.remove('is-error', 'is-success');
        }

        function showMessage(text, type) {
            if (!messageBox) return;
            messageBox.textContent = text;
            messageBox.classList.toggle('is-error', type === 'error');
            messageBox.classList.toggle('is-success', type === 'success');
        }

        function updateEmptyState() {
            if (!emptyMessage) return;
            emptyMessage.hidden = grid.querySelectorAll('.shop-card').length > 0;
        }

        function setBusy(button, isBusy) {
            if (!button) return;
            button.disabled = isBusy;
            button.textContent = isBusy ? 'BUY...' : 'BUY';
        }

        function updateCoins(coins) {
            const coinAmounts = document.querySelectorAll('#lobby-coin-amount, #shop-coin-amount');
            coinAmounts.forEach((coinAmount) => {
                coinAmount.textContent = coins;
            });
        }

        function createStatsLine(card) {
            const stats = document.createElement('div');
            stats.className = 'card-stats-line';
            stats.setAttribute('aria-label', 'Card stats');

            const damage = document.createElement('span');
            damage.title = 'Damage';
            damage.textContent = `⚔️ ${card.attack}`;

            const hp = document.createElement('span');
            hp.title = 'HP';
            hp.textContent = `❤️ ${card.defense}`;

            const energy = document.createElement('span');
            energy.title = 'Energy';
            energy.textContent = `⚡ ${card.cost}`;

            stats.append(damage, hp, energy);
            return stats;
        }

        function removeShopCard(cardId) {
            const shopCard = grid.querySelector(`.shop-card[data-card-id="${cardId}"]`);
            if (shopCard) {
                shopCard.remove();
            }
            updateEmptyState();
        }

        function removeLockedCard(cardId) {
            const lockedCard = document.querySelector(`#locked-cards-grid .armory-card-locked[data-card-id="${cardId}"]`);
            if (lockedCard) {
                lockedCard.remove();
            }

            const lockedSection = document.getElementById('locked-cards-section');
            if (lockedSection && !lockedSection.querySelector('.armory-card-locked')) {
                lockedSection.remove();
            }
        }

        function appendOwnedCard(card) {
            const ownedGrid = document.getElementById('owned-cards-grid');
            if (!ownedGrid || !card) return;

            const existingCard = ownedGrid.querySelector(`.armory-card[data-card-id="${card.id}"]`);
            if (existingCard) return;

            const cardEl = document.createElement('div');
            cardEl.className = 'armory-card';
            cardEl.dataset.cardId = card.id;
            cardEl.title = `${card.name} (Damage: ${card.attack} / HP: ${card.defense} / Energy: ${card.cost})`;

            const image = document.createElement('img');
            image.src = card.image_url;
            image.alt = card.name;

            const name = document.createElement('div');
            name.className = 'armory-card-name';
            name.textContent = card.name;

            cardEl.append(image, name, createStatsLine(card));
            ownedGrid.appendChild(cardEl);
        }

        async function buyCard(button) {
            const cardId = button.dataset.cardId;
            if (!cardId) return;

            setBusy(button, true);
            clearMessage();

            try {
                const response = await fetch('/shop/buy', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cardId })
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'Purchase failed');
                }

                updateCoins(data.coins);
                appendOwnedCard(data.card);
                removeLockedCard(data.card.id);
                removeShopCard(data.card.id);
                showMessage(data.message || 'Purchase successful', 'success');
                if (window.Achievements && typeof window.Achievements.setData === 'function') {
                    window.Achievements.setData({
                        achievements: data.achievements,
                        achievementsUnlocked: data.achievementsUnlocked
                    });
                }
                playShopSound(buySuccessSound);
            } catch (error) {
                showMessage(error.message || 'Purchase failed', 'error');
                playShopSound(buyErrorSound);
                setBusy(button, false);
            }
        }

        openButton.addEventListener('click', openShop);

        if (closeButton) {
            closeButton.addEventListener('click', closeShop);
        }

        modal.addEventListener('click', (event) => {
            if (event.target.matches('[data-shop-close]')) {
                closeShop();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) {
                closeShop();
            }
        });

        grid.addEventListener('click', (event) => {
            const button = event.target.closest('.shop-buy-btn');
            if (button && !button.disabled) {
                buyCard(button);
            }
        });

        updateEmptyState();
    }

    document.addEventListener('DOMContentLoaded', initShop);
})();
