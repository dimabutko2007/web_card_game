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

INSERT INTO cards (name, attack, defense, cost, image_url, has_taunt) VALUES
('Iron Man', 5, 5, 5, '/assets/cards/iron_man.png', FALSE),
('Captain America', 3, 6, 4, '/assets/cards/cap_america.png', TRUE),
('Thor', 6, 6, 6, '/assets/cards/thor.png', FALSE),
('Hulk', 8, 9, 8, '/assets/cards/hulk.png', TRUE),
('Black Widow', 3, 2, 2, '/assets/cards/black_widow.png', FALSE),
('Hawkeye', 4, 1, 2, '/assets/cards/hawkeye.png', FALSE),
('Spider-Man', 4, 3, 3, '/assets/cards/spiderman.png', FALSE),
('Black Panther', 4, 5, 4, '/assets/cards/black_panther.png', FALSE),
('Doctor Strange', 4, 7, 5, '/assets/cards/dr_strange.png', FALSE),
('Scarlet Witch', 7, 2, 4, '/assets/cards/scarlet_witch.png', FALSE),
('Vision', 6, 5, 5, '/assets/cards/vision.png', FALSE),
('Ant-Man', 1, 2, 1, '/assets/cards/ant_man.png', FALSE),
('Wasp', 2, 1, 1, '/assets/cards/wasp.png', FALSE),
('Groot', 2, 10, 6, '/assets/cards/groot.png', TRUE),
('Rocket Raccoon', 4, 2, 2, '/assets/cards/rocket.png', FALSE),
('Star-Lord', 3, 4, 3, '/assets/cards/starlord.png', FALSE),
('Gamora', 5, 4, 4, '/assets/cards/gamora.png', FALSE),
('Drax', 4, 5, 4, '/assets/cards/drax.png', FALSE),
('Thanos', 12, 12, 10, '/assets/cards/thanos.png', FALSE),
('Loki', 3, 5, 4, '/assets/cards/loki.png', FALSE),
('Wolverine', 4, 4, 4, '/assets/cards/wolverine.png', FALSE),
('Deadpool', 3, 2, 2, '/assets/cards/deadpool.png', FALSE),
('Colossus', 2, 5, 3, '/assets/cards/colossus.png', TRUE),
('Luke Cage', 1, 4, 2, '/assets/cards/luke_cage.png', TRUE),
('Daredevil', 3, 4, 3, '/assets/cards/daredevil.png', TRUE),
('Falcon', 2, 3, 2, '/assets/cards/falcon.png', TRUE),
('The Thing', 4, 8, 5, '/assets/cards/thing.png', TRUE),
('Venom', 5, 5, 5, '/assets/cards/venom.png', FALSE),
('Doctor Doom', 7, 7, 7, '/assets/cards/dr_doom.png', FALSE),
('Silver Surfer', 4, 4, 4, '/assets/cards/silver_surfer.png', FALSE);
