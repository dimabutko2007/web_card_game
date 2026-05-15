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
    coins INT DEFAULT 100,
    reset_token VARCHAR(255),
    reset_expires TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friendships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    status ENUM('pending', 'accepted') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_friendship (sender_id, receiver_id),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- All available cards (both base starter set and rare shop items)
-- is_starter = TRUE  -> Granted to every player upon registration (25 cards)
-- is_starter = FALSE -> Exclusive shop content (purchasable with coins)
CREATE TABLE IF NOT EXISTS cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    attack INT NOT NULL,
    defense INT NOT NULL,
    cost INT NOT NULL,
    image_url VARCHAR(255),
    has_taunt BOOLEAN DEFAULT FALSE,
    is_starter BOOLEAN DEFAULT FALSE,
    shop_price INT DEFAULT 100
);

-- Player's personal deck: includes base starter cards and any cards bought from the shop
CREATE TABLE IF NOT EXISTS user_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    card_id INT NOT NULL,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_card (user_id, card_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS abilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url VARCHAR(255),
    cooldown INT DEFAULT 2
);

INSERT INTO abilities (name, description, image_url, cooldown) VALUES
('Freeze', 'Choose an enemy card to freeze. It cannot attack next turn.', '/assets/cards/freeze.png', 2),
('Lightning', 'Deal 4 damage to an enemy card or 2 damage to the enemy hero.', '/assets/cards/lightning.png', 2),
('Poison', 'Deal 2 damage to 2 random enemy cards.', '/assets/cards/poison.png', 2),
('Regeneration', 'Restore a friendly card to its maximum HP.', '/assets/cards/regeneration.png', 2),
('Totem of Undying', 'Grant a friendly card a second life. If its HP falls to 0 or less, it restores to 75% HP.', '/assets/cards/totem_of_undying.png', 3);

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE cards;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO cards (name, attack, defense, cost, image_url, has_taunt, is_starter, shop_price) VALUES
-- =============================================
-- STARTER DECK (25 Cards, is_starter = TRUE)
-- =============================================

-- 1 Energy (4 Cards) - All starter
('Endermite',        2, 1, 1, '/assets/cards/endermite.png',        FALSE, TRUE,  0),
('Silverfish',       1, 2, 1, '/assets/cards/silverfish.png',       FALSE, TRUE,  0),
('Baby Zombie',      1, 2, 1, '/assets/cards/baby_zombie.png',      FALSE, TRUE,  0),
('Bee',              2, 1, 1, '/assets/cards/bee.png',              FALSE, TRUE,  0),

-- 2 Energy (10 Cards) - All starter
('Zombie',           1, 3, 2, '/assets/cards/zombie.png',           TRUE,  TRUE,  0),
('Drowned',          3, 2, 2, '/assets/cards/drowned.png',          FALSE, TRUE,  0),
('Husk',             2, 2, 2, '/assets/cards/husk.png',             TRUE,  TRUE,  0),
('Skeleton',         4, 1, 2, '/assets/cards/skeleton.png',         FALSE, TRUE,  0),
('Stray',            3, 2, 2, '/assets/cards/stray.png',            FALSE, TRUE,  0),
('Bogged',           2, 2, 2, '/assets/cards/bogged.png',           FALSE, TRUE,  0),
('Parched',          3, 1, 2, '/assets/cards/parched.png',          FALSE, TRUE,  0),
('Zombie Villager',  1, 3, 2, '/assets/cards/zombie_villager.png',  TRUE,  TRUE,  0),
('Slime',            1, 3, 2, '/assets/cards/slime.png',            TRUE,  TRUE,  0),
('Wolf',             2, 2, 2, '/assets/cards/wolf.png',             FALSE, TRUE,  0),

