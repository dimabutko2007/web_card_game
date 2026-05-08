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
('Ant-Man', 2, 1, 1, '/assets/cards/ant_man.png', FALSE),
('Wasp', 1, 2, 1, '/assets/cards/wasp.png', FALSE),
-- 2 Energy (Stats: 4-5)
('Black Widow', 3, 2, 2, '/assets/cards/black_widow.png', FALSE),
('Hawkeye', 4, 1, 2, '/assets/cards/hawkeye.png', FALSE),
('Rocket Raccoon', 3, 2, 2, '/assets/cards/rocket.png', FALSE),
('Deadpool', 2, 3, 2, '/assets/cards/deadpool.png', FALSE),
('Luke Cage', 1, 3, 2, '/assets/cards/luke_cage.png', TRUE), -- Taunt
('Falcon', 2, 2, 2, '/assets/cards/falcon.png', TRUE), -- Taunt
-- 3 Energy (Stats: 5-7)
('Spider-Man', 4, 3, 3, '/assets/cards/spiderman.png', FALSE),
('Star-Lord', 3, 4, 3, '/assets/cards/starlord.png', FALSE),
('Daredevil', 2, 4, 3, '/assets/cards/daredevil.png', TRUE), -- Taunt
('Colossus', 2, 4, 3, '/assets/cards/colossus.png', TRUE), -- Taunt
('Gamora', 5, 2, 3, '/assets/cards/gamora.png', FALSE),
-- 4 Energy (Stats: 7-9)
('Captain America', 3, 5, 4, '/assets/cards/cap_america.png', TRUE), -- Taunt
('Black Panther', 5, 4, 4, '/assets/cards/black_panther.png', FALSE),
('Scarlet Witch', 6, 3, 4, '/assets/cards/scarlet_witch.png', FALSE),
('Drax', 4, 5, 4, '/assets/cards/drax.png', FALSE),
('Loki', 4, 5, 4, '/assets/cards/loki.png', FALSE),
('Wolverine', 4, 5, 4, '/assets/cards/wolverine.png', FALSE),
('Silver Surfer', 5, 4, 4, '/assets/cards/silver_surfer.png', FALSE),
-- 5 Energy (Stats: 9-11)
('Iron Man', 6, 5, 5, '/assets/cards/iron_man.png', FALSE),
('Doctor Strange', 4, 7, 5, '/assets/cards/dr_strange.png', FALSE),
('Vision', 5, 6, 5, '/assets/cards/vision.png', FALSE),
('Venom', 7, 4, 5, '/assets/cards/venom.png', FALSE),
('The Thing', 4, 6, 5, '/assets/cards/thing.png', TRUE), -- Taunt
-- 6 Energy (Stats: 11-13)
('Thor', 7, 6, 6, '/assets/cards/thor.png', FALSE),
('Groot', 2, 9, 6, '/assets/cards/groot.png', TRUE), -- Taunt
-- 7 Energy (Stats: 15)
('Doctor Doom', 8, 7, 7, '/assets/cards/dr_doom.png', FALSE),
-- 8 Energy (Stats: 17)
('Hulk', 8, 9, 8, '/assets/cards/hulk.png', TRUE), -- Taunt
-- 10 Energy (Stats: 21+)
('Thanos', 12, 12, 10, '/assets/cards/thanos.png', FALSE);
