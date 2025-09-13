/**
 * attendee.js
 * Routes for attendee functionality - viewing events and making bookings
 * Handles dates and booking calculations properly with updated ticket counts
 */

const express = require("express");
const router = express.Router();

// Display attendee home page with published events
router.get("/", (req, res, next) => {
    // Get site settings first
    const settingsQuery = "SELECT * FROM site_settings LIMIT 1";
    
    global.db.get(settingsQuery, (err, settings) => {
        if (err) {
            next(err);
        } else {
            // Use default settings if none exist in Database
            if (!settings) {
                settings = {
                    site_name: 'Event Flow',
                    site_description: 'Organize amazing events'
                };
            }
            // Get published events ordered by date (soonest first)
            const eventsQuery = `SELECT * FROM events 
                               WHERE status = 'published' 
                               ORDER BY event_date ASC`;
            
            global.db.all(eventsQuery, (err, events) => {
                if (err) {
                    next(err);
                } else {
                    res.render('attendee-home', {
                        settings: settings,
                        events: events
                    });
                }
            });
        }
    });
});

// Display single event page with booking form
router.get("/event/:id", (req, res, next) => {
    const eventId = req.params.id;
    const bookingSuccess = req.query.booking_success;
    
    // Get event details for the specified event ID
    const eventQuery = "SELECT * FROM events WHERE event_id = ? AND status = 'published'";
    
    global.db.get(eventQuery, [eventId], (err, event) => {
        if (err) {
            console.error("Error fetching event:", err);
            next(err);
        } else if (!event) {
            // Event not found or not published
            res.status(404).send("Event not found or not available for booking");
        } else {
            // Get total bookings for this event to calculate remaining tickets
            const bookingsQuery = `SELECT 
                                   COALESCE(SUM(full_tickets_booked), 0) as total_full_booked,
                                   COALESCE(SUM(concession_tickets_booked), 0) as total_concession_booked
                                   FROM bookings WHERE event_id = ?`;
            
            global.db.get(bookingsQuery, [eventId], (err, bookingTotals) => {
                if (err) {
                    console.error("Error fetching booking totals:", err);
                    next(err);
                } else {
                    // Calculate remaining tickets with proper null handling
                    const fullBooked = parseInt(bookingTotals.total_full_booked) || 0;
                    const concessionBooked = parseInt(bookingTotals.total_concession_booked) || 0;
                    
                    const remainingFull = Math.max(0, (parseInt(event.full_price_tickets) || 0) - fullBooked);
                    const remainingConcession = Math.max(0, (parseInt(event.concession_tickets) || 0) - concessionBooked);

                    // Parse booking confirmation data if present
                    let bookingConfirmation = null;
                    if (bookingSuccess) {
                        try {
                            bookingConfirmation = JSON.parse(decodeURIComponent(bookingSuccess));
                        } catch (e) {
                            console.error("Error parsing booking confirmation:", e);
                        }
                    }
                    res.render('attendee-event', {
                        event: event,
                        remainingFull: remainingFull,
                        remainingConcession: remainingConcession,
                        bookingConfirmation: bookingConfirmation
                    });
                }
            });
        }
    });
});

// Process booking form submission
router.post("/event/:id/book", (req, res, next) => {
    const eventId = req.params.id;
    const { attendee_name, full_tickets, concession_tickets } = req.body;
    
    // Validate inputs
    if (!attendee_name || attendee_name.trim() === '') {
        return res.status(400).send("Attendee name is required");
    }
    // Convert ticket quantities to numbers and validate
    const fullTicketsNum = parseInt(full_tickets) || 0;
    const concessionTicketsNum = parseInt(concession_tickets) || 0;
    // Check for negative quantities
    if (fullTicketsNum < 0 || concessionTicketsNum < 0) {
        return res.status(400).send("Ticket quantities cannot be negative");
    }
    // Ensure at least one ticket is being booked
    if (fullTicketsNum === 0 && concessionTicketsNum === 0) {
        return res.status(400).send("Please select at least one ticket");
    }
    
    // Get event details and current bookings to check availability
    const eventQuery = "SELECT * FROM events WHERE event_id = ? AND status = 'published'";
    
    global.db.get(eventQuery, [eventId], (err, event) => {
        if (err) {
            console.error("Error fetching event for booking:", err);
            next(err);
        } else if (!event) {
            res.status(404).send("Event not found");
        } else {
            // Get current booking totals
            const bookingsQuery = `SELECT 
                                   COALESCE(SUM(full_tickets_booked), 0) as total_full_booked,
                                   COALESCE(SUM(concession_tickets_booked), 0) as total_concession_booked
                                   FROM bookings WHERE event_id = ?`;
            
            global.db.get(bookingsQuery, [eventId], (err, bookingTotals) => {
                if (err) {
                    console.error("Error fetching booking totals for validation:", err);
                    next(err);
                } else {
                    // Calculate remaining ticket availability
                    const fullBooked = parseInt(bookingTotals.total_full_booked) || 0;
                    const concessionBooked = parseInt(bookingTotals.total_concession_booked) || 0;
                    const remainingFull = Math.max(0, (parseInt(event.full_price_tickets) || 0) - fullBooked);
                    const remainingConcession = Math.max(0, (parseInt(event.concession_tickets) || 0) - concessionBooked);
                    
                    // Check if requested tickets are available
                    if (fullTicketsNum > remainingFull) {
                        return res.status(400).send(`Only ${remainingFull} full-price tickets available`);
                    }
                    if (concessionTicketsNum > remainingConcession) {
                        return res.status(400).send(`Only ${remainingConcession} concession tickets available`);
                    }
            
                    // All checks passed, create the booking
                    const bookingQuery = `INSERT INTO bookings 
                                         (event_id, attendee_name, full_tickets_booked, concession_tickets_booked, booking_date) 
                                         VALUES (?, ?, ?, ?, ?)`;
                    
                    const now = new Date().toISOString();
                    
                    global.db.run(bookingQuery, [
                        eventId, 
                        attendee_name.trim(), 
                        fullTicketsNum, 
                        concessionTicketsNum, 
                        now
                    ], function(err) {
                        if (err) {
                            console.error("Error creating booking:", err);
                            next(err);
                        } else {
                            // Calculate total cost for confirmation
                            const totalCost = (fullTicketsNum * (parseFloat(event.full_price_cost) || 0)) + 
                                            (concessionTicketsNum * (parseFloat(event.concession_cost) || 0));
                            
                            // Store booking confirmation data and redirect to show updated ticket counts
                            const bookingData = encodeURIComponent(JSON.stringify({
                                bookingId: this.lastID,
                                attendeeName: attendee_name.trim(),
                                fullTickets: fullTicketsNum,
                                concessionTickets: concessionTicketsNum,
                                totalCost: totalCost.toFixed(2),
                                eventTitle: event.title
                            }));
                            // Redirect to event page with booking confirmation - this will refresh the page with updated counts
                            res.redirect(`/attendee/event/${eventId}?booking_success=${bookingData}`);
                        }
                    });
                }
            });
        }
    });
});


