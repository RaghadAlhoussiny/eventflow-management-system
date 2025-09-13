-- This makes sure that foreign_key constraints are observed and that errors will be thrown for violations
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-- Create your tables with SQL commands here (watch out for slight syntactical differences with SQLite vs MySQL)

-- Site settings table
-- Stores global site settings that can be customized by organizers
CREATE TABLE IF NOT EXISTS site_settings (
    setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_name TEXT NOT NULL DEFAULT 'EventFlow', -- Display name for the platform
    site_description TEXT NOT NULL DEFAULT 'Professional event management made simple' -- Tagline/description
);

-- Main table storing all event information
-- Supports draft/published workflow and multiple ticket types
CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, -- Event name/title
    description TEXT, -- Detailed event description
    event_date DATE, -- When the event takes place
    categories TEXT DEFAULT 'General', -- Comma-separated categories for filtering
    full_price_tickets INTEGER DEFAULT 0, -- Total number of full-price tickets available
    full_price_cost DECIMAL(10,2) DEFAULT 0.00,-- Price per full-price ticket
    concession_tickets INTEGER DEFAULT 0,  -- Total number of concession tickets available
    concession_cost DECIMAL(10,2) DEFAULT 0.00, -- Price per concession ticket
    status TEXT DEFAULT 'draft', -- 'draft' or 'published' - controls visibility
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP, -- When event was first created
    published_date DATETIME, -- When event was made public (null if still draft)
    last_modified DATETIME DEFAULT CURRENT_TIMESTAMP -- Last time event details were updated
);

-- Bookings table - ATTENDEE RESERVATIONS
CREATE TABLE IF NOT EXISTS bookings (
    booking_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER, -- Which event this booking is for
    attendee_name TEXT NOT NULL, -- Name of person making booking
    full_tickets_booked INTEGER DEFAULT 0, -- Number of full-price tickets booked
    concession_tickets_booked INTEGER DEFAULT 0, -- Number of concession tickets booked
    booking_date DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When booking was made
    FOREIGN KEY (event_id) REFERENCES events(event_id) -- Link to events table - ensures booking references a valid event
);

-- Anonymous tracking of event page views for recommendation system
-- Helps identify popular events without storing personal data
CREATE TABLE IF NOT EXISTS event_views (
    view_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER, -- Which event was viewed
    view_date DATETIME DEFAULT CURRENT_TIMESTAMP, -- When the view occurred
    FOREIGN KEY (event_id) REFERENCES events(event_id) -- Link to events table
);

-- Insert initial site configuration
INSERT INTO site_settings (site_name, site_description) VALUES 
('EventFlow', 'Professional event management made simple. Create, manage, and book events with ease.');

COMMIT;