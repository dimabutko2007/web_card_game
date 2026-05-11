CREATE DATABASE IF NOT EXISTS card_game;
USE card_game;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    avatar VARCHAR(255) DEFAULT '/assets/default_avatar.png',
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    elo INT DEFAULT 1000,
    reset_token VARCHAR(255),
    reset_expires TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    attack INT NOT NULL,
    defense INT NOT NULL,
    cost INT NOT NULL,
    image_url VARCHAR(255),
    has_taunt BOOLEAN DEFAULT FALSE
);

TRUNCATE TABLE cards;
INSERT INTO cards (name, attack, defense, cost, image_url, has_taunt) VALUES
-- 1 Energy (Stats: 3)
('Endermite', 2, 1, 1, '/assets/cards/endermite.png', FALSE),
('Silverfish', 1, 2, 1, '/assets/cards/silverfish.png', FALSE),
('Slime', 1, 2, 1, '/assets/cards/slime.png', FALSE),
-- 2 Energy (Stats: 4-5)
('Zombie', 2, 3, 2, '/assets/cards/zombie.png', TRUE), -- Taunt
('Drowned', 3, 2, 2, '/assets/cards/drowned.png', FALSE),
('Husk', 2, 3, 2, '/assets/cards/husk.png', TRUE), -- Taunt
('Skeleton', 4, 1, 2, '/assets/cards/skeleton.png', FALSE),
('Stray', 3, 2, 2, '/assets/cards/stray.png', FALSE),
('Bogged', 2, 2, 2, '/assets/cards/bogged.png', FALSE),
('Parched', 3, 1, 2, '/assets/cards/parched.png', FALSE),
('Zombie Villager', 1, 3, 2, '/assets/cards/zombie_villager.png', TRUE), -- Taunt
-- 3 Energy (Stats: 5-7)
('Spider', 4, 3, 3, '/assets/cards/spider.png', FALSE),
('Creeper', 5, 1, 3, '/assets/cards/creeper.png', FALSE),
('Phantom', 4, 2, 3, '/assets/cards/phantom.png', FALSE),
('Magma Cube', 2, 4, 3, '/assets/cards/magma_cube.png', TRUE), -- Taunt
('Piglin', 4, 2, 3, '/assets/cards/piglin.png', FALSE),
('Pillager', 3, 3, 3, '/assets/cards/pillager.png', FALSE),
('Vex', 5, 2, 3, '/assets/cards/vex.png', FALSE),
-- 4 Energy (Stats: 7-9)
('Zombified Piglin', 4, 5, 4, '/assets/cards/zombified_piglin.png', TRUE), -- Taunt
('Witch', 5, 4, 4, '/assets/cards/witch.png', FALSE),
('Blaze', 6, 3, 4, '/assets/cards/blaze.png', FALSE),
('Ghast', 5, 3, 4, '/assets/cards/ghast.png', FALSE),
('Hoglin', 4, 5, 4, '/assets/cards/hoglin.png', TRUE), -- Taunt
('Guardian', 4, 4, 4, '/assets/cards/guardian.png', FALSE),
('Vindicator', 6, 2, 4, '/assets/cards/vindicator.png', FALSE),
('Shulker', 2, 6, 4, '/assets/cards/shulker.png', TRUE), -- Taunt
('Zoglin', 6, 3, 4, '/assets/cards/zoglin.png', FALSE),
-- 5 Energy (Stats: 9-11)
('Piglin Brute', 7, 4, 5, '/assets/cards/piglin_brute.png', FALSE),
('Evoker', 6, 5, 5, '/assets/cards/evoker.png', FALSE),
('Ravager', 5, 6, 5, '/assets/cards/ravager.png', TRUE), -- Taunt
('Breeze', 6, 4, 5, '/assets/cards/breeze.png', FALSE),
('Creaking', 3, 8, 5, '/assets/cards/creaking.png', TRUE), -- Taunt
('Enderman', 7, 3, 5, '/assets/cards/enderman.png', FALSE),
-- 6 Energy (Stats: 11-13)
('Wither Skeleton', 7, 5, 6, '/assets/cards/wither_skeleton.png', FALSE),
('Elder Guardian', 5, 8, 6, '/assets/cards/elder_guardian.png', TRUE), -- Taunt
('Giant', 4, 8, 6, '/assets/cards/giant.png', TRUE), -- Taunt
-- 7 Energy (Stats: 15)
('Wither', 8, 7, 7, '/assets/cards/wither.png', FALSE),
-- 8 Energy (Stats: 17)
('Warden', 8, 9, 8, '/assets/cards/warden.png', TRUE), -- Taunt
-- 10 Energy (Stats: 21+)
('Ender Dragon', 12, 12, 10, '/assets/cards/ender_dragon.png', FALSE);