// Handle search and filtering for events
router.get("/search", (req, res, next) => {
    const { category, minPrice, maxPrice, searchTerm, format } = req.query;
    
    // Build dynamic query based on filters
    let query = `SELECT e.*, 
                 COALESCE(SUM(b.full_tickets_booked), 0) as total_full_booked,
                 COALESCE(SUM(b.concession_tickets_booked), 0) as total_concession_booked
                 FROM events e
                 LEFT JOIN bookings b ON e.event_id = b.event_id
                 WHERE e.status = 'published'`;
    
    let queryParams = [];
    
   // Add category filter
    if (category && category !== 'all') {
      query += ` AND e.categories LIKE ?`;
      queryParams.push(`%${category}%`);
    }
    // Add maximum price filter if specified
    if (maxPrice) {
        query += ` AND e.full_price_cost <= ?`;
        queryParams.push(parseFloat(maxPrice));
    }
    
    // Group by event and order by date
    query += ` GROUP BY e.event_id ORDER BY e.event_date ASC`;
    
    global.db.all(query, queryParams, (err, events) => {
        if (err) {
            console.error("Error searching events:", err);
            next(err);
        } else {
            // Calculate remaining tickets for each event
            const processedEvents = events.map(event => {
                const fullBooked = parseInt(event.total_full_booked) || 0;
                const concessionBooked = parseInt(event.total_concession_booked) || 0;
                const remainingFull = Math.max(0, (parseInt(event.full_price_tickets) || 0) - fullBooked);
                const remainingConcession = Math.max(0, (parseInt(event.concession_tickets) || 0) - concessionBooked);
                return {
                    ...event,
                    remainingFull: remainingFull,
                    remainingConcession: remainingConcession,
                    totalBooked: fullBooked + concessionBooked
                };
            });
            
            // Return JSON for AJAX requests or render page
            if (format === 'json') {
                res.json({ events: processedEvents });
            } else {
                // Get site settings for page render
                const settingsQuery = "SELECT * FROM site_settings LIMIT 1";
                global.db.get(settingsQuery, (err, settings) => {
                    if (err) {
                        next(err);
                    } else {
                        if (!settings) {
                            settings = {
                                site_name: 'EventFlow',
                                site_description: 'Professional event management made simple'
                            };
                        }
                        // Render attendee home page with search results
                        res.render('attendee-home', {
                            settings: settings,
                            events: processedEvents,
                            searchFilters: {
                                category: category || 'all',
                                minPrice: minPrice || '',
                                maxPrice: maxPrice || '',
                                searchTerm: searchTerm || ''
                            }
                        });
                    }
                });
            }
        }
    });
});

// Track event view for analytics and recommendations
router.post("/track-view", (req, res, next) => {
    const { event_id } = req.body;
    // Validate that event ID is provided
    if (!event_id) {
        return res.status(400).json({ error: "Event ID required" });
    }
    // Insert anonymous view tracking record
    const trackQuery = "INSERT INTO event_views (event_id) VALUES (?)";
    
    global.db.run(trackQuery, [event_id], function(err) {
        if (err) {
            console.error("Error tracking view:", err);
            // Don't fail the request, just log the error
            res.json({ success: true });
        } else {
            res.json({ success: true });
        }
    });
});

// Export the router object so index.js can access it
module.exports = router;