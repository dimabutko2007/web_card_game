const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const config = require('./config/config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration with MySQL store
const sessionStore = new MySQLStore({
    host: config.DB.HOST,
    user: config.DB.USER,
    password: config.DB.PASS,
    database: config.DB.NAME,
    port: config.DB.PORT
});

app.use(session({
    secret: config.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// Routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');

app.use('/auth', authRoutes);
app.use('/', gameRoutes);

// Socket.io handlers
const socketHandler = require('./sockets/gameSocket');
socketHandler(io);

const PORT = config.PORT;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
