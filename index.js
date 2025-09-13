/**
 * index.js -This is your main app entry point
 */

// Set up express, bodyparser and EJS
const express = require('express');
const app = express();
const port = 3000;
var bodyParser = require("body-parser");
const session = require('express-session');

// Configure middleware for request processing
app.use(bodyParser.urlencoded({ extended: true })); // Parse form data
app.set('view engine', 'ejs'); // Set EJS as templating engine
app.use(express.static(__dirname + '/public')); // Serve static files (CSS, images, etc.)

// Set up sessions for authentication
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Database setup and connection
// Creates SQLite database connection and enables foreign key constraints
const sqlite3 = require('sqlite3').verbose();
global.db = new sqlite3.Database('./database.db', function(err){
    if(err){
        console.error(err);
        process.exit(1); // Exit if database connection fails
    } else {
        console.log("Database connected");
        global.db.run("PRAGMA foreign_keys=ON"); // Enable foreign key constraints
    }
});

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        return next();// User is authenticated, proceed
    } else {
        return res.redirect('/login');// Redirect to login page
    }
}

// Handle requests to the home page
app.get('/', (req, res) => {
    res.render('main_home');
});

// Login routes
app.get('/login', (req, res) => {
    const error = req.query.error;
    res.render('login', { error: error });
});

app.post('/login', (req, res) => {
    const { password } = req.body;
    
    // Simple password check (environment variable in production)
    const correctPassword = process.env.ORGANISER_PASSWORD || 'eventflow2025';
    
    if (password === correctPassword) {
        req.session.isAuthenticated = true;
        console.log("Organiser logged in successfully");
        res.redirect('/organiser');
    } else {
        console.log("Failed login attempt");
        res.redirect('/login?error=invalid');
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
        }
        res.redirect('/');
    });
});

// Add all the route handlers in usersRoutes to the app under the path /users
const usersRoutes = require('./routes/users');
app.use('/users', usersRoutes);

// Add organiser routes with authentication middleware
const organiserRoutes = require('./routes/organiser');
app.use('/organiser', requireAuth, organiserRoutes);

// Add attendee routes (no authentication needed)
const attendeeRoutes = require('./routes/attendee');
app.use('/attendee', attendeeRoutes);

// Make the web application listen for HTTP requests
app.listen(port, () => {
    console.log(`EventFlow application listening on port ${port}`);
    console.log(`Access at: http://localhost:${port}`);
    console.log(`Organiser password: ${process.env.ORGANISER_PASSWORD || 'eventflow2025'}`);
})