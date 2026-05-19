(function () {
    const canvas = document.getElementById('bg-particles');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const PARTICLE_COLORS = [
        [192, 132, 252],
        [233, 213, 255],
        [255, 215, 0],
        [226, 54, 54],
        [255, 100, 200]
    ];

    class Particle {
        constructor(initialY) {
            this.reset(true);
            if (initialY !== undefined) {
                this.y = Math.random() * window.innerHeight;
            }
        }

        reset(initial) {
            this.x = Math.random() * canvas.width;
            this.y = initial ? Math.random() * canvas.height : canvas.height + Math.random() * 50;

            this.size = Math.random() * 3.5 + 0.4;

            const speedFactor = 1 - (this.size / 5);
            this.speedY = -(Math.random() * 1.2 + 0.3) * (0.5 + speedFactor);
            this.speedX = (Math.random() - 0.5) * 0.8;

            this.angle = Math.random() * Math.PI * 2;
            this.spin = (Math.random() - 0.5) * 0.08;
            this.swayRadius = Math.random() * 0.8 + 0.2;

            const rgb = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
            this.opacity = Math.random() * 0.55 + 0.15;
            this.color = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${this.opacity})`;
            this.glowColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${this.opacity * 0.5})`;
            this.hasGlow = this.size > 2.2;
        }

        update() {
            this.angle += this.spin;
            this.x += this.speedX + Math.sin(this.angle) * this.swayRadius;
            this.y += this.speedY;

            if (this.y < -10) {
                this.reset(false);
            }
            if (this.x > canvas.width + 10) this.x = -10;
            if (this.x < -10) this.x = canvas.width + 10;
        }

        draw() {
            ctx.save();
            ctx.globalAlpha = this.opacity;

            if (this.hasGlow) {
                ctx.shadowBlur = 12;
                ctx.shadowColor = this.glowColor;
            }

            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function initParticles() {
        particles = [];
        const count = window.innerWidth < 768 ? 60 : 160;
        for (let i = 0; i < count; i++) {
            particles.push(new Particle(true));
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of particles) {
            p.update();
            p.draw();
        }
        requestAnimationFrame(animate);
    }

    initParticles();
    animate();
})();
