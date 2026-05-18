(function () {
    const bootstrapEl = document.getElementById('achievements-bootstrap');
    const modal = document.getElementById('achievements-modal');
    const openButton = document.getElementById('open-achievements-btn');
    const claimBadge = document.getElementById('achievements-claim-badge');
    const closeButton = document.getElementById('achievements-close-btn');
    const listEl = document.getElementById('achievements-list');
    const tabsEl = document.getElementById('achievements-category-tabs');
    const toastRoot = document.getElementById('achievement-toast-root') || createToastRoot();
    const unlockedCountEl = document.getElementById('achievements-unlocked-count');
    const totalCountEl = document.getElementById('achievements-total-count');

    let achievements = [];
    let activeCategory = 'All';
    let toastQueue = [];
    let isToastShowing = false;
    const shownCompletedToastCodes = new Set();

    function createToastRoot() {
        const root = document.createElement('div');
        root.id = 'achievement-toast-root';
        root.className = 'achievement-toast-root';
        root.setAttribute('aria-live', 'polite');
        document.body.appendChild(root);
        return root;
    }

    function readBootstrap() {
        if (!bootstrapEl) return { achievements: [], recentUnlocks: [] };
        try {
            return JSON.parse(bootstrapEl.textContent || '{}');
        } catch (error) {
            console.error('[ACHIEVEMENTS] Failed to parse achievement data:', error);
            return { achievements: [], recentUnlocks: [] };
        }
    }

    function escapeHtml(value) {
        const chars = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(value || '').replace(/[&<>"']/g, (char) => chars[char]);
    }

    function normalizeUnlocks(payload) {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload.achievementsUnlocked)) return payload.achievementsUnlocked;
        if (Array.isArray(payload.unlocks)) return payload.unlocks;
        return [payload];
    }

    function getCategories() {
        const categories = achievements.map((achievement) => achievement.category).filter(Boolean);
        return ['All', ...Array.from(new Set(categories))];
    }

    function isCompleted(achievement) {
        return !!(achievement.completed || achievement.unlocked || achievement.status === 'ready_to_claim' || achievement.status === 'claimed');
    }

    function isClaimed(achievement) {
        return !!(achievement.claimed || achievement.reward_given || achievement.status === 'claimed');
    }

    function isReadyToClaim(achievement) {
        return isCompleted(achievement) && !isClaimed(achievement);
    }

    function getProgressText(achievement) {
        const progress = achievement.progress || { current: isCompleted(achievement) ? achievement.target : 0, target: achievement.target };
        const target = Number(progress.target) || Number(achievement.target) || 1;
        const current = Math.min(Number(progress.current) || 0, target);
        return `${current}/${target}`;
    }

    function getProgressPercent(achievement) {
        const progress = achievement.progress || {};
        if (typeof progress.percent === 'number') return Math.max(0, Math.min(progress.percent, 100));
        const target = Number(progress.target) || Number(achievement.target) || 1;
        const current = Math.min(Number(progress.current) || 0, target);
        return Math.round((current / target) * 100);
    }

    function getAchievementClass(achievement) {
        if (isClaimed(achievement)) return 'is-claimed';
        if (isReadyToClaim(achievement)) return 'is-ready-to-claim';
        return 'is-locked';
    }

    function renderTabs() {
        if (!tabsEl) return;
        const categories = getCategories();
        if (!categories.includes(activeCategory)) activeCategory = 'All';

        tabsEl.innerHTML = categories.map((category) => `
            <button type="button"
                    class="achievements-category-tab ${category === activeCategory ? 'is-active' : ''}"
                    data-category="${escapeHtml(category)}">
                ${escapeHtml(category)}
            </button>
        `).join('');
    }

    function renderAchievementAction(achievement) {
        if (isReadyToClaim(achievement)) {
            return `
                <button type="button"
                        class="achievement-claim-btn"
                        data-achievement-code="${escapeHtml(achievement.code)}">
                    Claim
                </button>
            `;
        }

        if (isClaimed(achievement)) {
            return '<span class="achievement-claimed-status">Claimed <span aria-hidden="true">✓</span></span>';
        }

        return `<span class="achievement-progress-text">${getProgressText(achievement)}</span>`;
    }

    function renderAchievementCard(achievement) {
        const reward = achievement.reward_coins || achievement.rewardCoins || 0;
        const percent = getProgressPercent(achievement);

        return `
            <article class="achievement-card ${getAchievementClass(achievement)}" data-achievement-code="${escapeHtml(achievement.code)}">
                <div class="achievement-icon" aria-hidden="true"></div>
                <div class="achievement-body">
                    <div class="achievement-topline">
                        <h3 class="achievement-title">${escapeHtml(achievement.title)}</h3>
                        <span class="achievement-category">${escapeHtml(achievement.category)}</span>
                    </div>
                    <p class="achievement-description">${escapeHtml(achievement.description)}</p>
                    <div class="achievement-meta">
                        <span class="achievement-reward">
                            <img src="/assets/coins.png" alt="Coins">
                            +${reward}
                        </span>
                        ${renderAchievementAction(achievement)}
                    </div>
                    <div class="achievement-progress" aria-hidden="true">
                        <div class="achievement-progress-fill" style="width: ${percent}%"></div>
                    </div>
                </div>
            </article>
        `;
    }

    function renderList() {
        if (!listEl) return;

        const visibleAchievements = activeCategory === 'All'
            ? achievements
            : achievements.filter((achievement) => achievement.category === activeCategory);
        listEl.innerHTML = visibleAchievements.map(renderAchievementCard).join('');
    }

    function updateSummary() {
        if (!unlockedCountEl || !totalCountEl) return;
        unlockedCountEl.textContent = achievements.filter(isCompleted).length;
        totalCountEl.textContent = achievements.length;
    }

    function updateClaimBadge() {
        if (!claimBadge) return;
        const hasClaimableReward = achievements.some(isReadyToClaim);
        claimBadge.hidden = !hasClaimableReward;
    }

    function render() {
        renderTabs();
        renderList();
        updateSummary();
        updateClaimBadge();
    }

    function openModal() {
        if (!modal) return;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function updateCoins(coins) {
        if (coins === null || coins === undefined) return;
        document.querySelectorAll('#lobby-coin-amount, #shop-coin-amount').forEach((coinAmount) => {
            coinAmount.textContent = coins;
            coinAmount.style.animation = 'pulse 0.8s ease-in-out';
            setTimeout(() => {
                coinAmount.style.animation = '';
            }, 850);
        });
    }

    function applyCompletedAchievement(unlock) {
        if (!unlock || !unlock.code) return;
        const existing = achievements.find((achievement) => achievement.code === unlock.code);
        if (!existing) return;

        existing.unlocked = true;
        existing.completed = true;
        existing.unlocked_at = unlock.unlocked_at || existing.unlocked_at || new Date().toISOString();
        existing.reward_given = false;
        existing.claimed = false;
        existing.claim_available = true;
        existing.status = 'ready_to_claim';
        existing.progress = {
            current: existing.target,
            target: existing.target,
            capped: existing.target,
            percent: 100
        };
    }

    function applyClaimedAchievement(claimedAchievement) {
        if (!claimedAchievement || !claimedAchievement.code) return;
        const existing = achievements.find((achievement) => achievement.code === claimedAchievement.code);
        if (!existing) return;

        existing.unlocked = true;
        existing.completed = true;
        existing.reward_given = true;
        existing.claimed = true;
        existing.claim_available = false;
        existing.status = 'claimed';
        existing.progress = {
            current: existing.target,
            target: existing.target,
            capped: existing.target,
            percent: 100
        };
    }

    function queueToast(toastData) {
        if (!toastData || !toastData.title) return;
        toastQueue.push(toastData);
        showNextToast();
    }

    function showNextToast() {
        if (isToastShowing || toastQueue.length === 0) return;
        isToastShowing = true;

        const data = toastQueue.shift();
        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.innerHTML = `
            <div class="achievement-toast-label">${escapeHtml(data.label)}</div>
            <div class="achievement-toast-title">${escapeHtml(data.title)}</div>
            <div class="achievement-toast-reward">
                <span>${escapeHtml(data.rewardText)}</span>
                <img src="/assets/coins.png" alt="Coins">
            </div>
        `;

        toastRoot.appendChild(toast);
        if (data.coins !== undefined) updateCoins(data.coins);

        setTimeout(() => {
            toast.classList.add('is-leaving');
            setTimeout(() => {
                toast.remove();
                isToastShowing = false;
                showNextToast();
            }, 260);
        }, 3300);
    }

    function showCompleted(payload) {
        const unlocks = normalizeUnlocks(payload);
        unlocks.forEach((unlock) => {
            if (!unlock || !unlock.code) return;
            applyCompletedAchievement(unlock);

            if (!shownCompletedToastCodes.has(unlock.code)) {
                shownCompletedToastCodes.add(unlock.code);
                const reward = unlock.reward_coins || unlock.rewardCoins || 0;
                queueToast({
                    label: 'Achievement Completed!',
                    title: unlock.title,
                    rewardText: `Reward ready to claim: +${reward} coins`
                });
            }
        });
        render();
    }

    async function claimAchievement(code, button) {
        if (!code || !button || button.disabled) return;

        button.disabled = true;
        button.textContent = 'Claiming...';

        try {
            const response = await fetch('/achievements/claim', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ achievementCode: code })
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to claim reward');
            }

            if (Array.isArray(data.achievements)) {
                achievements = data.achievements;
            } else {
                applyClaimedAchievement(data.achievement);
            }

            updateCoins(data.coins);
            render();

            const reward = data.achievement.reward_coins || data.achievement.rewardCoins || 0;
            queueToast({
                label: 'Reward Claimed!',
                title: data.achievement.title,
                rewardText: `+${reward} coins`,
                coins: data.coins
            });
        } catch (error) {
            button.disabled = false;
            button.textContent = 'Claim';
            queueToast({
                label: 'Claim Failed',
                title: 'Reward was not claimed',
                rewardText: error.message || 'Try again'
            });
        }
    }

    function setData(data) {
        if (!data) return;
        if (Array.isArray(data.achievements)) {
            achievements = data.achievements;
        } else if (Array.isArray(data)) {
            achievements = data;
        }
        render();
        showCompleted(data.recentUnlocks || data.achievementsUnlocked || []);
    }

    function bindEvents() {
        if (openButton) {
            openButton.addEventListener('click', openModal);
        }

        if (closeButton) {
            closeButton.addEventListener('click', closeModal);
        }

        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target.matches('[data-achievements-close]')) {
                    closeModal();
                }
            });
        }

        if (tabsEl) {
            tabsEl.addEventListener('click', (event) => {
                const button = event.target.closest('.achievements-category-tab');
                if (!button) return;
                activeCategory = button.dataset.category || 'All';
                render();
            });
        }

        if (listEl) {
            listEl.addEventListener('click', (event) => {
                const button = event.target.closest('.achievement-claim-btn');
                if (!button) return;
                claimAchievement(button.dataset.achievementCode, button);
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal && modal.classList.contains('is-open')) {
                closeModal();
            }
        });

        const liveSocket = window.lobbySocket || (typeof socket !== 'undefined' ? socket : null);
        if (liveSocket && typeof liveSocket.on === 'function') {
            liveSocket.on('achievementUnlocked', (achievement) => {
                showCompleted(achievement);
            });
        }
    }

    window.Achievements = {
        setData,
        showUnlocked: showCompleted,
        showCompleted,
        updateCoins,
        render
    };

    setData(readBootstrap());
    bindEvents();
})();