-- 3 Energy (8 Cards) - All starter
('Spider',           3, 3, 3, '/assets/cards/spider.png',           FALSE, TRUE,  0),
('Creeper',          5, 1, 3, '/assets/cards/creeper.png',          FALSE, TRUE,  0),
('Phantom',          3, 3, 3, '/assets/cards/phantom.png',          TRUE,  TRUE,  0),
('Magma Cube',       1, 4, 3, '/assets/cards/magma_cube.png',       TRUE,  TRUE,  0),
('Piglin',           2, 3, 3, '/assets/cards/piglin.png',           TRUE,  TRUE,  0),
('Pillager',         3, 3, 3, '/assets/cards/pillager.png',         FALSE, TRUE,  0),
('Vex',              5, 2, 3, '/assets/cards/vex.png',              FALSE, TRUE,  0),
('Cave Spider',      3, 3, 3, '/assets/cards/cave_spider.png',      FALSE, TRUE,  0),

-- 4 Energy (3 Starter Cards)
('Zombified Piglin', 3, 4, 4, '/assets/cards/zombified_piglin.png', TRUE,  TRUE,  0),
('Witch',            5, 4, 4, '/assets/cards/witch.png',            FALSE, TRUE,  0),
('Blaze',            6, 3, 4, '/assets/cards/blaze.png',            FALSE, TRUE,  0),

-- =============================================
-- SHOP CATALOG (20 Cards, is_starter = FALSE)
-- =============================================

-- 4 Energy - Shop items
('Ghast',            5, 3, 4, '/assets/cards/ghast.png',            FALSE, FALSE, 150),
('Hoglin',           4, 3, 4, '/assets/cards/hoglin.png',           TRUE,  FALSE, 150),
('Guardian',         4, 4, 4, '/assets/cards/guardian.png',         FALSE, FALSE, 150),
('Vindicator',       6, 2, 4, '/assets/cards/vindicator.png',       FALSE, FALSE, 150),
('Shulker',          1, 6, 4, '/assets/cards/shulker.png',          TRUE,  FALSE, 150),
('Zoglin',           3, 4, 4, '/assets/cards/zoglin.png',           TRUE,  FALSE, 150),
('Jockey',           5, 3, 4, '/assets/cards/jockey.png',           FALSE, FALSE, 150),
('Snow Golem',       4, 4, 4, '/assets/cards/snow_golem.png',       FALSE, FALSE, 150),

-- 5 Energy - Shop items
('Piglin Brute',     7, 4, 5, '/assets/cards/piglin_brute.png',     FALSE, FALSE, 250),
('Evoker',           6, 5, 5, '/assets/cards/evoker.png',           FALSE, FALSE, 250),
('Ravager',          4, 6, 5, '/assets/cards/ravager.png',          TRUE,  FALSE, 250),
('Breeze',           6, 4, 5, '/assets/cards/breeze.png',           FALSE, FALSE, 250),
('Creaking',         1, 8, 5, '/assets/cards/creaking.png',         TRUE,  FALSE, 250),
('Enderman',         7, 3, 5, '/assets/cards/enderman.png',         FALSE, FALSE, 250),
('Iron Golem',       5, 5, 5, '/assets/cards/iron_golem.png',       FALSE, FALSE, 250),

-- 6 Energy - Shop items
('Wither Skeleton',  8, 5, 6, '/assets/cards/wither_skeleton.png',  FALSE, FALSE, 400),
('Elder Guardian',   4, 8, 6, '/assets/cards/elder_guardian.png',   TRUE,  FALSE, 400),
('Giant',            2, 9, 6, '/assets/cards/giant.png',            TRUE,  FALSE, 400),

-- 7 Energy - Shop item (Rare)
('Wither',           8, 7, 7, '/assets/cards/wither.png',           FALSE, FALSE, 600),

-- 8 Energy - Shop item (Legendary)
('Warden',           8, 9, 8, '/assets/cards/warden.png',           TRUE,  FALSE, 800),

-- 10 Energy - Shop item (Mythical)
('Ender Dragon',    12,12,10, '/assets/cards/ender_dragon.png',     FALSE, FALSE, 1500);
